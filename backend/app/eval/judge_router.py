"""Judge router — eval-dedicated wrapper over the Phase 3 selector.

Hard constraint: LLM-as-judge calls must NEVER hit a paid model. The router has
no paid tier, but we additionally allow-list judge tiers and assert the resolved
provider is non-paid. Supports forcing a specific tier for cross-validation
(e.g. primary judge on Cerebras/Groq, secondary judge on Gemini).
"""
from __future__ import annotations

import re

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.router.providers.base import ProviderResponse
from app.router.selector import Router, router as default_router
from app.router.tiers import TierSpec, get_tiers

logger = structlog.get_logger(__name__)

# never allowed for judging (would be a paid call)
PAID_PROVIDERS = {"openai", "anthropic", "azure-openai", "bedrock"}

# primary judge pool (free, non-paid). Gemini is free too but reserved for the
# explicit cross-validation / secondary-judge role via force_tier.
PRIMARY_JUDGE_TIERS = {"cerebras", "groq", "ollama"}
CROSS_VALIDATION_TIER = "gemini"


class PaidJudgeError(RuntimeError):
    """Raised if judging ever resolves to a paid provider (should be impossible)."""


class JudgeRouter:
    def __init__(self, router: Router | None = None) -> None:
        self._router = router or default_router
        self.call_log: list[str] = []  # providers actually invoked (for audit/tests)

    async def _judge_tiers(
        self, force_tier: str | None, session: AsyncSession | None
    ) -> list[TierSpec]:
        tiers = await get_tiers(session)
        if force_tier:
            allowed = {force_tier}
        else:
            allowed = PRIMARY_JUDGE_TIERS
        pool = [t for t in tiers if t.name in allowed and t.name not in PAID_PROVIDERS]
        if not pool:
            raise PaidJudgeError(f"no non-paid judge tier available for {force_tier or 'primary'}")
        return pool

    async def complete(
        self,
        prompt: str,
        force_tier: str | None = None,
        session: AsyncSession | None = None,
        max_tokens: int = 256,
        temperature: float = 0.0,
        **kwargs,
    ) -> ProviderResponse:
        tiers = await self._judge_tiers(force_tier, session)
        resp = await self._router.complete(
            prompt, tiers=tiers, max_tokens=max_tokens, temperature=temperature, **kwargs
        )
        if resp.provider in PAID_PROVIDERS:
            raise PaidJudgeError(f"judge resolved to paid provider {resp.provider}")
        self.call_log.append(resp.provider)
        return resp

    async def score(
        self,
        instruction: str,
        force_tier: str | None = None,
        session: AsyncSession | None = None,
    ) -> float:
        """Ask the judge for a single 0..1 score and parse it robustly."""
        prompt = (
            f"{instruction}\n\n"
            "Respond with ONLY a single number between 0 and 1 (e.g. 0.0, 0.5, 1.0). "
            "1 means fully/yes, 0 means not at all/no. Number:"
        )
        resp = await self.complete(prompt, force_tier=force_tier, session=session, max_tokens=8)
        return _parse_score(resp.text)

    def reset_log(self) -> None:
        self.call_log.clear()


def _parse_score(text: str) -> float:
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    if not m:
        return 0.0
    val = float(m.group(1))
    if val > 1.0:  # model answered on 0-10 or 0-100 scale
        val = val / 10.0 if val <= 10 else val / 100.0
    return max(0.0, min(1.0, val))


judge_router = JudgeRouter()
