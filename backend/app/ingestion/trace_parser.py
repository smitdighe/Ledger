"""Normalize RawSpans into internal Trace/Span form.

Resilient by design: a malformed span is logged and skipped rather than
crashing the batch. Handles parent-child grouping, duration calc, and
extraction of LLM (gen_ai.*) attributes.
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.ingestion.schemas import (
    GEN_AI_COMPLETION_KEYS,
    GEN_AI_INPUT_TOKEN_KEYS,
    GEN_AI_MODEL_KEYS,
    GEN_AI_OUTPUT_TOKEN_KEYS,
    GEN_AI_PROMPT_KEYS,
    GEN_AI_TOTAL_TOKEN_KEYS,
    LLMAttributes,
    RawSpan,
    Span,
    Trace,
)

logger = structlog.get_logger(__name__)


def _ns_to_dt(ns: int) -> datetime:
    return datetime.fromtimestamp(ns / 1e9, tz=timezone.utc)


def _first(attrs: dict[str, str], keys: tuple[str, ...]) -> str | None:
    for k in keys:
        if k in attrs and attrs[k] != "":
            return attrs[k]
    return None


def _first_int(attrs: dict[str, str], keys: tuple[str, ...]) -> int | None:
    raw = _first(attrs, keys)
    if raw is None:
        return None
    try:
        return int(float(raw))
    except (ValueError, TypeError):
        return None


def extract_llm_attributes(attrs: dict[str, str]) -> LLMAttributes:
    return LLMAttributes(
        model=_first(attrs, GEN_AI_MODEL_KEYS),
        prompt=_first(attrs, GEN_AI_PROMPT_KEYS),
        completion=_first(attrs, GEN_AI_COMPLETION_KEYS),
        input_tokens=_first_int(attrs, GEN_AI_INPUT_TOKEN_KEYS),
        output_tokens=_first_int(attrs, GEN_AI_OUTPUT_TOKEN_KEYS),
        total_tokens=_first_int(attrs, GEN_AI_TOTAL_TOKEN_KEYS),
    )


def normalize_span(raw: RawSpan) -> Span | None:
    """Convert a RawSpan to a normalized Span. Returns None (logged) on bad input."""
    try:
        if not raw.trace_id or not raw.span_id:
            raise ValueError("missing trace_id/span_id")

        start = _ns_to_dt(raw.start_time_unix_nano)
        # tolerate missing/zero end_time: fall back to start (0ms duration)
        end = _ns_to_dt(raw.end_time_unix_nano) if raw.end_time_unix_nano else start
        duration_ms = max(0.0, (raw.end_time_unix_nano - raw.start_time_unix_nano) / 1e6)

        llm = extract_llm_attributes(raw.attributes)
        return Span(
            trace_id=raw.trace_id,
            span_id=raw.span_id,
            parent_span_id=raw.parent_span_id or "",
            name=raw.name or "unnamed",
            start_time=start,
            end_time=end,
            duration_ms=duration_ms,
            status=raw.status.value,
            attributes=raw.attributes,
            llm=None if llm.is_empty() else llm,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "trace_parser.skip_span",
            span_id=getattr(raw, "span_id", "?"),
            error=str(exc),
        )
        return None


def parse_traces(raw_spans: list[RawSpan]) -> list[Trace]:
    """Group normalized spans into Traces by trace_id."""
    by_trace: dict[str, list[Span]] = {}
    for raw in raw_spans:
        span = normalize_span(raw)
        if span is None:
            continue
        by_trace.setdefault(span.trace_id, []).append(span)

    traces = [Trace(trace_id=tid, spans=spans) for tid, spans in by_trace.items()]
    for t in traces:
        t.spans.sort(key=lambda s: s.start_time)
    return traces
