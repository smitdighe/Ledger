"""Write normalized traces to ClickHouse (`ledger.traces`) and read them back."""
from __future__ import annotations

from typing import Any

from app.db.clickhouse.client import ClickHouseClient
from app.ingestion.schemas import Span, Trace

TRACE_COLUMNS = [
    "trace_id",
    "span_id",
    "parent_span_id",
    "name",
    "start_time",
    "end_time",
    "duration_ms",
    "status",
    "attributes",
]


def _span_row(sp: Span) -> list[Any]:
    return [
        sp.trace_id,
        sp.span_id,
        sp.parent_span_id or "",
        sp.name,
        sp.start_time,
        sp.end_time,
        sp.duration_ms,
        sp.status,
        dict(sp.attributes),
    ]


async def write_traces(client: ClickHouseClient, traces: list[Trace]) -> int:
    """Insert every span of every trace. Returns rows written."""
    rows = [_span_row(sp) for t in traces for sp in t.spans]
    if not rows:
        return 0
    await client.insert("ledger.traces", rows, TRACE_COLUMNS)
    return len(rows)


async def read_trace(client: ClickHouseClient, trace_id: str) -> list[dict[str, Any]]:
    """Read all spans for a trace_id back, ordered by start_time."""
    result = await client.execute(
        f"SELECT {', '.join(TRACE_COLUMNS)} FROM ledger.traces "
        "WHERE trace_id = {tid:String} ORDER BY start_time, span_id",
        {"tid": trace_id},
    )
    return [dict(zip(TRACE_COLUMNS, r)) for r in result.result_rows]
