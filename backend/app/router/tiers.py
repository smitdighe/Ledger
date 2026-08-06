"""Tier definitions: name -> provider -> role/purpose, priority + quota limits.

Enabled/priority state is persisted in the RouterConfig table (Phase 1) and
merged over these code defaults at load time.

Free-tier quota numbers below are current best-known values (2025) and are the
ones to confirm — see the Phase 3 report. They live here so they're easy to tune.
"""
from __future__ import annotations

from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.models import RouterConfig
from app.router.providers.base import BaseProvider
from app.router.providers.cerebras import CerebrasProvider
from app.router.providers.gemini import GeminiProvider
from app.router.providers.groq import GroqProvider
from app.router.providers.ollama import OllamaProvider

logger = structlog.get_logger(__name__)


@dataclass
class TierSpec:
    name: str
    provider: BaseProvider
    role: str
    priority: int          # lower = higher priority
    rpm: int               # requests / minute (token bucket capacity)
    rpd: int | None = None  # requests / day (daily quota), None = unlimited
    enabled: bool = True
    is_floor: bool = False  # guaranteed last-resort tier (no rate limiting)


def default_tiers() -> list[TierSpec]:
    return [
        TierSpec(
            name="cerebras",
            provider=CerebrasProvider(),
            role="low-latency root-cause triage / sub-second classification",
            priority=1,
            rpm=30,
            rpd=14_400,
        ),
        TierSpec(
            name="groq",
            provider=GroqProvider(),
            role="fast high-throughput general inference",
            priority=2,
            rpm=30,
            rpd=14_400,
        ),
        TierSpec(
            name="gemini",
            provider=GeminiProvider(),
            role="cross-validation / secondary judge",
            priority=3,
            rpm=15,
            rpd=1_500,
        ),
        TierSpec(
            name="ollama",
            provider=OllamaProvider(),
            role="zero-cost, zero-rate-limit local fallback (guaranteed floor)",
            priority=4,
            rpm=100_000,   # effectively unlimited
            rpd=None,
            is_floor=True,
        ),
    ]


async def ensure_seeded(session: AsyncSession) -> None:
    """Insert a RouterConfig row per default tier if the table is empty of it."""
    existing = {
        r.tier_name
        for r in (await session.execute(select(RouterConfig))).scalars().all()
    }
    added = False
    for spec in default_tiers():
        if spec.name in existing:
            continue
        session.add(
            RouterConfig(
                tier_name=spec.name,
                provider=spec.name,
                priority_order=spec.priority,
                is_enabled=True,
            )
        )
        added = True
    if added:
        await session.commit()


async def get_tiers(session: AsyncSession | None = None) -> list[TierSpec]:
    """Return tiers ordered by priority, with enabled/priority merged from DB."""
    tiers = default_tiers()
    if session is not None:
        await ensure_seeded(session)
        rows = {
            r.tier_name: r
            for r in (await session.execute(select(RouterConfig))).scalars().all()
        }
        for spec in tiers:
            row = rows.get(spec.name)
            if row is not None:
                spec.enabled = row.is_enabled
                spec.priority = row.priority_order
    tiers.sort(key=lambda t: t.priority)
    return tiers
