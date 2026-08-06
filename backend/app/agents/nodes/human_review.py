"""Human-review terminal node — no confident/unambiguous root cause.

Writes an OPEN incident flagged for human review instead of forcing a guess.
"""
from __future__ import annotations

import structlog

from app.agents.nodes._incident import write_incident
from app.agents.state import DiagnosticState
from app.db.postgres.models import IncidentStatus

logger = structlog.get_logger(__name__)


async def human_review(state: DiagnosticState) -> dict:
    incident_id, entry = await write_incident(
        state,
        action="human_review_required",
        status=IncidentStatus.open,
        tool_result=None,
        error=None,
    )
    logger.info("node.human_review", trace_id=state.get("trace_id"), incident_id=incident_id)
    return {
        "remediation_action": "human_review_required",
        "remediation_status": IncidentStatus.open.value,
        "incident_id": incident_id,
        "trail": entry,
    }
