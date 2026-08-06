"""Langfuse (self-hosted, v4 OTel-based SDK) ingestion wrapper.

push_trace  -> creates one observation per normalized Span, preserving the
              parent-child tree (LLM spans become `generation` observations).
pull_trace  -> fetches a trace back (with observations) for verification.
"""
from __future__ import annotations

import structlog
from langfuse import Langfuse
from langfuse.types import TraceContext

from app.core.config import settings
from app.ingestion.schemas import Span, Trace

logger = structlog.get_logger(__name__)


def _parent_first(spans: list[Span]) -> list[Span]:
    """Order spans so every parent precedes its children."""
    present = {s.span_id for s in spans}
    remaining = list(spans)
    placed: set[str] = set()
    ordered: list[Span] = []
    # simple stable pass; falls back to appending leftovers to avoid infinite loop
    while remaining:
        progressed = False
        for s in list(remaining):
            parent = s.parent_span_id
            if not parent or parent not in present or parent in placed:
                ordered.append(s)
                placed.add(s.span_id)
                remaining.remove(s)
                progressed = True
        if not progressed:
            ordered.extend(remaining)
            break
    return ordered


class LangfuseIngestor:
    def __init__(self) -> None:
        self.client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )

    def push_trace(self, trace: Trace) -> str:
        """Push a normalized Trace to Langfuse. Returns the trace_id."""
        lf_id: dict[str, str] = {}  # otel span_id -> langfuse observation id
        for sp in _parent_first(trace.spans):
            parent_lf = lf_id.get(sp.parent_span_id)
            ctx = (
                TraceContext(trace_id=sp.trace_id, parent_span_id=parent_lf)
                if parent_lf
                else TraceContext(trace_id=sp.trace_id)
            )
            kwargs: dict = {
                "trace_context": ctx,
                "name": sp.name,
                "as_type": "generation" if sp.llm else "span",
                "metadata": {**sp.attributes, "duration_ms": sp.duration_ms},
                "level": "ERROR" if sp.status == "ERROR" else "DEFAULT",
            }
            if sp.llm:
                kwargs["model"] = sp.llm.model
                kwargs["input"] = sp.llm.prompt
                kwargs["output"] = sp.llm.completion
                usage = {
                    k: v
                    for k, v in {
                        "input": sp.llm.input_tokens,
                        "output": sp.llm.output_tokens,
                        "total": sp.llm.total_tokens,
                    }.items()
                    if v is not None
                }
                if usage:
                    kwargs["usage_details"] = usage

            obs = self.client.start_observation(**kwargs)
            obs.end()
            lf_id[sp.span_id] = obs.id

        self.client.flush()
        return trace.trace_id

    def pull_trace(self, trace_id: str):
        """Fetch a trace (with observations) back from Langfuse."""
        self.client.flush()
        return self.client.api.trace.get(trace_id)

    def close(self) -> None:
        self.client.shutdown()


langfuse_ingestor = LangfuseIngestor()
