"""Decision node — pick the highest-confidence root cause, or escalate.

Escalates to human review when: no diagnostic produced a candidate, the best
confidence is below threshold, or the top two candidates are different causes
within the ambiguity margin (mixed signal — don't guess).
"""
from __future__ import annotations

import structlog

from app.agents.state import (
    AMBIGUITY_MARGIN,
    AMBIGUITY_MARGIN_CROSS,
    DECISION_CONFIDENCE_THRESHOLD,
    ROOT_CAUSE_BUCKET,
    DiagnosticState,
    new_trail,
)

logger = structlog.get_logger(__name__)


def _bucket(finding: dict) -> str | None:
    return ROOT_CAUSE_BUCKET.get(finding.get("root_cause_candidate"))


async def decision(state: DiagnosticState) -> dict:
    findings = [
        f for f in state.get("findings", [])
        if f.get("confidence", 0) > 0 and f.get("root_cause_candidate")
    ]
    findings.sort(key=lambda f: f["confidence"], reverse=True)

    if not findings:
        summary = "no candidate root cause — needs human review"
        logger.info("node.decision", trace_id=state.get("trace_id"), outcome="no_candidate")
        return {
            "needs_human_review": True,
            "chosen_root_cause": None,
            "chosen_confidence": 0.0,
            "trail": new_trail("decision", summary, reason="no_candidate"),
        }

    best = findings[0]
    runner_up = findings[1] if len(findings) > 1 else None
    # strongest finding from the OTHER failure domain (retrieval vs generation)
    cross = next(
        (f for f in findings[1:] if _bucket(f) and _bucket(f) != _bucket(best)), None
    )

    reason = "selected"
    review = False
    if best["confidence"] < DECISION_CONFIDENCE_THRESHOLD:
        review, reason = True, "low_confidence"
    elif (
        cross
        and cross["confidence"] >= DECISION_CONFIDENCE_THRESHOLD
        and (best["confidence"] - cross["confidence"]) < AMBIGUITY_MARGIN_CROSS
    ):
        # mixed signal across domains — don't guess
        review, reason, runner_up = True, "mixed_signal", cross
    elif (
        runner_up
        and runner_up["root_cause_candidate"] != best["root_cause_candidate"]
        and (best["confidence"] - runner_up["confidence"]) < AMBIGUITY_MARGIN
    ):
        review, reason = True, "ambiguous_tie"

    if review:
        summary = (
            f"escalate ({reason}): best={best['root_cause_candidate']}"
            f"@{best['confidence']:.2f}"
            + (f" vs {runner_up['root_cause_candidate']}@{runner_up['confidence']:.2f}"
               if runner_up else "")
        )
        logger.info("node.decision", trace_id=state.get("trace_id"), outcome=reason)
        return {
            "needs_human_review": True,
            "chosen_root_cause": None,
            "chosen_confidence": best["confidence"],
            "trail": new_trail("decision", summary, reason=reason,
                               best=best, runner_up=runner_up),
        }

    logger.info(
        "node.decision", trace_id=state.get("trace_id"),
        chosen=best["root_cause_candidate"], confidence=best["confidence"],
    )
    return {
        "needs_human_review": False,
        "chosen_root_cause": best["root_cause_candidate"],
        "chosen_confidence": best["confidence"],
        "chosen_finding": best,
        "trail": new_trail(
            "decision",
            f"chose {best['root_cause_candidate']} @ {best['confidence']:.2f}",
            reason=reason, chosen=best,
        ),
    }
