"""Wire eval scores back into the router's stubbed `quality_hint`.

`tier_quality_scores` returns a live per-tier quality score: the rolling average
of recent EvalResult scores for the tier whose model GENERATED the response
(generator_model, distinct from the judge tier). The selector can then prefer
higher-quality tiers via a quality gate.
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.models import EvalResult, EvalType
from app.router.tiers import TierSpec

logger = structlog.get_logger(__name__)


def model_to_tier(model: str | None) -> str | None:
    if not model:
        return None
    m = model.lower()
    if "gemini" in m:
        return "gemini"
    if "groq" in m:
        return "groq"
    if "cerebras" in m:
        return "cerebras"
    # local ollama models (llama3.2:3b, phi4-mini, ...)
    if "llama" in m or "phi" in m or ":" in m:
        return "ollama"
    return None


async def tier_quality_scores(
    session: AsyncSession,
    metric: EvalType = EvalType.faithfulness,
    window: int = 200,
) -> dict[str, float]:
    rows = await session.execute(
        select(EvalResult.generator_model, EvalResult.score)
        .where(EvalResult.eval_type == metric, EvalResult.generator_model.isnot(None))
        .order_by(EvalResult.created_at.desc())
        .limit(window)
    )
    buckets: dict[str, list[float]] = {}
    for gen_model, score in rows.all():
        tier = model_to_tier(gen_model)
        if tier is None:
            continue
        buckets.setdefault(tier, []).append(float(score))
    return {tier: sum(v) / len(v) for tier, v in buckets.items() if v}


def make_quality_gate(scores: dict[str, float], min_score: float = 0.5):
    """Build a selector quality_gate. Only vetoes when the caller signals a
    quality preference via quality_hint == 'high'; unknown tiers pass (optimistic)."""

    def gate(spec: TierSpec, hint: str | None) -> bool:
        if hint != "high":
            return True
        score = scores.get(spec.name)
        if score is None:
            return True
        return score >= min_score

    return gate


async def apply_live_quality_gate(
    router,
    session: AsyncSession,
    metric: EvalType = EvalType.faithfulness,
    min_score: float = 0.5,
) -> dict[str, float]:
    """Fetch live tier scores and install a quality gate on the router."""
    scores = await tier_quality_scores(session, metric)
    router.quality_gate = make_quality_gate(scores, min_score)
    logger.info("eval.quality_gate_applied", scores=scores, min_score=min_score)
    return scores
