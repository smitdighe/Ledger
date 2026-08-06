"""Provider health probes + shared health state (Redis) + persistence (Postgres).

`run_health_checks` probes every provider, caches the live result in Redis (so
the selector and other processes can route around a dead provider), and writes
latency/last-check back to RouterConfig.
"""
from __future__ import annotations

from datetime import datetime, timezone

import redis.asyncio as aioredis
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.postgres.models import RouterConfig
from app.router.tiers import TierSpec, get_tiers

logger = structlog.get_logger(__name__)

_redis = aioredis.from_url(settings.redis_url, decode_responses=True)
_HEALTH_TTL = 120  # seconds; a probe result is trusted this long


def _health_key(name: str) -> str:
    return f"ledger:health:{name}"


async def set_health(name: str, ok: bool) -> None:
    await _redis.set(_health_key(name), "1" if ok else "0", ex=_HEALTH_TTL)


async def get_health(name: str) -> bool | None:
    """True/False from last probe, or None if unknown/expired (optimistic)."""
    v = await _redis.get(_health_key(name))
    if v is None:
        return None
    return v == "1"


async def probe(spec: TierSpec) -> tuple[bool, float | None]:
    if not spec.provider.available:
        return False, None
    try:
        return await spec.provider.health()
    except Exception as exc:  # noqa: BLE001
        logger.warning("health.probe_error", provider=spec.name, error=str(exc))
        return False, None


async def run_health_checks(session: AsyncSession) -> list[dict]:
    """Probe all providers, cache in Redis, persist to RouterConfig."""
    tiers = await get_tiers(session)
    rows = {
        r.tier_name: r
        for r in (await session.execute(select(RouterConfig))).scalars().all()
    }
    results: list[dict] = []
    for spec in tiers:
        ok, latency = await probe(spec)
        await set_health(spec.name, ok)
        row = rows.get(spec.name)
        if row is not None:
            row.last_health_check = datetime.now(timezone.utc)
            row.last_latency_ms = latency
        results.append(
            {
                "tier": spec.name,
                "available": spec.provider.available,
                "healthy": ok,
                "latency_ms": round(latency, 1) if latency is not None else None,
            }
        )
    await session.commit()
    return results
