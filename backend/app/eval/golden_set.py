"""Golden set management — CRUD + versioning over GoldenSetEntry (Phase 1).

'Active' version = the most recently created version. Seeded from the canonical
synthetic Q/A/context dataset so eval baselines match the synthetic RAG traces.
"""
from __future__ import annotations

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.models import GoldenSetEntry
from app.eval.synthetic_qa import CANONICAL_QA

logger = structlog.get_logger(__name__)


async def add_entry(
    session: AsyncSession,
    query: str,
    expected_answer: str,
    expected_contexts: list[str],
    version: str,
) -> GoldenSetEntry:
    entry = GoldenSetEntry(
        query=query,
        expected_answer=expected_answer,
        expected_contexts=expected_contexts,
        version=version,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def create_version(
    session: AsyncSession, entries: list[dict], version: str
) -> int:
    """Bulk-create a golden set version from [{query, expected_answer, expected_contexts}]."""
    objs = [
        GoldenSetEntry(
            query=e["query"],
            expected_answer=e["expected_answer"],
            expected_contexts=e.get("expected_contexts", []),
            version=version,
        )
        for e in entries
    ]
    session.add_all(objs)
    await session.commit()
    return len(objs)


async def get_version(session: AsyncSession, version: str) -> list[GoldenSetEntry]:
    rows = await session.execute(
        select(GoldenSetEntry).where(GoldenSetEntry.version == version)
    )
    return list(rows.scalars().all())


async def list_versions(session: AsyncSession) -> list[str]:
    rows = await session.execute(select(GoldenSetEntry.version).distinct())
    return sorted({r for r in rows.scalars().all()})


async def get_active_version(session: AsyncSession) -> str | None:
    """Latest version by creation time."""
    row = await session.execute(
        select(GoldenSetEntry.version)
        .order_by(GoldenSetEntry.created_at.desc())
        .limit(1)
    )
    return row.scalar_one_or_none()


async def get_active_entries(session: AsyncSession) -> list[GoldenSetEntry]:
    version = await get_active_version(session)
    return await get_version(session, version) if version else []


async def count_entries(session: AsyncSession, version: str) -> int:
    row = await session.execute(
        select(func.count()).select_from(GoldenSetEntry).where(GoldenSetEntry.version == version)
    )
    return int(row.scalar_one())


async def seed_from_synthetic(session: AsyncSession, version: str = "v1") -> int:
    """Seed a golden set version from the canonical synthetic Q/A dataset.
    Idempotent: skips if the version already has entries."""
    if await count_entries(session, version) > 0:
        logger.info("golden_set.seed_skip", version=version)
        return 0
    entries = [
        {
            "query": qa["question"],
            "expected_answer": qa["answer"],
            "expected_contexts": qa["contexts"],
        }
        for qa in CANONICAL_QA
    ]
    n = await create_version(session, entries, version)
    logger.info("golden_set.seeded", version=version, entries=n)
    return n
