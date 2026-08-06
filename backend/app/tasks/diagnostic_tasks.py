"""Celery task that runs the diagnostic swarm off the request/eval path.

Dispatched (queue='diagnostic') when drift detection or a low eval score flags a
trace, so the graph runs asynchronously without blocking ingestion/eval.
"""
from __future__ import annotations

import structlog

from app.agents.graph import run_diagnostic_graph
from app.core.celery_app import celery_app
from app.tasks._async import run_async

logger = structlog.get_logger(__name__)


@celery_app.task(
    name="app.tasks.diagnostic_tasks.run_diagnostic",
    queue="diagnostic",
    bind=True,
    max_retries=2,
    default_retry_delay=5,
)
def run_diagnostic(self, trace_id: str, signal: str = "eval_flag", use_llm: bool = False) -> dict:
    """Invoke the diagnostic graph for a trace. Isolated per-trace: a failure
    here retries/records but does not affect other traces."""
    try:
        final = run_async(run_diagnostic_graph(trace_id, signal=signal, use_llm=use_llm))
    except Exception as exc:  # noqa: BLE001
        logger.error("task.run_diagnostic.error", trace_id=trace_id, signal=signal, error=str(exc))
        raise self.retry(exc=exc)
    logger.info("task.run_diagnostic.done", trace_id=trace_id,
                incident_id=final.get("incident_id"),
                root_cause=final.get("chosen_root_cause"),
                needs_human_review=final.get("needs_human_review", False))
    return {
        "trace_id": trace_id,
        "incident_id": final.get("incident_id"),
        "chosen_root_cause": final.get("chosen_root_cause"),
        "chosen_confidence": final.get("chosen_confidence"),
        "needs_human_review": final.get("needs_human_review", False),
        "remediation_action": final.get("remediation_action"),
    }
