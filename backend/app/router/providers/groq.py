"""Tier 2 — Groq (free). Fast, high-throughput general inference."""
from __future__ import annotations

import time
from typing import Any

from app.core.config import settings
from app.router.providers.base import (
    BaseProvider,
    ProviderError,
    ProviderRateLimited,
    ProviderResponse,
)


class GroqProvider(BaseProvider):
    name = "groq"
    default_model = "llama-3.1-8b-instant"

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.groq_api_key
        self._client = None

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        if self._client is None:
            from groq import AsyncGroq

            self._client = AsyncGroq(api_key=self._api_key)
        return self._client

    async def complete(self, prompt: str, **kwargs: Any) -> ProviderResponse:
        if not self.available:
            raise ProviderError("groq: GROQ_API_KEY not configured")
        model = kwargs.get("model") or self.default_model
        client = self._get_client()
        start = time.perf_counter()
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=kwargs.get("temperature", 0.2),
                max_tokens=kwargs.get("max_tokens", 512),
            )
        except Exception as exc:  # noqa: BLE001
            if _is_rate_limit(exc):
                raise ProviderRateLimited(f"groq: {exc}") from exc
            raise ProviderError(f"groq: {exc}") from exc
        latency_ms = (time.perf_counter() - start) * 1000
        text = resp.choices[0].message.content or ""
        tokens = getattr(getattr(resp, "usage", None), "total_tokens", None)
        return ProviderResponse(self.name, model, text, latency_ms, tokens, resp)

    async def health(self) -> tuple[bool, float | None]:
        if not self.available:
            return False, None
        start = time.perf_counter()
        try:
            await self.complete("ping", max_tokens=1)
        except Exception:  # noqa: BLE001
            return False, None
        return True, (time.perf_counter() - start) * 1000


def _is_rate_limit(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    return status == 429 or "429" in str(exc) or "rate limit" in str(exc).lower()
