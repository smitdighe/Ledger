"""Eval harness integration tests.

Discrimination (good vs bad) and persistence are validated with a deterministic
judge DOUBLE (FakeJudge) injected into the real runners — this exercises the
full RAGAS/DeepEval -> fallback -> persistence path without depending on the
weak local 3B judge. The no-paid-call test exercises the REAL judge router
(Ollama) and asserts no OpenAI/Anthropic client is ever constructed.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.clickhouse.client import clickhouse_client
from app.db.postgres.models import EvalResult, EvalType
from app.db.postgres.session import AsyncSessionLocal
from app.eval import drift, quality
from app.eval.golden_set import get_active_version, seed_from_synthetic
from app.eval.judge_router import PAID_PROVIDERS, JudgeRouter, judge_router
from app.eval.runner import evaluate_trace
from app.ingestion.otel_build import build_otlp_json
from app.main import app
from app.router.providers.base import ProviderResponse

MS = 1_000_000
HALLUC_MARKERS = ["pigeon", "antarctica", "lunar", "maiden", "fax", "notarized",
                  "ceo", "cafeteria", "plants", "watered"]


class FakeJudge(JudgeRouter):
    """Deterministic, non-paid judge. `complete` returns non-JSON so RAGAS/
    DeepEval structured parsing fails into the runner's fallback `score` path,
    which we make discriminate good vs bad by marker tokens."""

    async def complete(self, prompt, force_tier=None, session=None, max_tokens=256,
                       temperature=0.0, **kwargs) -> ProviderResponse:
        self.call_log.append("fake")
        return ProviderResponse("fake", "fake", "not-json", 1.0, 1)

    async def score(self, instruction, force_tier=None, session=None) -> float:
        self.call_log.append("fake")
        il = instruction.lower()
        bad = any(m in il for m in HALLUC_MARKERS)
        if "hallucinat" in il or "not supported" in il or "contradict" in il:
            return 0.9 if bad else 0.1
        return 0.2 if bad else 0.9


def _hex(n: int) -> str:
    return os.urandom(n).hex()


def _rag_trace(question, answer, contexts):
    tid, root, retr, gen = uuid.uuid4().hex, _hex(8), _hex(8), _hex(8)
    now = time.time_ns()
    import json
    spans = [
        {"trace_id": tid, "span_id": root, "parent_span_id": "", "name": "rag.request",
         "start_ns": now, "end_ns": now + 10 * MS, "status": 0,
         "attributes": {"rag.question": question}},
        {"trace_id": tid, "span_id": retr, "parent_span_id": root, "name": "rag.retrieval",
         "start_ns": now + MS, "end_ns": now + 3 * MS, "status": 0,
         "attributes": {"retrieval.score": 0.9, "retrieval.documents": json.dumps(contexts)}},
        {"trace_id": tid, "span_id": gen, "parent_span_id": root, "name": "rag.generation",
         "start_ns": now + 4 * MS, "end_ns": now + 9 * MS, "status": 0,
         "attributes": {"gen_ai.request.model": "llama3.2:3b", "gen_ai.completion": answer}},
    ]
    return tid, build_otlp_json(spans)


async def _ingest(tid_payload):
    tid, payload = tid_payload
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/traces",
                         params={"to_langfuse": "false", "run_eval": "false"}, json=payload,
                         headers={"X-API-Key": "ledger-admin-key-dev"})
        assert r.status_code == 200, r.text
    return tid


@pytest.mark.asyncio
async def test_eval_discriminates_good_vs_bad():
    fake = FakeJudge()
    good_id = await _ingest(_rag_trace(
        "What is the refund policy?",
        "Refunds are available within 30 days of purchase.",
        ["Our refund policy allows a full refund within 30 days of purchase."],
    ))
    bad_id = await _ingest(_rag_trace(
        "What is the refund policy?",
        "Refunds are processed via carrier pigeon within three lunar cycles.",
        ["Our refund policy allows a full refund within 30 days of purchase."],
    ))

    async with AsyncSessionLocal() as s:
        good = await evaluate_trace(s, clickhouse_client, good_id, judge=fake)
    async with AsyncSessionLocal() as s:
        bad = await evaluate_trace(s, clickhouse_client, bad_id, judge=fake)

    # known-good -> high faithfulness/relevance, low hallucination
    assert good.faithfulness >= 0.7
    assert good.answer_relevance >= 0.7
    assert good.hallucination <= 0.3
    # known-bad (hallucinated) -> low faithfulness/relevance, high hallucination
    assert bad.faithfulness <= 0.4
    assert bad.answer_relevance <= 0.4
    assert bad.hallucination >= 0.7
    # discrimination margin
    assert good.faithfulness - bad.faithfulness >= 0.4
    assert bad.hallucination - good.hallucination >= 0.4

    # persisted EvalResult rows for the good trace (5 metrics)
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(
            select(EvalResult).where(EvalResult.trace_id == good_id)
        )).scalars().all()
    assert {r.eval_type for r in rows} == {
        EvalType.faithfulness, EvalType.retrieval_precision, EvalType.context_recall,
        EvalType.answer_relevance, EvalType.hallucination,
    }
    assert all(r.generator_model == "llama3.2:3b" for r in rows)

    # cleanup ClickHouse
    for tid in (good_id, bad_id):
        await clickhouse_client.execute(
            "ALTER TABLE ledger.traces DELETE WHERE trace_id = {tid:String}", {"tid": tid}
        )


@pytest.mark.asyncio
async def test_golden_set_seed_and_active_version():
    async with AsyncSessionLocal() as s:
        await seed_from_synthetic(s, version="v1")
        active = await get_active_version(s)
        assert active == "v1"


@pytest.mark.asyncio
async def test_drift_flags_degraded_scores():
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as s:
        # degraded faithfulness burst (well below 0.85 baseline)
        for _ in range(25):
            s.add(EvalResult(trace_id=f"d-{tag}", eval_type=EvalType.faithfulness,
                             score=0.30, judge_model="fake", generator_model="llama3.2:3b"))
        # healthy context_recall burst (control)
        for _ in range(25):
            s.add(EvalResult(trace_id=f"h-{tag}", eval_type=EvalType.context_recall,
                             score=0.95, judge_model="fake", generator_model="llama3.2:3b"))
        await s.commit()

    async with AsyncSessionLocal() as s:
        degraded = await drift.detect_drift(s, EvalType.faithfulness, window=20)
        healthy = await drift.detect_drift(s, EvalType.context_recall, window=20)

    assert degraded.drifted is True
    assert degraded.window_mean == pytest.approx(0.30, abs=0.05)
    assert healthy.drifted is False

    # a drift EvalResult with drift_flagged=True was written
    async with AsyncSessionLocal() as s:
        flagged = (await s.execute(
            select(EvalResult).where(
                EvalResult.eval_type == EvalType.drift,
                EvalResult.drift_flagged.is_(True),
            )
        )).scalars().all()
    assert len(flagged) >= 1


@pytest.mark.asyncio
async def test_quality_scores_attribute_to_tier():
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as s:
        for _ in range(10):
            s.add(EvalResult(trace_id=f"q-{tag}", eval_type=EvalType.faithfulness,
                             score=0.95, judge_model="fake", generator_model="groq/llama-3.1-8b"))
        for _ in range(10):
            s.add(EvalResult(trace_id=f"q-{tag}", eval_type=EvalType.faithfulness,
                             score=0.15, judge_model="fake", generator_model="phi4-mini"))
        await s.commit()

    async with AsyncSessionLocal() as s:
        scores = await quality.tier_quality_scores(s, EvalType.faithfulness, window=40)

    assert "groq" in scores and "ollama" in scores
    assert scores["groq"] > scores["ollama"]

    # quality gate: 'high' hint vetoes the low-scoring tier
    from app.router.tiers import default_tiers
    tiers = {t.name: t for t in default_tiers()}
    gate = quality.make_quality_gate({"groq": 0.95, "ollama": 0.15}, min_score=0.5)
    assert gate(tiers["groq"], "high") is True
    assert gate(tiers["ollama"], "high") is False
    assert gate(tiers["ollama"], None) is True  # no hint -> no veto


@pytest.mark.asyncio
async def test_judge_router_never_calls_paid_model(monkeypatch):
    # explode if any OpenAI/Anthropic client is constructed
    import openai
    def boom(*a, **k):
        raise AssertionError("paid LLM client constructed during eval")
    monkeypatch.setattr(openai, "OpenAI", boom, raising=False)
    monkeypatch.setattr(openai, "AsyncOpenAI", boom, raising=False)
    try:
        import anthropic
        monkeypatch.setattr(anthropic, "Anthropic", boom, raising=False)
        monkeypatch.setattr(anthropic, "AsyncAnthropic", boom, raising=False)
    except ImportError:
        pass

    judge_router.reset_log()
    resp = await judge_router.complete("Reply with the single word OK.", max_tokens=8)

    assert resp.provider not in PAID_PROVIDERS
    assert resp.provider in {"cerebras", "groq", "ollama"}
    assert judge_router.call_log and all(p not in PAID_PROVIDERS for p in judge_router.call_log)
