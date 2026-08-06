"""Eval task — the self-triggering integration point.

Runs Phase 4 RAGAS/DeepEval on a trace, persists EvalResults, then checks the
scores against low-score + drift thresholds. If flagged, enqueues the Phase 5
diagnostic task automatically (ingest -> eval -> diagnose, no manual trigger).
"""
from __future__ import annotations

import structlog

from app.core.celery_app import celery_app
from app.db.clickhouse.client import clickhouse_client
from app.db.postgres.models import EvalType
from app.db.postgres.session import AsyncSessionLocal
from app.eval import drift
from app.eval.judge_router import judge_router
from app.eval.runner import evaluate_trace
from app.tasks._async import run_async

logger = structlog.get_logger(__name__)

# test seam: swap for a deterministic judge in tests
active_judge = judge_router

# per-trace low-score thresholds (a single bad trace worth diagnosing)
LOW_SCORE = 0.5
HIGH_HALLUCINATION = 0.5


def _flag_reasons(report) -> list[str]:
    reasons: list[str] = []
    if report.faithfulness < LOW_SCORE:
        reasons.append("low_faithfulness")
    if report.answer_relevance < LOW_SCORE:
        reasons.append("low_answer_relevance")
    if report.context_precision < LOW_SCORE:
        reasons.append("low_context_precision")
    if report.context_recall < LOW_SCORE:
        reasons.append("low_context_recall")
    if report.hallucination > HIGH_HALLUCINATION:
        reasons.append("high_hallucination")
    return reasons


async def _eval_impl(trace_id: str, auto_diagnose: bool) -> dict:
    async with AsyncSessionLocal() as session:
        report = await evaluate_trace(session, clickhouse_client, trace_id, judge=active_judge)
        # rolling drift check (non-persisting here; the periodic job persists)
        drift_res = await drift.detect_drift(session, EvalType.faithfulness, persist=False)

    reasons = _flag_reasons(report)
    if drift_res.drifted:
        reasons.append("faithfulness_drift")
    flagged = bool(reasons)

    triggered = False
    if flagged and auto_diagnose:
        from app.tasks.diagnostic_tasks import run_diagnostic
        run_diagnostic.delay(trace_id, signal="eval:" + ",".join(reasons))
        triggered = True

    logger.info("task.eval.done", trace_id=trace_id, flagged=flagged, reasons=reasons,
                diagnostic_triggered=triggered, faithfulness=report.faithfulness,
                answer_relevance=report.answer_relevance, hallucination=report.hallucination)
    return {
        "trace_id": trace_id,
        "flagged": flagged,
        "reasons": reasons,
        "diagnostic_triggered": triggered,
        "scores": {
            "faithfulness": report.faithfulness,
            "context_precision": report.context_precision,
            "context_recall": report.context_recall,
            "answer_relevance": report.answer_relevance,
            "hallucination": report.hallucination,
        },
    }


@celery_app.task(name="app.tasks.eval_tasks.eval_trace", bind=True)
def eval_trace(self, trace_id: str, auto_diagnose: bool = True) -> dict:
    try:
        return run_async(_eval_impl(trace_id, auto_diagnose))
    except Exception as exc:  # noqa: BLE001 — isolate: this trace fails, queue continues
        logger.error("task.eval.error", trace_id=trace_id, error=str(exc))
        raise
