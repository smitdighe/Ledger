"""Prompt diagnostic — does a recent PromptVersion change correlate with the
eval-score drop? Compares faithfulness before vs after the latest version's
created_at.
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.state import PROMPT_REGRESSION, Finding, DiagnosticState, new_trail
from app.db.postgres.models import EvalResult, EvalType, PromptVersion
from app.db.postgres.session import AsyncSessionLocal

logger = structlog.get_logger(__name__)

_DROP_THRESHOLD = 0.15
_BASELINE = 0.85


async def _mean_faithfulness(s: AsyncSession, before, cutoff, after: bool) -> float | None:
    stmt = select(EvalResult.score).where(EvalResult.eval_type == EvalType.faithfulness)
    stmt = stmt.where(EvalResult.created_at >= cutoff) if after else stmt.where(
        EvalResult.created_at < cutoff
    )
    scores = [float(x) for x in (await s.execute(stmt)).scalars().all()]
    return sum(scores) / len(scores) if scores else None


async def prompt_diagnostic(state: DiagnosticState) -> dict:
    tc = state.get("trace_context", {})
    ev = state.get("eval_results", {})
    prompt_name = tc.get("prompt_name", "rag_default")

    async with AsyncSessionLocal() as s:
        versions = list(
            (
                await s.execute(
                    select(PromptVersion)
                    .where(PromptVersion.prompt_name == prompt_name)
                    .order_by(PromptVersion.version)
                )
            )
            .scalars()
            .all()
        )
        if len(versions) < 2:
            evidence = {"prompt_name": prompt_name, "versions": len(versions),
                        "reason": "no recent prompt change to correlate"}
            finding = Finding(node="prompt_diagnostic", root_cause_candidate=None,
                              confidence=0.0, supporting_evidence=evidence)
            return {
                "findings": [finding],
                "trail": new_trail("prompt_diagnostic", "no correlating prompt change", **evidence),
            }

        latest = versions[-1]
        previous = versions[-2]
        cutoff = latest.created_at

        before_avg = await _mean_faithfulness(s, None, cutoff, after=False)
        after_avg = await _mean_faithfulness(s, None, cutoff, after=True)

    before_avg = _BASELINE if before_avg is None else before_avg
    after_avg = ev.get("faithfulness", _BASELINE) if after_avg is None else after_avg
    drop = round(before_avg - after_avg, 3)

    if drop > _DROP_THRESHOLD:
        confidence = round(min(1.0, 0.5 + drop), 3)
    else:
        confidence = 0.0

    evidence = {
        "prompt_name": prompt_name,
        "regressed_version": latest.version,
        "previous_version": previous.version,
        "changed_at": cutoff.isoformat() if cutoff else None,
        "faithfulness_before": round(before_avg, 3),
        "faithfulness_after": round(after_avg, 3),
        "drop": drop,
    }
    finding = Finding(
        node="prompt_diagnostic",
        root_cause_candidate=PROMPT_REGRESSION if confidence > 0 else None,
        confidence=confidence,
        supporting_evidence=evidence,
    )
    logger.info("node.prompt_diagnostic", trace_id=state.get("trace_id"), confidence=confidence, **evidence)
    return {
        "findings": [finding],
        "trail": new_trail(
            "prompt_diagnostic",
            f"prompt_regression confidence={confidence:.2f} (drop={drop} after v{latest.version})",
            **evidence,
        ),
    }
