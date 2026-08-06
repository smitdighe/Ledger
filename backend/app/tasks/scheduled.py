"""Scheduled (Celery Beat) jobs — periodic drift, golden-set freshness, health."""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import func, select

from app.core.celery_app import celery_app
from app.db.postgres.models import EvalType, GoldenSetEntry
from app.db.postgres.session import AsyncSessionLocal
from app.eval import drift
from app.eval.golden_set import get_active_version
from app.router.health_check import run_health_checks
from app.tasks._async import run_async

logger = structlog.get_logger(__name__)

GOLDEN_STALE_DAYS = 7
_DRIFT_METRICS = (EvalType.faithfulness, EvalType.answer_relevance)


async def _drift_impl() -> dict:
    results = []
    async with AsyncSessionLocal() as s:
        for metric in _DRIFT_METRICS:
            res = await drift.detect_drift(s, metric, persist=True)
            results.append({"metric": res.metric, "mean": round(res.window_mean, 3),
                            "drifted": res.drifted, "n": res.n})
    drifted = [r["metric"] for r in results if r["drifted"]]
    if drifted:
        logger.warning("scheduled.drift_detected", metrics=drifted, results=results)
    return {"checked": results, "drifted": drifted}


async def _golden_refresh_impl() -> dict:
    async with AsyncSessionLocal() as s:
        version = await get_active_version(s)
        newest = (
            await s.execute(select(func.max(GoldenSetEntry.created_at)))
        ).scalar_one_or_none()
    stale = False
    age_days = None
    if newest is not None:
        age_days = (datetime.now(timezone.utc) - newest).total_seconds() / 86400
        stale = age_days > GOLDEN_STALE_DAYS
    if stale or newest is None:
        logger.warning("scheduled.golden_set_stale", version=version,
                       age_days=age_days, threshold_days=GOLDEN_STALE_DAYS)
    # flag only — never auto-regenerate
    return {"active_version": version, "age_days": age_days, "stale": stale or newest is None}


async def _health_ping_impl() -> dict:
    async with AsyncSessionLocal() as s:
        results = await run_health_checks(s)
    return {"results": results}


@celery_app.task(name="app.tasks.scheduled.periodic_drift_check")
def periodic_drift_check() -> dict:
    try:
        return run_async(_drift_impl())
    except Exception as exc:  # noqa: BLE001
        logger.error("scheduled.drift_check.error", error=str(exc))
        raise


@celery_app.task(name="app.tasks.scheduled.golden_set_refresh_check")
def golden_set_refresh_check() -> dict:
    try:
        return run_async(_golden_refresh_impl())
    except Exception as exc:  # noqa: BLE001
        logger.error("scheduled.golden_refresh.error", error=str(exc))
        raise


@celery_app.task(name="app.tasks.scheduled.router_health_ping")
def router_health_ping() -> dict:
    try:
        return run_async(_health_ping_impl())
    except Exception as exc:  # noqa: BLE001
        logger.error("scheduled.health_ping.error", error=str(exc))
        raise
