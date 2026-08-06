"""Drift detection — rolling live eval scores vs golden baseline.

Compares the mean of the last N EvalResults for a metric against a baseline
(the score the golden set expects). Flags drift when the mean degrades beyond a
threshold, and records a `drift` EvalResult (drift_flagged set accordingly).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.models import EvalResult, EvalType
from app.eval.golden_set import get_active_version

logger = structlog.get_logger(__name__)

# baseline = score the golden set expects for a healthy pipeline.
DEFAULT_BASELINE: dict[EvalType, float] = {
    EvalType.faithfulness: 0.85,
    EvalType.retrieval_precision: 0.80,
    EvalType.context_recall: 0.80,
    EvalType.answer_relevance: 0.85,
    EvalType.hallucination: 0.20,  # LOWER is better; drift = mean rises above baseline
}
DEFAULT_THRESHOLD = 0.15
DEFAULT_WINDOW = 20


@dataclass
class DriftResult:
    metric: str
    window_mean: float
    baseline: float
    threshold: float
    drifted: bool
    n: int
    golden_set_version: str | None
    higher_is_worse: bool


async def detect_drift(
    session: AsyncSession,
    metric: EvalType,
    window: int = DEFAULT_WINDOW,
    minutes: int | None = None,
    threshold: float = DEFAULT_THRESHOLD,
    baseline: float | None = None,
    persist: bool = True,
) -> DriftResult:
    stmt = (
        select(EvalResult.score)
        .where(EvalResult.eval_type == metric)
        .order_by(EvalResult.created_at.desc())
    )
    if minutes is not None:
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        stmt = stmt.where(EvalResult.created_at >= since)
    else:
        stmt = stmt.limit(window)

    scores = [float(s) for s in (await session.execute(stmt)).scalars().all()]
    n = len(scores)
    window_mean = sum(scores) / n if n else 0.0

    base = DEFAULT_BASELINE[metric] if baseline is None else baseline
    higher_is_worse = metric == EvalType.hallucination

    if higher_is_worse:
        drifted = n > 0 and (window_mean - base) > threshold
    else:
        drifted = n > 0 and (base - window_mean) > threshold

    golden_version = await get_active_version(session)

    if persist:
        session.add(
            EvalResult(
                trace_id=f"drift:{metric.value}",
                eval_type=EvalType.drift,
                score=window_mean,
                judge_model="drift-detector",
                golden_set_version=golden_version,
                drift_flagged=drifted,
            )
        )
        await session.commit()

    result = DriftResult(
        metric=metric.value,
        window_mean=window_mean,
        baseline=base,
        threshold=threshold,
        drifted=drifted,
        n=n,
        golden_set_version=golden_version,
        higher_is_worse=higher_is_worse,
    )
    logger.info("eval.drift_checked", **result.__dict__)
    return result
