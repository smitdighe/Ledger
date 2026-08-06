"""Retrieval diagnostic — retrieval precision, context relevance/recall signals."""
from __future__ import annotations

import structlog

from app.agents.state import RETRIEVAL_FAILURE, Finding, DiagnosticState, new_trail

logger = structlog.get_logger(__name__)


async def retrieval_diagnostic(state: DiagnosticState) -> dict:
    ev = state.get("eval_results", {})
    tc = state.get("trace_context", {})

    precision = ev.get("retrieval_precision", 1.0)
    recall = ev.get("context_recall", 1.0)
    rscore = tc.get("retrieval_score")
    rscore = 1.0 if rscore is None else rscore

    worst = min(precision, recall, rscore)
    # confidence in retrieval_failure grows as the worst retrieval signal drops
    confidence = round(max(0.0, 1.0 - worst), 3)

    evidence = {
        "retrieval_precision": precision,
        "context_recall": recall,
        "retrieval_score": rscore,
        "weakest_signal": round(worst, 3),
    }
    finding = Finding(
        node="retrieval_diagnostic",
        root_cause_candidate=RETRIEVAL_FAILURE if confidence > 0 else None,
        confidence=confidence,
        supporting_evidence=evidence,
    )
    logger.info("node.retrieval_diagnostic", trace_id=state.get("trace_id"), confidence=confidence, **evidence)
    return {
        "findings": [finding],
        "trail": new_trail(
            "retrieval_diagnostic",
            f"retrieval_failure confidence={confidence:.2f} (weakest={worst:.2f})",
            **evidence,
        ),
    }
