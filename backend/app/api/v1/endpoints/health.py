"""Health / observability endpoints."""
from __future__ import annotations

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import QUEUES, celery_app
from app.core.config import settings
from app.core.security import require_admin
from app.db.clickhouse.client import clickhouse_client
from app.db.postgres.models import RouterConfig
from app.db.postgres.session import get_session
from app.router.health_check import get_health
from app.router.tiers import get_tiers

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["health"])

_redis = aioredis.from_url(settings.redis_url, decode_responses=True)


@router.get("/health", summary="Liveness probe",
            description="Basic liveness check. Unauthenticated — safe for load balancers.")
async def health() -> dict:
    return {"status": "ok", "env": settings.app_env}


@router.get("/health/tiers", summary="Per-provider router health",
            description="Cached liveness + latency per router tier (Phase 3). Admin only.")
async def health_tiers(
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    tiers = await get_tiers(session)
    rows = {
        r.tier_name: r
        for r in (await session.execute(select(RouterConfig))).scalars().all()
    }
    out = []
    for spec in tiers:
        row = rows.get(spec.name)
        out.append({
            "tier": spec.name,
            "available": spec.provider.available,
            "cached_health": await get_health(spec.name),
            "last_health_check": row.last_health_check.isoformat() if row and row.last_health_check else None,
            "last_latency_ms": row.last_latency_ms if row else None,
        })
    return {"tiers": out}


@router.get("/health/queues", summary="Celery queue depth + workers",
            description="Backlog per queue and live worker status (Phase 6). Admin only. "
                        "`ready` is the broker list depth (messages not yet prefetched); with "
                        "prefetch/acks_late most backlog shows up as `reserved`/`active` in-flight, "
                        "not in `ready` — so both are reported.")
async def health_queues(_: set = Depends(require_admin)) -> dict:
    ready = {}
    for q in QUEUES:
        try:
            ready[q] = await _redis.llen(q)
        except Exception as exc:  # noqa: BLE001
            ready[q] = f"error: {exc}"

    active_total = reserved_total = 0
    workers: dict = {}
    try:
        insp = celery_app.control.inspect(timeout=0.5)
        ping = insp.ping() or {}
        active = insp.active() or {}
        reserved = insp.reserved() or {}
        for w in ping:
            a, r = len(active.get(w, [])), len(reserved.get(w, []))
            active_total += a
            reserved_total += r
            workers[w] = {"ok": True, "active": a, "reserved": r}
    except Exception as exc:  # noqa: BLE001
        logger.warning("health.queues.inspect_failed", error=str(exc))

    return {
        "ready_by_queue": ready,
        "in_flight": {"active": active_total, "reserved": reserved_total},
        "workers": workers,
        "worker_count": len(workers),
    }


@router.get("/health/db", summary="Database connectivity",
            description="Postgres + ClickHouse connectivity check. Admin only.")
async def health_db(
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = {}
    try:
        await session.execute(select(1))
        result["postgres"] = "ok"
    except Exception as exc:  # noqa: BLE001
        result["postgres"] = f"error: {exc}"
    try:
        r = await clickhouse_client.execute("SELECT 1")
        result["clickhouse"] = "ok" if r.result_rows else "empty"
    except Exception as exc:  # noqa: BLE001
        result["clickhouse"] = f"error: {exc}"
    healthy = all(v == "ok" for v in result.values())
    return {"status": "ok" if healthy else "degraded", "checks": result}
