"""Eval endpoints — trigger eval, list results, inspect the golden set."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.db.clickhouse.client import ClickHouseClient, get_clickhouse
from app.db.postgres.models import EvalResult, EvalType
from app.db.postgres.session import get_session
from app.eval.golden_set import count_entries, get_active_version
from app.eval.runner import evaluate_trace
from app.ingestion.clickhouse_writer import read_trace

router = APIRouter(tags=["evals"])


class EvalRunRequest(BaseModel):
    trace_id: str | None = Field(default=None, description="single trace to evaluate")
    trace_ids: list[str] | None = Field(default=None, description="batch of traces")
    golden_version: str | None = None
    persist: bool = True
    force: bool = Field(default=False, description="re-evaluate even if already scored")


class EvalRunResponse(BaseModel):
    evaluated: int
    reports: list[dict]
    errors: list[dict]


class GoldenSetResponse(BaseModel):
    active_version: str | None
    entry_count: int


@router.post("/evals/run", response_model=EvalRunResponse, summary="Run eval on trace(s)",
             description="Evaluate one or more traces (RAGAS + DeepEval via the non-paid judge). "
                         "Rejects unknown trace_ids (404) and already-scored traces unless "
                         "force=true (409). Admin only.")
async def run_evals(
    body: EvalRunRequest,
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
    ch: ClickHouseClient = Depends(get_clickhouse),
) -> EvalRunResponse:
    ids = body.trace_ids or ([body.trace_id] if body.trace_id else [])
    if not ids:
        raise HTTPException(status_code=422, detail="provide trace_id or trace_ids")

    reports, errors = [], []
    for tid in ids:
        spans = await read_trace(ch, tid)
        if not spans:
            errors.append({"trace_id": tid, "error": "trace not found", "code": 404})
            continue
        if not body.force:
            existing = (await session.execute(
                select(func.count()).select_from(EvalResult).where(EvalResult.trace_id == tid)
            )).scalar_one()
            if existing:
                errors.append({"trace_id": tid, "error": "already evaluated; use force=true", "code": 409})
                continue
        try:
            report = await evaluate_trace(
                session, ch, tid, golden_version=body.golden_version, persist=body.persist
            )
            reports.append(asdict(report))
        except Exception as exc:  # noqa: BLE001
            errors.append({"trace_id": tid, "error": str(exc), "code": 500})

    # single-trace requests get a precise status code
    if len(ids) == 1 and not reports and errors:
        raise HTTPException(status_code=errors[0].get("code", 400), detail=errors[0]["error"])

    return EvalRunResponse(evaluated=len(reports), reports=reports, errors=errors)


@router.get("/evals", summary="List eval results",
            description="Filter recent eval results by trace_id, eval_type, drift flag, and "
                        "time range. Admin only.")
async def list_evals(
    trace_id: str | None = Query(default=None),
    eval_type: str | None = Query(default=None),
    drift: bool | None = Query(default=None, description="only drift-flagged results"),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(EvalResult).order_by(EvalResult.created_at.desc()).limit(limit)
    if trace_id is not None:
        stmt = stmt.where(EvalResult.trace_id == trace_id)
    if eval_type is not None:
        try:
            stmt = stmt.where(EvalResult.eval_type == EvalType(eval_type))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"bad eval_type: {eval_type}") from exc
    if drift is not None:
        stmt = stmt.where(EvalResult.drift_flagged == drift)
    if start_time is not None:
        stmt = stmt.where(EvalResult.created_at >= start_time)
    if end_time is not None:
        stmt = stmt.where(EvalResult.created_at <= end_time)

    rows = (await session.execute(stmt)).scalars().all()
    return {
        "count": len(rows),
        "results": [
            {
                "id": str(r.id), "trace_id": r.trace_id, "eval_type": r.eval_type.value,
                "score": r.score, "judge_model": r.judge_model,
                "generator_model": r.generator_model, "golden_set_version": r.golden_set_version,
                "drift_flagged": r.drift_flagged,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/evals/golden-set", response_model=GoldenSetResponse, summary="Active golden set",
            description="Active golden-set version and its entry count. Admin only.")
async def golden_set(
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> GoldenSetResponse:
    version = await get_active_version(session)
    count = await count_entries(session, version) if version else 0
    return GoldenSetResponse(active_version=version, entry_count=count)
