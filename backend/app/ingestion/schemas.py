"""Pydantic schemas for ingestion: raw OTel spans, normalized Trace/Span, and
the OTel gen_ai.* semantic-convention -> Ledger field mapping.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class SpanStatus(str, Enum):
    unset = "UNSET"
    ok = "OK"
    error = "ERROR"


# --- raw (post-decode, pre-normalize) --------------------------------------
class RawSpan(BaseModel):
    """OTel span decoded from OTLP protobuf/JSON into a flat internal form.

    IDs are lowercase hex. Times are unix-nanoseconds as sent on the wire.
    """
    trace_id: str
    span_id: str
    parent_span_id: str = ""
    name: str = ""
    start_time_unix_nano: int = 0
    end_time_unix_nano: int = 0
    status: SpanStatus = SpanStatus.unset
    attributes: dict[str, str] = Field(default_factory=dict)


# --- normalized (internal canonical form) ----------------------------------
class LLMAttributes(BaseModel):
    model: str | None = None
    prompt: str | None = None
    completion: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    def is_empty(self) -> bool:
        return not any(v is not None for v in self.model_dump().values())


class Span(BaseModel):
    trace_id: str
    span_id: str
    parent_span_id: str = ""
    name: str
    start_time: datetime
    end_time: datetime
    duration_ms: float
    status: str = SpanStatus.unset.value
    attributes: dict[str, str] = Field(default_factory=dict)
    llm: LLMAttributes | None = None


class Trace(BaseModel):
    trace_id: str
    spans: list[Span] = Field(default_factory=list)

    @property
    def root_span(self) -> Span | None:
        by_id = {s.span_id for s in self.spans}
        for s in self.spans:
            if not s.parent_span_id or s.parent_span_id not in by_id:
                return s
        return self.spans[0] if self.spans else None


# --- OTel semantic-convention mapping (gen_ai.*) ---------------------------
# Multiple keys per field: newer `gen_ai.usage.input_tokens` and the older
# `gen_ai.usage.prompt_tokens`, etc. First present wins.
GEN_AI_MODEL_KEYS = ("gen_ai.response.model", "gen_ai.request.model", "llm.model_name")
GEN_AI_PROMPT_KEYS = ("gen_ai.prompt", "gen_ai.prompt.0.content", "llm.prompts")
GEN_AI_COMPLETION_KEYS = (
    "gen_ai.completion",
    "gen_ai.completion.0.content",
    "gen_ai.response.0.content",
)
GEN_AI_INPUT_TOKEN_KEYS = ("gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens")
GEN_AI_OUTPUT_TOKEN_KEYS = ("gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens")
GEN_AI_TOTAL_TOKEN_KEYS = ("gen_ai.usage.total_tokens",)
