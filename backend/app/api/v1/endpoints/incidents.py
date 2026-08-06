"""Incident endpoints — trigger the swarm, list/read incidents + diagnostic trail,
manually resolve human-review incidents.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import nodes_that_ran, run_diagnostic_graph
from app.core.security import require_admin
from app.db.postgres.models import Incident, IncidentStatus, RootCause
from app.db.postgres.session import get_session

router = APIRouter(tags=["incidents"])


class TriggerRequest(BaseModel):
    trace_id: str
    signal: str = "manual_trigger"
    use_llm: bool = True


class IncidentResolveRequest(BaseModel):
    resolution_note: str = Field(min_length=3, description="required human note explaining the close-out")
    status: str = Field(default="resolved", pattern="^(resolved|failed)$")


@router.post("/incidents/trigger", summary="Trigger diagnostic swarm",
             description="Run the LangGraph diagnostic swarm for a trace_id and persist an "
                         "incident. Admin only.")
async def trigger_incident(body: TriggerRequest, _: set = Depends(require_admin)) -> dict:
    final = await run_diagnostic_graph(body.trace_id, signal=body.signal, use_llm=body.use_llm)
    return {
        "trace_id": body.trace_id,
        "incident_id": final.get("incident_id"),
        "chosen_root_cause": final.get("chosen_root_cause"),
        "chosen_confidence": final.get("chosen_confidence"),
        "needs_human_review": final.get("needs_human_review", False),
        "remediation_action": final.get("remediation_action"),
        "nodes_ran": nodes_that_ran(final),
    }


@router.get("/incidents", summary="List incidents",
            description="Filter incidents by root_cause and status. Admin only.")
async def list_incidents(
    root_cause: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(Incident).order_by(Incident.created_at.desc()).limit(limit)
    if root_cause is not None:
        try:
            stmt = stmt.where(Incident.root_cause == RootCause(root_cause))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"bad root_cause: {root_cause}") from exc
    if status is not None:
        try:
            stmt = stmt.where(Incident.status == IncidentStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"bad status: {status}") from exc

    rows = (await session.execute(stmt)).scalars().all()
    return {
        "count": len(rows),
        "incidents": [
            {
                "id": str(r.id), "trace_id": r.trace_id,
                "root_cause": r.root_cause.value if r.root_cause else None,
                "status": r.status.value,
                "classification_confidence": r.classification_confidence,
                "remediation_action": r.remediation_action,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


async def _get_or_404(session: AsyncSession, incident_id: str) -> Incident:
    try:
        iid = uuid.UUID(incident_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="invalid incident id") from exc
    incident = await session.get(Incident, iid)
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")
    return incident


@router.get("/incidents/{incident_id}", summary="Incident detail + diagnostic trail",
            description="Full incident including the per-node diagnostic trail and findings "
                        "from the swarm (Phase 5). Admin only.")
async def get_incident(
    incident_id: str,
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    incident = await _get_or_404(session, incident_id)
    return {
        "id": str(incident.id), "trace_id": incident.trace_id,
        "root_cause": incident.root_cause.value if incident.root_cause else None,
        "status": incident.status.value,
        "classification_confidence": incident.classification_confidence,
        "remediation_action": incident.remediation_action,
        "created_at": incident.created_at.isoformat() if incident.created_at else None,
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
        "diagnostic_trail": incident.diagnostic_trail,
    }


@router.patch("/incidents/{incident_id}", summary="Manually resolve an incident",
              description="Human-in-the-loop close-out for an unclassified / human-review incident. "
                          "Requires a resolution_note. Admin only.")
async def resolve_incident(
    incident_id: str,
    body: IncidentResolveRequest,
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    incident = await _get_or_404(session, incident_id)

    incident.status = IncidentStatus(body.status)
    incident.remediation_action = f"manual:{body.status}"
    incident.resolved_at = datetime.now(timezone.utc)
    trail = dict(incident.diagnostic_trail or {})
    trail["resolution"] = {
        "note": body.resolution_note,
        "status": body.status,
        "at": incident.resolved_at.isoformat(),
        "by": "human",
    }
    incident.diagnostic_trail = trail
    await session.commit()
    await session.refresh(incident)

    return {
        "id": str(incident.id),
        "status": incident.status.value,
        "resolved_at": incident.resolved_at.isoformat(),
        "resolution_note": body.resolution_note,
    }
