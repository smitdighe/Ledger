"""Trace endpoints.

POST /traces        enqueue async OTLP ingestion (ingestion scope)
GET  /traces        list/paginate traces with filters (admin)
GET  /traces/{id}   read a single trace's spans (admin)
"""
from __future__ import annotations

from datetime import datetime

import redis as redis_sync
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import require_admin, require_ingestion
from app.db.clickhouse.client import ClickHouseClient, get_clickhouse
from app.db.postgres.models import Incident
from app.db.postgres.session import get_session
from app.ingestion.clickhouse_writer import read_trace
from app.ingestion.otel_receiver import decode_otlp
from app.ingestion.trace_parser import parse_traces
from app.tasks.ingestion_tasks import ingest_traces as ingest_task

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["traces"])

# fast broker liveness check (kombu's own timeouts don't reliably fail-fast on a
# dead broker, so we ping first and 503 rather than hang the request).
_broker_ping = redis_sync.from_url(
    settings.redis_url, socket_connect_timeout=1, socket_timeout=1
)


# --- response models -------------------------------------------------------
class IngestAccepted(BaseModel):
    status: str = "accepted"
    task_id: str
    accepted_spans: int
    traces: int
    trace_ids: list[str]


class TraceListItem(BaseModel):
    trace_id: str
    started_at: str | None
    status: str
    span_count: int
    has_incident: bool


class TraceListResponse(BaseModel):
    count: int
    limit: int
    offset: int
    traces: list[TraceListItem]


class TraceDetail(BaseModel):
    trace_id: str
    span_count: int
    spans: list[dict]


@router.post("/traces", response_model=IngestAccepted, summary="Ingest OTLP traces (async)",
             description="Accepts an OTLP/HTTP payload (protobuf or JSON), parses it "
                         "synchronously, and enqueues the ClickHouse write + eval chain. "
                         "Returns immediately with a task id. Requires the ingestion scope.")
async def ingest_traces(
    request: Request,
    to_langfuse: bool = Query(default=True, description="also push to Langfuse"),
    run_eval: bool = Query(default=True, description="chain into eval after write"),
    _: set = Depends(require_ingestion),
) -> IngestAccepted:
    body = await request.body()
    content_type = request.headers.get("content-type")
    try:
        raw_spans = decode_otlp(body, content_type)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — malformed payload -> 400, never 500
        raise HTTPException(status_code=400, detail=f"malformed OTLP payload: {exc}") from exc

    traces = parse_traces(raw_spans)
    payload = [t.model_dump(mode="json") for t in traces]
    try:
        _broker_ping.ping()  # fast fail if broker down (<=1s) instead of hanging
        async_result = ingest_task.delay(payload, to_langfuse=to_langfuse, run_eval=run_eval)
    except Exception as exc:  # noqa: BLE001 — broker unreachable: fail fast, don't hang
        logger.error("ingest.enqueue_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="task queue unavailable, retry shortly") from exc
    return IngestAccepted(
        task_id=async_result.id,
        accepted_spans=len(raw_spans),
        traces=len(traces),
        trace_ids=[t.trace_id for t in traces],
    )


@router.get("/traces", response_model=TraceListResponse, summary="List traces",
            description="Paginated list of traces from ClickHouse with optional time-range, "
                        "status, and has_incident filters. Requires the admin scope.")
async def list_traces(
    start_time: datetime | None = Query(default=None, description="ISO8601 lower bound on span start"),
    end_time: datetime | None = Query(default=None, description="ISO8601 upper bound on span start"),
    status: str | None = Query(default=None, pattern="^(OK|ERROR)$"),
    has_incident: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: set = Depends(require_admin),
    ch: ClickHouseClient = Depends(get_clickhouse),
    session: AsyncSession = Depends(get_session),
) -> TraceListResponse:
    where, params = [], {}
    if start_time is not None:
        where.append("start_time >= {start:DateTime64(3)}")
        params["start"] = start_time
    if end_time is not None:
        where.append("start_time <= {end:DateTime64(3)}")
        params["end"] = end_time
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    having_sql = "HAVING st = {status:String}" if status else ""
    if status:
        params["status"] = status
    params["lim"] = limit
    params["off"] = offset

    query = (
        "SELECT trace_id, min(start_time) AS started, "
        "if(countIf(status='ERROR') > 0, 'ERROR', 'OK') AS st, count() AS spans "
        f"FROM ledger.traces {where_sql} GROUP BY trace_id {having_sql} "
        "ORDER BY started DESC LIMIT {lim:UInt32} OFFSET {off:UInt32}"
    )
    rows = (await ch.execute(query, params)).result_rows

    trace_ids = [r[0] for r in rows]
    incident_ids: set[str] = set()
    if trace_ids:
        inc_rows = await session.execute(
            select(Incident.trace_id).where(Incident.trace_id.in_(trace_ids))
        )
        incident_ids = {t for t in inc_rows.scalars().all()}

    items = [
        TraceListItem(
            trace_id=r[0],
            started_at=r[1].isoformat() if r[1] else None,
            status=r[2],
            span_count=r[3],
            has_incident=r[0] in incident_ids,
        )
        for r in rows
    ]
    if has_incident is not None:
        items = [it for it in items if it.has_incident == has_incident]

    return TraceListResponse(count=len(items), limit=limit, offset=offset, traces=items)


@router.get("/traces/{trace_id}", response_model=TraceDetail, summary="Get a trace",
            description="Return all spans for a trace_id from ClickHouse. Requires the admin scope.")
async def get_trace(
    trace_id: str,
    _: set = Depends(require_admin),
    ch: ClickHouseClient = Depends(get_clickhouse),
) -> TraceDetail:
    spans = await read_trace(ch, trace_id)
    if not spans:
        raise HTTPException(status_code=404, detail="trace not found")
    return TraceDetail(trace_id=trace_id, span_count=len(spans), spans=spans)
