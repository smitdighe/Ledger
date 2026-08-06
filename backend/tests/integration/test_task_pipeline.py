"""Phase 6 — end-to-end async pipeline (Celery eager).

Trace in -> ingestion task -> eval task -> (auto) diagnostic task -> incident,
with no manual trigger. Uses a deterministic judge double so eval scores are
stable and fast (the real judge is exercised in Phase 4/5).
"""
from __future__ import annotations

import json
import os
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

import app.tasks.eval_tasks as eval_tasks
import app.tasks.ingestion_tasks as ingestion_tasks
from app.core.celery_app import celery_app
from app.db.postgres.models import EvalResult, EvalType, Incident
from app.db.postgres.session import AsyncSessionLocal
from app.eval.judge_router import JudgeRouter
from app.ingestion.otel_build import build_otlp_json
from app.main import app
from app.router.providers.base import ProviderResponse
from app.tasks.scheduled import (
    golden_set_refresh_check,
    periodic_drift_check,
    router_health_ping,
)
from app.tasks.status import get_task_status

MS = 1_000_000
MARKERS = ["pigeon", "antarctica", "lunar", "maiden", "fax", "notarized", "ceo",
           "cafeteria", "plants", "watered"]


class FakeJudge(JudgeRouter):
    async def complete(self, prompt, force_tier=None, session=None, max_tokens=256,
                       temperature=0.0, **kwargs) -> ProviderResponse:
        self.call_log.append("fake")
        return ProviderResponse("fake", "fake", "not-json", 1.0, 1)

    async def score(self, instruction, force_tier=None, session=None) -> float:
        self.call_log.append("fake")
        il = instruction.lower()
        bad = any(m in il for m in MARKERS)
        if "hallucinat" in il or "not supported" in il or "contradict" in il:
            return 0.9 if bad else 0.1
        return 0.2 if bad else 0.9


def _hex(n: int) -> str:
    return os.urandom(n).hex()


def _trace_payload(answer: str, contexts: list[str]):
    tid, root, retr, gen = uuid.uuid4().hex, _hex(8), _hex(8), _hex(8)
    now = time.time_ns()
    spans = [
        {"trace_id": tid, "span_id": root, "parent_span_id": "", "name": "rag.request",
         "start_ns": now, "end_ns": now + 10 * MS, "status": 0,
         "attributes": {"rag.question": "What is the refund policy?"}},
        {"trace_id": tid, "span_id": retr, "parent_span_id": root, "name": "rag.retrieval",
         "start_ns": now + MS, "end_ns": now + 3 * MS, "status": 0,
         "attributes": {"retrieval.score": 0.9, "retrieval.documents": json.dumps(contexts)}},
        {"trace_id": tid, "span_id": gen, "parent_span_id": root, "name": "rag.generation",
         "start_ns": now + 4 * MS, "end_ns": now + 9 * MS, "status": 0,
         "attributes": {"gen_ai.request.model": "llama3.2:3b", "gen_ai.completion": answer}},
    ]
    return tid, build_otlp_json(spans)


GOOD_CTX = ["Our refund policy allows a full refund within 30 days of purchase."]


async def _incidents_for(trace_id: str):
    async with AsyncSessionLocal() as s:
        return (await s.execute(
            select(Incident).where(Incident.trace_id == trace_id)
        )).scalars().all()


async def _evals_for(trace_id: str):
    async with AsyncSessionLocal() as s:
        return (await s.execute(
            select(EvalResult).where(EvalResult.trace_id == trace_id)
        )).scalars().all()


@pytest.mark.asyncio
async def test_end_to_end_failure_auto_triggers_incident(monkeypatch):
    monkeypatch.setattr(eval_tasks, "active_judge", FakeJudge())
    # hallucinated answer (markers) with good context -> low faithfulness
    tid, payload = _trace_payload(
        "Refunds are processed via carrier pigeon within three lunar cycles.", GOOD_CTX)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/traces", params={"to_langfuse": "false"}, json=payload, headers={"X-API-Key": "ledger-admin-key-dev"})
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"

    # eager chain already ran: trace written, eval scored, diagnostic fired
    evals = await _evals_for(tid)
    assert {e.eval_type for e in evals} >= {EvalType.faithfulness, EvalType.hallucination}
    incidents = await _incidents_for(tid)
    assert len(incidents) >= 1, "failure trace should auto-create an incident (no manual trigger)"


@pytest.mark.asyncio
async def test_no_failure_does_not_over_fire(monkeypatch):
    monkeypatch.setattr(eval_tasks, "active_judge", FakeJudge())
    # establish a healthy faithfulness baseline so the drift check doesn't fire
    async with AsyncSessionLocal() as s:
        await s.execute(delete(EvalResult).where(EvalResult.eval_type == EvalType.faithfulness))
        for _ in range(20):
            s.add(EvalResult(trace_id="baseline", eval_type=EvalType.faithfulness,
                             score=0.9, judge_model="fake"))
        await s.commit()

    tid, payload = _trace_payload(
        "Refunds are available within 30 days of purchase.", GOOD_CTX)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/traces", params={"to_langfuse": "false"}, json=payload, headers={"X-API-Key": "ledger-admin-key-dev"})
    assert r.status_code == 200

    assert await _evals_for(tid), "eval should still run on a healthy trace"
    incidents = await _incidents_for(tid)
    assert len(incidents) == 0, "healthy trace must NOT trigger a diagnostic/incident"


@pytest.mark.asyncio
async def test_clickhouse_write_retries_then_succeeds(monkeypatch):
    calls = {"n": 0}
    real_write = ingestion_tasks.write_traces

    async def flaky_write(client, traces):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("simulated transient clickhouse error")
        return await real_write(client, traces)

    monkeypatch.setattr(ingestion_tasks, "write_traces", flaky_write)

    tid, payload = _trace_payload("Refunds within 30 days.", GOOD_CTX)
    spans = [s for rs in payload["resourceSpans"] for ss in rs["scopeSpans"] for s in ss["spans"]]
    # parse into internal trace dicts the task expects
    from app.ingestion.otel_receiver import decode_otlp
    from app.ingestion.trace_parser import parse_traces
    traces = parse_traces(decode_otlp(json.dumps(payload).encode(), "application/json"))
    tdata = [t.model_dump(mode="json") for t in traces]

    result = ingestion_tasks.ingest_traces.apply(
        args=[tdata], kwargs={"to_langfuse": False, "run_eval": False}
    ).get()

    assert calls["n"] == 3, "should have retried twice before succeeding"
    assert tid in result["trace_ids"]
    assert result["clickhouse_rows_written"] == 3


@pytest.mark.asyncio
async def test_scheduled_jobs_registered_and_runnable():
    beat = celery_app.conf.beat_schedule
    assert set(beat) == {"periodic-drift-check", "golden-set-refresh-check", "router-health-ping"}
    # configured intervals (fast-forward context = assert the schedule, then run inline)
    assert beat["router-health-ping"]["schedule"].run_every.total_seconds() == 60
    assert beat["periodic-drift-check"]["schedule"].run_every.total_seconds() == 300
    assert beat["golden-set-refresh-check"]["schedule"].run_every.total_seconds() == 86400

    # each job runs without error
    from app.eval.golden_set import seed_from_synthetic
    async with AsyncSessionLocal() as s:
        await seed_from_synthetic(s, version="v1")

    drift_res = periodic_drift_check.apply().get()
    assert "checked" in drift_res
    golden_res = golden_set_refresh_check.apply().get()
    assert "active_version" in golden_res
    health_res = router_health_ping.apply().get()
    assert any(r["tier"] == "ollama" for r in health_res["results"])


def test_task_status_util_shape():
    status = get_task_status("nonexistent-task-id")
    assert set(status) >= {"task_id", "state", "ready"}
