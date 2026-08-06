"""Remediation node — actionable path only. Dispatches the matching tool for the
chosen root cause and writes a resolved (or failed) Incident.

Maps root cause -> tool:
  retrieval_failure -> reindex (stub)
  index_staleness   -> reindex (stub)
  prompt_regression -> rollback (to previous version)
  model_degradation -> reroute (deprioritize the tier)
"""
from __future__ import annotations

import structlog

from app.agents.nodes._incident import write_incident
from app.agents.state import (
    INDEX_STALENESS,
    MODEL_DEGRADATION,
    PROMPT_REGRESSION,
    RETRIEVAL_FAILURE,
    DiagnosticState,
)
from app.agents.tools.reindex_tool import reindex
from app.agents.tools.reroute_tool import reroute
from app.agents.tools.rollback_tool import rollback
from app.db.postgres.models import IncidentStatus
from app.eval.quality import model_to_tier

logger = structlog.get_logger(__name__)


async def _dispatch_tool(root: str, finding: dict, tc: dict) -> dict:
    evidence = (finding or {}).get("supporting_evidence", {})
    if root in (RETRIEVAL_FAILURE, INDEX_STALENESS):
        return await reindex(evidence.get("index_name", tc.get("index_name", "default")))
    if root == PROMPT_REGRESSION:
        return await rollback(
            evidence.get("prompt_name", tc.get("prompt_name", "rag_default")),
            to_version=evidence.get("previous_version"),
        )
    if root == MODEL_DEGRADATION:
        tier = evidence.get("generator_tier") or model_to_tier(tc.get("generator_model"))
        return await reroute(tier) if tier else {"tool": "reroute", "status": "noop", "reason": "no tier"}
    return {"tool": "none", "status": "noop"}


async def remediation(state: DiagnosticState) -> dict:
    root = state.get("chosen_root_cause")
    tc = state.get("trace_context", {})
    finding = state.get("chosen_finding")

    tool_result: dict | None = None
    error: str | None = None
    try:
        tool_result = await _dispatch_tool(root, finding, tc)
        action = f"{tool_result.get('tool')}:{tool_result.get('status')}"
        status = IncidentStatus.resolved
    except Exception as exc:  # noqa: BLE001 — tool failure must not crash the graph
        error = str(exc)
        action = f"remediation_failed:{root}"
        status = IncidentStatus.failed
        logger.error("node.remediation.tool_error", trace_id=state.get("trace_id"), root=root, error=error)

    incident_id, entry = await write_incident(state, action, status, tool_result, error)
    return {
        "remediation_action": action,
        "remediation_status": status.value,
        "incident_id": incident_id,
        "error": error,
        "trail": entry,
    }
