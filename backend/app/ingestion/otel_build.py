"""Helpers to build OTLP/JSON export payloads (test + seed data).

Emits the hex-id OTLP/JSON convention that `otel_receiver._decode_json` expects.
"""
from __future__ import annotations

from typing import Any, TypedDict


class SpanSpec(TypedDict, total=False):
    trace_id: str
    span_id: str
    parent_span_id: str
    name: str
    start_ns: int
    end_ns: int
    status: int  # 0 unset, 1 ok, 2 error
    attributes: dict[str, Any]


def _attr_value(v: Any) -> dict[str, Any]:
    if isinstance(v, bool):
        return {"boolValue": v}
    if isinstance(v, int):
        return {"intValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    return {"stringValue": str(v)}


def _span(spec: SpanSpec) -> dict[str, Any]:
    return {
        "traceId": spec["trace_id"],
        "spanId": spec["span_id"],
        "parentSpanId": spec.get("parent_span_id", ""),
        "name": spec.get("name", ""),
        "startTimeUnixNano": str(spec.get("start_ns", 0)),
        "endTimeUnixNano": str(spec.get("end_ns", 0)),
        "status": {"code": spec.get("status", 0)},
        "attributes": [
            {"key": k, "value": _attr_value(v)}
            for k, v in (spec.get("attributes") or {}).items()
        ],
    }


def build_otlp_json(spans: list[SpanSpec], service_name: str = "ledger-synthetic") -> dict[str, Any]:
    """Wrap SpanSpecs into a single OTLP/JSON ExportTraceServiceRequest dict."""
    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": service_name}}
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "ledger.ingestion"},
                        "spans": [_span(s) for s in spans],
                    }
                ],
            }
        ]
    }
