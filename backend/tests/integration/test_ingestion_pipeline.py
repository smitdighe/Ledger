"""End-to-end ingestion test: OTLP -> POST /traces -> ClickHouse (+ Langfuse).

Verifies parent-child structure, duration calc, LLM attribute extraction, and
a Langfuse round-trip.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.clickhouse.client import clickhouse_client
from app.ingestion.langfuse_client import langfuse_ingestor
from app.ingestion.otel_build import build_otlp_json
from app.main import app

MS = 1_000_000  # ns per ms


def _hex(n: int) -> str:
    return os.urandom(n).hex()


def _build_trace():
    trace_id = uuid.uuid4().hex
    root, retr, gen = _hex(8), _hex(8), _hex(8)
    now = time.time_ns()

    root_start = now
    retr_start = now + 1 * MS
    retr_end = retr_start + 120 * MS
    gen_start = retr_end + 1 * MS
    gen_end = gen_start + 540 * MS
    root_end = gen_end + 1 * MS

    spans = [
        {
            "trace_id": trace_id, "span_id": root, "parent_span_id": "",
            "name": "rag.request", "start_ns": root_start, "end_ns": root_end,
            "status": 0, "attributes": {"rag.question": "what is the refund policy?"},
        },
        {
            "trace_id": trace_id, "span_id": retr, "parent_span_id": root,
            "name": "rag.retrieval", "start_ns": retr_start, "end_ns": retr_end,
            "status": 0, "attributes": {"retrieval.score": 0.91, "retrieval.num_docs": 5},
        },
        {
            "trace_id": trace_id, "span_id": gen, "parent_span_id": root,
            "name": "rag.generation", "start_ns": gen_start, "end_ns": gen_end,
            "status": 0,
            "attributes": {
                "gen_ai.request.model": "phi4-mini",
                "gen_ai.prompt": "context + question",
                "gen_ai.completion": "Refunds within 30 days.",
                "gen_ai.usage.input_tokens": 512,
                "gen_ai.usage.output_tokens": 24,
                "gen_ai.usage.total_tokens": 536,
            },
        },
    ]
    return trace_id, root, spans


@pytest.mark.asyncio
async def test_otlp_ingestion_to_clickhouse_and_langfuse():
    trace_id, root_id, spans = _build_trace()
    payload = build_otlp_json(spans)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # POST OTLP/JSON — write path is enqueued (eager in tests, runs inline)
        post = await client.post("/api/v1/traces", params={"run_eval": "false"}, json=payload,
                                 headers={"X-API-Key": "ledger-admin-key-dev"})
        assert post.status_code == 200, post.text
        body = post.json()
        assert body["status"] == "accepted"
        assert body["accepted_spans"] == 3
        assert body["task_id"]
        assert trace_id in body["trace_ids"]

        # GET back from ClickHouse (eager write already completed)
        got = await client.get(f"/api/v1/traces/{trace_id}",
                               headers={"X-API-Key": "ledger-admin-key-dev"})
        assert got.status_code == 200, got.text
        result = got.json()
        assert result["span_count"] == 3

    spans_by_name = {s["name"]: s for s in result["spans"]}

    # parent-child structure preserved
    assert spans_by_name["rag.retrieval"]["parent_span_id"] == root_id
    assert spans_by_name["rag.generation"]["parent_span_id"] == root_id
    assert spans_by_name["rag.request"]["parent_span_id"] == ""

    # duration calculation
    assert spans_by_name["rag.retrieval"]["duration_ms"] == pytest.approx(120.0)
    assert spans_by_name["rag.generation"]["duration_ms"] == pytest.approx(540.0)

    # LLM attribute extraction (gen_ai.* landed in attributes map)
    gen_attrs = spans_by_name["rag.generation"]["attributes"]
    assert gen_attrs["gen_ai.request.model"] == "phi4-mini"
    assert gen_attrs["gen_ai.usage.total_tokens"] == "536"

    # Langfuse round-trip (worker is async — poll for the processed trace)
    lf_trace = None
    for _ in range(20):
        try:
            candidate = langfuse_ingestor.pull_trace(trace_id)
            if candidate and getattr(candidate, "observations", None):
                lf_trace = candidate
                break
        except Exception:
            pass
        await asyncio.sleep(1.5)

    assert lf_trace is not None, "trace did not round-trip through Langfuse in time"
    obs_names = {o.name for o in lf_trace.observations}
    assert {"rag.request", "rag.retrieval", "rag.generation"} <= obs_names

    # cleanup ClickHouse
    await clickhouse_client.execute(
        "ALTER TABLE ledger.traces DELETE WHERE trace_id = {tid:String}",
        {"tid": trace_id},
    )
    await clickhouse_client.close()
