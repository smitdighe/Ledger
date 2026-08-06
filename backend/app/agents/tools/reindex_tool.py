"""Reindex tool — STUB.

Real reindex infrastructure is out of scope. This writes a "reindex triggered"
flag + timestamp to Redis so the interface is real and index_diagnostic can read
freshness. Idempotent: repeated calls just refresh the timestamp.
"""
from __future__ import annotations

from datetime import datetime, timezone

import redis.asyncio as aioredis
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

_redis = aioredis.from_url(settings.redis_url, decode_responses=True)


def _key(index_name: str) -> str:
    return f"ledger:index:{index_name}"


async def reindex(index_name: str = "default") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await _redis.hset(
        _key(index_name),
        mapping={"last_reindex": now, "reindex_triggered": "1"},
    )
    logger.warning(
        "tool.reindex.STUB",
        index=index_name,
        note="STUB — no real reindex performed; flag/timestamp written only",
        last_reindex=now,
    )
    return {
        "tool": "reindex",
        "status": "triggered_stub",
        "index": index_name,
        "last_reindex": now,
        "stub": True,
    }


async def get_index_freshness(index_name: str = "default") -> dict:
    data = await _redis.hgetall(_key(index_name))
    last = data.get("last_reindex")
    age_seconds = None
    if last:
        try:
            age_seconds = (
                datetime.now(timezone.utc) - datetime.fromisoformat(last)
            ).total_seconds()
        except ValueError:
            age_seconds = None
    return {
        "index": index_name,
        "last_reindex": last,
        "age_seconds": age_seconds,
        "ever_reindexed": last is not None,
    }
