"""Shared Incident persistence for the terminal graph nodes."""
from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.agents.state import DiagnosticState, TrailEntry, new_trail
from app.db.postgres.models import Incident, IncidentStatus, RootCause
from app.db.postgres.session import AsyncSessionLocal

logger = structlog.get_logger(__name__)


async def write_incident(
    state: DiagnosticState,
    action: str,
    status: IncidentStatus,
    tool_result: dict | None,
    error: str | None,
) -> tuple[str, list[TrailEntry]]:
    trace_id = state.get("trace_id")
    root = state.get("chosen_root_cause")
    confidence = state.get("chosen_confidence", 0.0)
    review = state.get("needs_human_review", False) or not root

    entry = new_trail(
        "remediation" if not review else "human_review",
        f"action={action} status={status.value}",
        tool_result=tool_result,
        error=error,
    )
    diagnostic_trail = {
        "trail": state.get("trail", []) + entry,
        "findings": state.get("findings", []),
        "classification": state.get("classification", {}),
        "chosen_root_cause": root,
        "chosen_confidence": confidence,
        "needs_human_review": review,
        "tool_result": tool_result,
    }

    async with AsyncSessionLocal() as s:
        incident = Incident(
            trace_id=trace_id,
            root_cause=RootCause(root) if root else None,
            status=status,
            classification_confidence=confidence,
            remediation_action=action,
            diagnostic_trail=diagnostic_trail,
            resolved_at=datetime.now(timezone.utc) if status == IncidentStatus.resolved else None,
        )
        s.add(incident)
        await s.commit()
        await s.refresh(incident)
        incident_id = str(incident.id)

    logger.info("incident.written", trace_id=trace_id, incident_id=incident_id,
                action=action, status=status.value, root=root)
    return incident_id, entry
