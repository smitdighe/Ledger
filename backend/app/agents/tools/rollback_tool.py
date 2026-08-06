"""Rollback tool — revert an active PromptVersion to a prior version.

Idempotent: the target version is chosen deterministically from version numbers
(not from current is_active flags), so repeated calls converge to the same state
and never throw.
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.models import PromptVersion
from app.db.postgres.session import AsyncSessionLocal

logger = structlog.get_logger(__name__)


async def rollback(
    prompt_name: str,
    to_version: int | None = None,
    session: AsyncSession | None = None,
) -> dict:
    async def _do(s: AsyncSession) -> dict:
        rows = list(
            (
                await s.execute(
                    select(PromptVersion).where(PromptVersion.prompt_name == prompt_name)
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            return {"tool": "rollback", "status": "noop", "reason": f"no versions for {prompt_name}"}
        if len(rows) == 1:
            return {"tool": "rollback", "status": "noop", "reason": "only one version exists"}

        by_version = sorted(rows, key=lambda r: r.version)
        if to_version is not None:
            target = next((r for r in by_version if r.version == to_version), None)
        else:
            # deterministic: the version immediately below the highest (regressed) one
            target = by_version[-2]
        if target is None:
            return {"tool": "rollback", "status": "noop", "reason": f"version {to_version} not found"}

        already = target.is_active and all(r.is_active == (r.id == target.id) for r in rows)
        for r in rows:
            r.is_active = r.id == target.id
        await s.commit()
        logger.info("tool.rollback", prompt=prompt_name, active_version=target.version, already=already)
        return {
            "tool": "rollback",
            "status": "already_applied" if already else "applied",
            "prompt_name": prompt_name,
            "active_version": target.version,
            "changed": not already,
        }

    if session is not None:
        return await _do(session)
    async with AsyncSessionLocal() as s:
        return await _do(s)
