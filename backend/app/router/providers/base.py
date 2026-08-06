"""Common provider interface for the 4-tier router."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProviderResponse:
    provider: str
    model: str
    text: str
    latency_ms: float
    tokens_used: int | None = None
    raw_response: Any = field(default=None, repr=False)


class ProviderError(Exception):
    """Any provider-side failure (network, auth, server error)."""


class ProviderRateLimited(ProviderError):
    """Provider signalled a 429 / quota exhaustion."""


class BaseProvider(abc.ABC):
    #: stable provider key, e.g. "cerebras"
    name: str = "base"
    #: default model id used when caller passes none
    default_model: str = ""

    @property
    @abc.abstractmethod
    def available(self) -> bool:
        """True when the provider is configured (key present / host reachable
        config-wise). A False here lets the selector skip without a network hop."""

    @abc.abstractmethod
    async def complete(self, prompt: str, **kwargs: Any) -> ProviderResponse:
        """Run a single completion. Raise ProviderError / ProviderRateLimited on failure."""

    @abc.abstractmethod
    async def health(self) -> tuple[bool, float | None]:
        """Lightweight liveness probe. Returns (ok, latency_ms)."""
