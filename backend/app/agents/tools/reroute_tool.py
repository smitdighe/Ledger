"""Reroute tool — disable/deprioritize a router tier in RouterConfig.

Idempotent: disabling an already-disabled tier is a no-op that does not throw.
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.models import RouterConfig
from app.db.postgres.session import AsyncSessionLocal

logger = structlog.get_logger(__name__)

_DEPRIORITIZED = 999


async def reroute(
    tier_name: str, session: AsyncSession | None = None, disable: bool = True
) -> dict:
    async def _do(s: AsyncSession) -> dict:
        row = (
            await s.execute(select(RouterConfig).where(RouterConfig.tier_name == tier_name))
        ).scalar_one_or_none()
        if row is None:
            return {"tool": "reroute", "status": "noop", "reason": f"tier {tier_name} not found"}

        before_enabled = row.is_enabled
        before_priority = row.priority_order
        if disable:
            row.is_enabled = False
            row.priority_order = _DEPRIORITIZED
        else:
            row.is_enabled = True
        await s.commit()
        changed = (before_enabled != row.is_enabled) or (before_priority != row.priority_order)
        logger.info("tool.reroute", tier=tier_name, is_enabled=row.is_enabled, changed=changed)
        return {
            "tool": "reroute",
            "status": "applied" if changed else "already_applied",
            "tier": tier_name,
            "is_enabled": row.is_enabled,
            "priority_order": row.priority_order,
            "changed": changed,
        }

    if session is not None:
        return await _do(session)
    async with AsyncSessionLocal() as s:
        return await _do(s)
