"""Tier 3 — Gemini 2.0 Flash (free, 1500 req/day). Cross-validation / 2nd judge."""
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


class GeminiProvider(BaseProvider):
    name = "gemini"
    default_model = "gemini-2.0-flash"

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.gemini_api_key
        self._configured = False

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def _model(self, model: str):
        import google.generativeai as genai

        if not self._configured:
            genai.configure(api_key=self._api_key)
            self._configured = True
        return genai.GenerativeModel(model)

    async def complete(self, prompt: str, **kwargs: Any) -> ProviderResponse:
        if not self.available:
            raise ProviderError("gemini: GEMINI_API_KEY not configured")
        model = kwargs.get("model") or self.default_model
        gm = self._model(model)
        start = time.perf_counter()
        try:
            import google.generativeai as genai

            resp = await gm.generate_content_async(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=kwargs.get("temperature", 0.2),
                    max_output_tokens=kwargs.get("max_tokens", 512),
                ),
            )
        except Exception as exc:  # noqa: BLE001
            if _is_rate_limit(exc):
                raise ProviderRateLimited(f"gemini: {exc}") from exc
            raise ProviderError(f"gemini: {exc}") from exc
        latency_ms = (time.perf_counter() - start) * 1000
        text = getattr(resp, "text", "") or ""
        usage = getattr(resp, "usage_metadata", None)
        tokens = getattr(usage, "total_token_count", None) if usage else None
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
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    s = str(exc).lower()
    return status in (429,) or "429" in s or "quota" in s or "resource_exhausted" in s
