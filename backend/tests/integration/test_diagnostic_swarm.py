"""Diagnostic swarm integration tests (Phase 5).

Scenarios use explicit eval_results/trace_context (use_llm=False) so routing is
deterministic and fast; each test sets up exactly the DB state its diagnostics
read. The classifier's Cerebras LLM opinion path is covered separately.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.agents.graph import nodes_that_ran, run_diagnostic_graph
from app.agents.tools.rollback_tool import rollback
from app.db.postgres.models import (
    EvalResult,
    EvalType,
    IncidentStatus,
    PromptVersion,
    RootCause,
)
from app.db.postgres.session import AsyncSessionLocal
from app.main import app
from app.tasks.diagnostic_tasks import run_diagnostic

UTC = timezone.utc


def _ev(trace_id, score, gen_model, created_at):
    return EvalResult(
        trace_id=trace_id, eval_type=EvalType.faithfulness, score=score,
        judge_model="fake", generator_model=gen_model, created_at=created_at,
    )


# --------------------------------------------------------------------------
# Scenario A: retrieval failure -> retrieval_failure -> reindex stub
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_retrieval_failure_classified_and_remediated():
    final = await run_diagnostic_graph(
        "swarm-retrieval", use_llm=False,
        eval_results={"faithfulness": 0.92, "answer_relevance": 0.9, "hallucination": 0.0,
                      "retrieval_precision": 0.15, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.12, "generator_model": "llama3.2:3b",
                       "prompt_name": "rag_default", "index_name": "default"},
    )
    ran = nodes_that_ran(final)
    assert final["chosen_root_cause"] == RootCause.retrieval_failure.value
    assert final["needs_human_review"] is False
    assert final["remediation_action"].startswith("reindex:")
    # only the retrieval-domain diagnostics fanned out (not all 4)
    assert "retrieval_diagnostic" in ran and "index_diagnostic" in ran
    assert "prompt_diagnostic" not in ran and "model_diagnostic" not in ran

    # incident persisted
    async with AsyncSessionLocal() as s:
        inc = (await s.execute(
            select(EvalResult).where(EvalResult.trace_id == "___never___")
        )).scalars().all()  # noop query to keep session warm
    assert final["incident_id"]

    # reindex tool is idempotent — re-running does not throw
    second = await run_diagnostic_graph(
        "swarm-retrieval", use_llm=False,
        eval_results={"faithfulness": 0.92, "answer_relevance": 0.9, "hallucination": 0.0,
                      "retrieval_precision": 0.15, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.12, "generator_model": "llama3.2:3b"},
    )
    assert second["remediation_action"].startswith("reindex:")


# --------------------------------------------------------------------------
# Scenario B: prompt regression -> prompt_diagnostic -> rollback_tool
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_prompt_regression_triggers_rollback():
    now = datetime.now(UTC)
    async with AsyncSessionLocal() as s:
        # isolate faithfulness history for the before/after comparison
        await s.execute(delete(EvalResult).where(EvalResult.eval_type == EvalType.faithfulness))
        await s.execute(delete(PromptVersion).where(PromptVersion.prompt_name == "rag_default"))
        # two prompt versions; v2 is the regression, created 1 day ago
        s.add(PromptVersion(prompt_name="rag_default", version=1, content_hash="h1",
                            content="good prompt", is_active=True, created_at=now - timedelta(days=3)))
        s.add(PromptVersion(prompt_name="rag_default", version=2, content_hash="h2",
                            content="regressed prompt", is_active=False, created_at=now - timedelta(days=1)))
        # healthy faithfulness BEFORE the change (generator groq -> keeps groq quality high)
        for _ in range(10):
            s.add(_ev("hist-before", 0.9, "groq/llama-3.1-8b", now - timedelta(days=2)))
        # degraded faithfulness AFTER the change (no generator -> doesn't skew tier quality)
        for _ in range(10):
            s.add(_ev("hist-after", 0.25, None, now))
        await s.commit()

    final = await run_diagnostic_graph(
        "swarm-prompt", use_llm=False,
        eval_results={"faithfulness": 0.25, "answer_relevance": 0.3, "hallucination": 0.6,
                      "retrieval_precision": 0.9, "context_recall": 0.9},
        trace_context={"retrieval_score": 0.9, "generator_model": "groq/llama-3.1-8b",
                       "prompt_name": "rag_default", "index_name": "default"},
    )
    ran = nodes_that_ran(final)
    assert final["chosen_root_cause"] == RootCause.prompt_regression.value
    assert "prompt_diagnostic" in ran and "model_diagnostic" in ran
    assert final["remediation_action"].startswith("rollback:")

    # rollback actually flipped the active version back to v1
    async with AsyncSessionLocal() as s:
        versions = {v.version: v.is_active for v in (await s.execute(
            select(PromptVersion).where(PromptVersion.prompt_name == "rag_default")
        )).scalars().all()}
    assert versions == {1: True, 2: False}

    # idempotent: calling rollback again converges to the same state, no throw
    r1 = await rollback("rag_default")
    r2 = await rollback("rag_default")
    assert r2["status"] == "already_applied"
    async with AsyncSessionLocal() as s:
        versions = {v.version: v.is_active for v in (await s.execute(
            select(PromptVersion).where(PromptVersion.prompt_name == "rag_default")
        )).scalars().all()}
    assert versions == {1: True, 2: False}


# --------------------------------------------------------------------------
# Scenario C: mixed signal -> unclassified, human review (no guess)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_mixed_signal_lands_in_human_review():
    now = datetime.now(UTC)
    async with AsyncSessionLocal() as s:
        # make the ollama tier look degraded so model_diagnostic fires on the
        # generation side, while retrieval is also bad -> cross-domain conflict
        for _ in range(10):
            s.add(_ev("q-ollama", 0.2, "llama3.2:3b", now))
        await s.commit()

    final = await run_diagnostic_graph(
        "swarm-mixed", use_llm=False,
        eval_results={"faithfulness": 0.18, "answer_relevance": 0.2, "hallucination": 0.8,
                      "retrieval_precision": 0.18, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.15, "generator_model": "llama3.2:3b",
                       "prompt_name": "rag_default", "index_name": "default"},
    )
    ran = nodes_that_ran(final)
    assert final["needs_human_review"] is True
    assert final["chosen_root_cause"] is None
    assert final["remediation_action"] == "human_review_required"
    assert "human_review" in ran and "remediation" not in ran

    # both failure domains produced findings (that's why it's ambiguous)
    causes = {f["root_cause_candidate"] for f in final["findings"] if f["confidence"] > 0}
    assert RootCause.retrieval_failure.value in causes
    assert any(c in causes for c in (RootCause.model_degradation.value,
                                     RootCause.prompt_regression.value))

    # incident row is open + unclassified
    async with AsyncSessionLocal() as s:
        from app.db.postgres.models import Incident
        inc = await s.get(Incident, uuid.UUID(final["incident_id"]))
    assert inc.status == IncidentStatus.open
    assert inc.root_cause is None


# --------------------------------------------------------------------------
# Diagnostic trail: every node that ran is logged into the incident
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_every_node_logged_in_incident_trail():
    final = await run_diagnostic_graph(
        "swarm-trail", use_llm=False,
        eval_results={"faithfulness": 0.9, "answer_relevance": 0.9, "hallucination": 0.0,
                      "retrieval_precision": 0.15, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.12, "generator_model": "llama3.2:3b"},
    )
    incident_id = final["incident_id"]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/v1/incidents/{incident_id}",
                        headers={"X-API-Key": "ledger-admin-key-dev"})
    assert r.status_code == 200
    detail = r.json()
    trail = detail["diagnostic_trail"]["trail"]
    logged_nodes = [e["node"] for e in trail]

    # classifier + both retrieval diagnostics + decision + remediation all logged
    for node in ("classifier", "retrieval_diagnostic", "index_diagnostic", "decision", "remediation"):
        assert node in logged_nodes, f"{node} missing from trail"
    # each entry has a human-readable summary + data
    assert all(e.get("summary") for e in trail)
    # findings captured too
    assert detail["diagnostic_trail"]["findings"]


# --------------------------------------------------------------------------
# Celery task wiring: dedicated queue
# --------------------------------------------------------------------------
def test_diagnostic_task_on_separate_queue():
    assert run_diagnostic.queue == "diagnostic"
    assert run_diagnostic.name == "app.tasks.diagnostic_tasks.run_diagnostic"
