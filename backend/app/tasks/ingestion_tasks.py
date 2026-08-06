"""Ingestion tasks — async ClickHouse write path (moved off the request path).

The API parses OTLP synchronously (cheap) and enqueues this task; the task does
the IO (ClickHouse write + Langfuse push) with retry on transient ClickHouse
failures, then chains each trace into eval (ingest -> eval -> diagnose).
"""
from __future__ import annotations

import structlog

from app.core.celery_app import TransientError, celery_app
from app.db.clickhouse.client import clickhouse_client
from app.ingestion.clickhouse_writer import write_traces
from app.ingestion.langfuse_client import langfuse_ingestor
from app.ingestion.schemas import Trace
from app.tasks._async import run_async

logger = structlog.get_logger(__name__)


async def _ingest_impl(traces_data: list[dict], to_langfuse: bool, run_eval: bool) -> dict:
    traces = [Trace.model_validate(t) for t in traces_data]
    trace_ids = [t.trace_id for t in traces]

    try:
        rows = await write_traces(clickhouse_client, traces)
    except Exception as exc:  # transient CH/network failure -> retry
        logger.warning("task.ingest.clickhouse_failed", trace_ids=trace_ids, error=str(exc))
        raise TransientError(f"clickhouse write failed: {exc}") from exc

    langfuse_pushed = 0
    if to_langfuse:
        for t in traces:
            try:
                langfuse_ingestor.push_trace(t)
                langfuse_pushed += 1
            except Exception as exc:  # noqa: BLE001 — non-fatal, per-trace isolated
                logger.warning("task.ingest.langfuse_failed", trace_id=t.trace_id, error=str(exc))

    # chain into eval (lazy import avoids import cycle)
    if run_eval:
        from app.tasks.eval_tasks import eval_trace
        for tid in trace_ids:
            eval_trace.delay(tid)

    logger.info("task.ingest.done", trace_ids=trace_ids, rows=rows, langfuse_pushed=langfuse_pushed)
    return {"clickhouse_rows_written": rows, "langfuse_traces_pushed": langfuse_pushed,
            "trace_ids": trace_ids}


@celery_app.task(name="app.tasks.ingestion_tasks.ingest_traces", bind=True)
def ingest_traces(self, traces_data: list[dict], to_langfuse: bool = True, run_eval: bool = True) -> dict:
    return run_async(_ingest_impl(traces_data, to_langfuse, run_eval))
