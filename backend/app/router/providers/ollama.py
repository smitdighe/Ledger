"""Tier 4 — Ollama (local). Zero-cost, zero-rate-limit guaranteed fallback."""
from __future__ import annotations

import time
from typing import Any

from app.core.config import settings
from app.router.providers.base import BaseProvider, ProviderError, ProviderResponse


class OllamaProvider(BaseProvider):
    name = "ollama"
    default_model = "llama3.2:3b"

    def __init__(self, host: str | None = None, default_model: str | None = None) -> None:
        self._host = host or settings.ollama_host
        if default_model:
            self.default_model = default_model
        self._client = None

    @property
    def available(self) -> bool:
        # local host is always "configured"; real reachability is a health probe.
        return bool(self._host)

    def _get_client(self):
        if self._client is None:
            from ollama import AsyncClient

            self._client = AsyncClient(host=self._host)
        return self._client

    async def complete(self, prompt: str, **kwargs: Any) -> ProviderResponse:
        model = kwargs.get("model") or self.default_model
        client = self._get_client()
        start = time.perf_counter()
        try:
            resp = await client.chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                options={
                    "temperature": kwargs.get("temperature", 0.2),
                    "num_predict": kwargs.get("max_tokens", 512),
                },
            )
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"ollama: {exc}") from exc
        latency_ms = (time.perf_counter() - start) * 1000
        text = resp.get("message", {}).get("content", "") if isinstance(resp, dict) else resp.message.content
        prompt_t = _get(resp, "prompt_eval_count") or 0
        eval_t = _get(resp, "eval_count") or 0
        tokens = (prompt_t + eval_t) or None
        return ProviderResponse(self.name, model, text, latency_ms, tokens, resp)

    async def health(self) -> tuple[bool, float | None]:
        client = self._get_client()
        start = time.perf_counter()
        try:
            await client.list()
        except Exception:  # noqa: BLE001
            return False, None
        return True, (time.perf_counter() - start) * 1000


def _get(resp: Any, key: str):
    if isinstance(resp, dict):
        return resp.get(key)
    return getattr(resp, key, None)
