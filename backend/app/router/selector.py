"""Tier selector: priority-ordered, rate-limit- and health-aware, with Ollama
as the guaranteed zero-cost floor.

`quality_hint` is a STUB in this phase (eval doesn't exist yet). It is accepted,
recorded on the decision, and passed to a pluggable `quality_gate` hook that a
later eval phase can override; by default it never vetoes a tier.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.router.health_check import get_health
from app.router.providers.base import ProviderError, ProviderResponse
from app.router.rate_limiter import RateLimiter, rate_limiter
from app.router.tiers import TierSpec, get_tiers

logger = structlog.get_logger(__name__)

FLOOR_TIER = "ollama"


class RouterExhausted(ProviderError):
    """No tier could serve the request (should only happen if Ollama is down)."""


@dataclass
class RouteDecision:
    tier: TierSpec
    reason: str
    skipped: list[tuple[str, str]]  # (tier_name, why-skipped)


class Router:
    def __init__(
        self,
        limiter: RateLimiter | None = None,
        quality_gate: Callable[[TierSpec, str | None], bool] | None = None,
    ) -> None:
        self.limiter = limiter or rate_limiter
        # default gate: never veto (eval phase will supply a real score source)
        self.quality_gate = quality_gate or (lambda spec, hint: True)

    async def _check_and_consume(
        self, spec: TierSpec, quality_hint: str | None
    ) -> tuple[bool, str]:
        """Eligibility for one tier. Consumes rate tokens when it clears the
        cheaper gates. The floor tier (Ollama) never consumes and never fails here."""
        if not spec.enabled:
            return False, "disabled"
        if not spec.provider.available:
            return False, "unavailable"
        if not self.quality_gate(spec, quality_hint):
            return False, "quality-gate"

        health = await get_health(spec.name)
        if health is False:
            return False, "unhealthy"

        if spec.is_floor:
            return True, "floor"

        # per-minute token bucket
        if not await self.limiter.acquire(spec.name, spec.rpm):
            return False, "rate-limited"
        # per-day quota (e.g. Gemini 1500/day)
        if spec.rpd is not None and not await self.limiter.acquire_daily(spec.name, spec.rpd):
            return False, "daily-quota-exhausted"
        return True, "ok"

    async def select(
        self,
        quality_hint: str | None = None,
        session: AsyncSession | None = None,
        tiers: list[TierSpec] | None = None,
    ) -> RouteDecision:
        """Pick the first eligible tier (consuming its rate token)."""
        tiers = tiers if tiers is not None else await get_tiers(session)
        skipped: list[tuple[str, str]] = []
        for spec in tiers:
            ok, reason = await self._check_and_consume(spec, quality_hint)
            if ok:
                logger.info("router.select", tier=spec.name, reason=reason, hint=quality_hint)
                return RouteDecision(tier=spec, reason=reason, skipped=skipped)
            skipped.append((spec.name, reason))
        raise RouterExhausted(f"no tier available; skipped={skipped}")

    async def complete(
        self,
        prompt: str,
        quality_hint: str | None = None,
        session: AsyncSession | None = None,
        tiers: list[TierSpec] | None = None,
        **kwargs,
    ) -> ProviderResponse:
        """Select + call, falling through on runtime provider failure down to Ollama."""
        tiers = tiers if tiers is not None else await get_tiers(session)
        skipped: list[tuple[str, str]] = []
        for spec in tiers:
            ok, reason = await self._check_and_consume(spec, quality_hint)
            if not ok:
                skipped.append((spec.name, reason))
                continue
            try:
                resp = await spec.provider.complete(prompt, **kwargs)
                logger.info("router.complete", tier=spec.name, latency_ms=round(resp.latency_ms, 1))
                return resp
            except ProviderError as exc:
                logger.warning("router.tier_failed", tier=spec.name, error=str(exc))
                skipped.append((spec.name, f"error:{exc}"))
                continue
        raise RouterExhausted(f"all tiers failed; skipped={skipped}")


router = Router()
