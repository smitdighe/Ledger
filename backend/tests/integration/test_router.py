"""Router integration tests: fallback chain, rate limiter, health routing.

Uses real Redis (rate limiter + health state) and real Postgres (health
persistence). Cloud providers need no keys here — the fallback scenarios are
driven via the rate limiter and health flags, matching production selection logic.
"""
from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import select

from app.db.postgres.models import RouterConfig
from app.db.postgres.session import AsyncSessionLocal
from app.router.health_check import get_health, run_health_checks, set_health
from app.router.providers.base import BaseProvider, ProviderError, ProviderResponse
from app.router.rate_limiter import RateLimiter
from app.router.selector import Router
from app.router.tiers import TierSpec


class FakeProvider(BaseProvider):
    def __init__(self, name: str, available: bool = True, fail: bool = False):
        self.name = name
        self.default_model = "fake"
        self._available = available
        self._fail = fail

    @property
    def available(self) -> bool:
        return self._available

    async def complete(self, prompt: str, **kwargs) -> ProviderResponse:
        if self._fail:
            raise ProviderError(f"{self.name}: simulated failure")
        return ProviderResponse(self.name, "fake", "ok", 1.0, 1)

    async def health(self) -> tuple[bool, float | None]:
        return (not self._fail), 1.0


def _chain(suffix: str) -> list[TierSpec]:
    return [
        TierSpec(f"cerebras-{suffix}", FakeProvider(f"cerebras-{suffix}"),
                 "triage", 1, rpm=2, rpd=100),
        TierSpec(f"groq-{suffix}", FakeProvider(f"groq-{suffix}"),
                 "general", 2, rpm=5, rpd=100),
        TierSpec(f"gemini-{suffix}", FakeProvider(f"gemini-{suffix}"),
                 "judge", 3, rpm=5, rpd=2),
        TierSpec(f"ollama-{suffix}", FakeProvider(f"ollama-{suffix}"),
                 "floor", 4, rpm=100_000, rpd=None, is_floor=True),
    ]


@pytest.mark.asyncio
async def test_fallback_chain_down_to_ollama():
    sfx = uuid.uuid4().hex[:8]
    tiers = _chain(sfx)
    r = Router()

    # 1. Cerebras rate-limited: drain its per-minute bucket (capacity 2)
    for _ in range(2):
        assert await r.limiter.acquire(f"cerebras-{sfx}", 2)
    # 2. Groq down (failed health probe)
    await set_health(f"groq-{sfx}", False)
    # 3. Gemini daily quota exhausted (limit 2)
    for _ in range(2):
        assert await r.limiter.acquire_daily(f"gemini-{sfx}", 2)

    decision = await r.select(tiers=tiers)
    assert decision.tier.name == f"ollama-{sfx}"

    reasons = dict(decision.skipped)
    assert reasons[f"cerebras-{sfx}"] == "rate-limited"
    assert reasons[f"groq-{sfx}"] == "unhealthy"
    assert reasons[f"gemini-{sfx}"] == "daily-quota-exhausted"

    # complete() honors the same chain and actually returns Ollama's response
    resp = await r.complete("diagnose this", tiers=tiers)
    assert resp.provider == f"ollama-{sfx}"


@pytest.mark.asyncio
async def test_rate_limiter_blocks_then_refills():
    name = f"rltest-{uuid.uuid4().hex[:8]}"
    lim = RateLimiter()

    # capacity == rpm == 60, refill 1 token/sec
    granted = 0
    for _ in range(70):
        if await lim.acquire(name, 60):
            granted += 1
    assert granted == 60                     # bucket started full, then empty
    assert await lim.acquire(name, 60) is False   # exhausted

    await asyncio.sleep(1.2)                  # ~1.2 tokens refill
    assert await lim.acquire(name, 60) is True    # refilled


@pytest.mark.asyncio
async def test_health_probe_marks_unhealthy_and_selector_routes_around():
    # real probe: no cloud keys -> cerebras unavailable -> unhealthy; ollama live
    async with AsyncSessionLocal() as session:
        results = await run_health_checks(session)
    by = {r["tier"]: r for r in results}

    assert by["ollama"]["healthy"] is True
    assert by["cerebras"]["available"] is False
    assert by["cerebras"]["healthy"] is False

    # persisted to Postgres
    async with AsyncSessionLocal() as session:
        rows = {
            r.tier_name: r
            for r in (await session.execute(select(RouterConfig))).scalars().all()
        }
    assert rows["ollama"].last_health_check is not None
    assert rows["ollama"].last_latency_ms is not None

    # cached in Redis
    assert await get_health("ollama") is True
    assert await get_health("cerebras") is False

    # selector routes around the just-probed-unhealthy 'cerebras'
    sfx = uuid.uuid4().hex[:8]
    tiers = [
        TierSpec("cerebras", FakeProvider("cerebras"), "triage", 1, rpm=10),
        TierSpec(f"floor-{sfx}", FakeProvider(f"floor-{sfx}"), "floor", 2,
                 rpm=100_000, is_floor=True),
    ]
    decision = await Router().select(tiers=tiers)
    assert decision.tier.name == f"floor-{sfx}"
    assert dict(decision.skipped)["cerebras"] == "unhealthy"
