"""OTLP/HTTP receiver: decode incoming span batches into RawSpan list.

Supports both wire formats:
  * application/x-protobuf  -> ExportTraceServiceRequest (opentelemetry-proto)
  * application/json        -> OTLP/JSON (hand-parsed)

NOTE: OTLP/JSON encodes trace_id/span_id as lowercase hex strings, while the
protobuf<->JSON standard mapping would base64 the underlying bytes. We parse
JSON by hand to honor the hex convention and avoid that mismatch.
"""
from __future__ import annotations

import json
from typing import Any

import structlog

from app.ingestion.schemas import RawSpan, SpanStatus

logger = structlog.get_logger(__name__)

_PROTO_STATUS = {0: SpanStatus.unset, 1: SpanStatus.ok, 2: SpanStatus.error}


def decode_otlp(body: bytes, content_type: str | None) -> list[RawSpan]:
    """Decode an OTLP export request into RawSpans. Never raises on a single
    bad span — malformed spans are logged and skipped."""
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ("application/x-protobuf", "application/protobuf"):
        return _decode_protobuf(body)
    if ct == "application/json" or not ct:
        return _decode_json(body)
    raise ValueError(f"unsupported OTLP content-type: {content_type!r}")


# --- protobuf ---------------------------------------------------------------
def _decode_protobuf(body: bytes) -> list[RawSpan]:
    from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
        ExportTraceServiceRequest,
    )

    req = ExportTraceServiceRequest()
    req.ParseFromString(body)

    spans: list[RawSpan] = []
    for rs in req.resource_spans:
        for ss in rs.scope_spans:
            for sp in ss.spans:
                try:
                    spans.append(
                        RawSpan(
                            trace_id=sp.trace_id.hex(),
                            span_id=sp.span_id.hex(),
                            parent_span_id=sp.parent_span_id.hex() if sp.parent_span_id else "",
                            name=sp.name,
                            start_time_unix_nano=sp.start_time_unix_nano,
                            end_time_unix_nano=sp.end_time_unix_nano,
                            status=_PROTO_STATUS.get(
                                int(sp.status.code), SpanStatus.unset
                            ),
                            attributes=_proto_attributes(sp.attributes),
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("otel.decode.skip_span", error=str(exc))
    return spans


def _proto_attributes(attrs: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    for kv in attrs:
        try:
            out[kv.key] = _proto_anyvalue(kv.value)
        except Exception:  # noqa: BLE001
            continue
    return out


def _proto_anyvalue(v: Any) -> str:
    if v.HasField("string_value"):
        return v.string_value
    if v.HasField("int_value"):
        return str(v.int_value)
    if v.HasField("double_value"):
        return str(v.double_value)
    if v.HasField("bool_value"):
        return str(v.bool_value).lower()
    if v.HasField("array_value"):
        return json.dumps([_proto_anyvalue(x) for x in v.array_value.values])
    return ""


# --- json -------------------------------------------------------------------
def _decode_json(body: bytes) -> list[RawSpan]:
    doc = json.loads(body or b"{}")
    spans: list[RawSpan] = []
    for rs in doc.get("resourceSpans", doc.get("resource_spans", [])) or []:
        for ss in rs.get("scopeSpans", rs.get("scope_spans", [])) or []:
            for sp in ss.get("spans", []) or []:
                try:
                    spans.append(_json_span(sp))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("otel.decode.skip_span", error=str(exc))
    return spans


def _json_span(sp: dict) -> RawSpan:
    status_code = (sp.get("status") or {}).get("code", 0)
    if isinstance(status_code, str):  # OTLP/JSON may send enum name
        status_code = {"STATUS_CODE_OK": 1, "STATUS_CODE_ERROR": 2}.get(status_code, 0)
    return RawSpan(
        trace_id=str(sp.get("traceId", sp.get("trace_id", ""))).lower(),
        span_id=str(sp.get("spanId", sp.get("span_id", ""))).lower(),
        parent_span_id=str(sp.get("parentSpanId", sp.get("parent_span_id", "")) or "").lower(),
        name=sp.get("name", ""),
        start_time_unix_nano=int(sp.get("startTimeUnixNano", sp.get("start_time_unix_nano", 0)) or 0),
        end_time_unix_nano=int(sp.get("endTimeUnixNano", sp.get("end_time_unix_nano", 0)) or 0),
        status=_PROTO_STATUS.get(int(status_code or 0), SpanStatus.unset),
        attributes=_json_attributes(sp.get("attributes", []) or []),
    )


def _json_attributes(attrs: list[dict]) -> dict[str, str]:
    out: dict[str, str] = {}
    for kv in attrs:
        try:
            out[kv["key"]] = _json_anyvalue(kv.get("value", {}))
        except Exception:  # noqa: BLE001
            continue
    return out


def _json_anyvalue(v: dict) -> str:
    if "stringValue" in v:
        return str(v["stringValue"])
    if "intValue" in v:
        return str(v["intValue"])
    if "doubleValue" in v:
        return str(v["doubleValue"])
    if "boolValue" in v:
        return str(v["boolValue"]).lower()
    if "arrayValue" in v:
        return json.dumps([_json_anyvalue(x) for x in v["arrayValue"].get("values", [])])
    return ""
