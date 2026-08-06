"""Index diagnostic — index freshness + retrieval-score trend over time.

Distinguishes a stale/aging index (declining retrieval quality + old/never
reindex) from a one-off retrieval miss.
"""
from __future__ import annotations

import structlog

from app.agents.state import INDEX_STALENESS, Finding, DiagnosticState, new_trail
from app.agents.tools.reindex_tool import get_index_freshness
from app.db.clickhouse.client import clickhouse_client

logger = structlog.get_logger(__name__)

# an index older than this (or never reindexed) is considered stale
_STALE_AGE_SECONDS = 7 * 24 * 3600


async def _recent_retrieval_score(limit: int = 50) -> float | None:
    """Mean retrieval.score across recent retrieval spans (ClickHouse)."""
    try:
        # avg over the most recent `limit` retrieval spans (subquery: can't mix
        # avg() with ORDER BY/LIMIT in one non-grouped SELECT).
        res = await clickhouse_client.execute(
            "SELECT avg(s) FROM ("
            "  SELECT toFloat64OrNull(attributes['retrieval.score']) AS s "
            "  FROM ledger.traces WHERE name = 'rag.retrieval' "
            "  AND attributes['retrieval.score'] != '' "
            "  ORDER BY start_time DESC LIMIT {n:UInt32}"
            ")",
            {"n": limit},
        )
        rows = res.result_rows
        return float(rows[0][0]) if rows and rows[0][0] is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("index_diagnostic.trend_query_failed", error=str(exc))
        return None


async def index_diagnostic(state: DiagnosticState) -> dict:
    tc = state.get("trace_context", {})
    index_name = tc.get("index_name", "default")

    freshness = await get_index_freshness(index_name)
    trend = await _recent_retrieval_score()
    this_rscore = tc.get("retrieval_score")
    this_rscore = trend if this_rscore is None else this_rscore

    ever = freshness["ever_reindexed"]
    age = freshness["age_seconds"]
    # Only a genuinely OLD reindex counts as stale. "Never reindexed" is unknown,
    # not stale — otherwise every first run would over-fire index_staleness.
    stale = age is not None and age > _STALE_AGE_SECONDS
    # broad decline in retrieval quality across recent traces is the other signal
    declining = trend is not None and trend < 0.5

    low_retrieval = this_rscore is not None and this_rscore < 0.5
    if low_retrieval and (stale or declining):
        confidence = round(min(1.0, (1.0 - this_rscore) + 0.2), 3)
    elif low_retrieval:
        # retrieval is bad but no staleness evidence -> weak; retrieval_diagnostic
        # should out-score this for a one-off retrieval miss.
        confidence = round(max(0.0, (1.0 - this_rscore) * 0.4), 3)
    else:
        confidence = 0.0

    evidence = {
        "index_name": index_name,
        "ever_reindexed": ever,
        "index_age_seconds": age,
        "stale": stale,
        "this_retrieval_score": this_rscore,
        "recent_retrieval_trend": trend,
    }
    finding = Finding(
        node="index_diagnostic",
        root_cause_candidate=INDEX_STALENESS if confidence > 0 else None,
        confidence=confidence,
        supporting_evidence=evidence,
    )
    logger.info("node.index_diagnostic", trace_id=state.get("trace_id"), confidence=confidence, **evidence)
    return {
        "findings": [finding],
        "trail": new_trail(
            "index_diagnostic",
            f"index_staleness confidence={confidence:.2f} (stale={stale}, retrieval={this_rscore})",
            **evidence,
        ),
    }
