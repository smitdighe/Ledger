"""Diagnostic swarm StateGraph + runner.

Topology:

    classifier ─(targets)─▶ [retrieval|index|prompt|model diagnostics] ─▶ decision
        │  (no signal)                                                      │
        └───────────────────────────────▶ decision ◀──────────────────────┘
                                             │
                          ┌──────────────────┴───────────────────┐
                    (confident)                             (ambiguous/low)
                          ▼                                       ▼
                     remediation ──▶ END                    human_review ──▶ END

All edges are wired explicitly (conditional fan-out + explicit join). A single
bad signal fans out to only its 2 relevant diagnostics.
"""
from __future__ import annotations

import structlog
from langgraph.graph import END, StateGraph
from sqlalchemy import select

from app.agents.nodes.classifier import classifier
from app.agents.nodes.decision import decision
from app.agents.nodes.human_review import human_review
from app.agents.nodes.index_diagnostic import index_diagnostic
from app.agents.nodes.model_diagnostic import model_diagnostic
from app.agents.nodes.prompt_diagnostic import prompt_diagnostic
from app.agents.nodes.remediation import remediation
from app.agents.nodes.retrieval_diagnostic import retrieval_diagnostic
from app.agents.state import (
    N_INDEX,
    N_MODEL,
    N_PROMPT,
    N_RETRIEVAL,
    DiagnosticState,
)
from app.db.clickhouse.client import clickhouse_client
from app.db.postgres.models import EvalResult
from app.db.postgres.session import AsyncSessionLocal
from app.eval.trace_data import load_trace_eval_data

logger = structlog.get_logger(__name__)

_EVAL_METRIC_KEYS = {
    "faithfulness": "faithfulness",
    "retrieval_precision": "retrieval_precision",
    "context_recall": "context_recall",
    "answer_relevance": "answer_relevance",
    "hallucination": "hallucination",
}


def _route_after_classifier(state: DiagnosticState) -> list[str]:
    targets = state.get("classification", {}).get("targets", [])
    return targets if targets else ["decision"]


def _route_after_decision(state: DiagnosticState) -> str:
    return "human_review" if state.get("needs_human_review") else "remediation"


def build_graph():
    g = StateGraph(DiagnosticState)
    g.add_node("classifier", classifier)
    g.add_node(N_RETRIEVAL, retrieval_diagnostic)
    g.add_node(N_INDEX, index_diagnostic)
    g.add_node(N_PROMPT, prompt_diagnostic)
    g.add_node(N_MODEL, model_diagnostic)
    g.add_node("decision", decision)
    g.add_node("remediation", remediation)
    g.add_node("human_review", human_review)

    g.set_entry_point("classifier")
    g.add_conditional_edges(
        "classifier",
        _route_after_classifier,
        {N_RETRIEVAL: N_RETRIEVAL, N_INDEX: N_INDEX, N_PROMPT: N_PROMPT,
         N_MODEL: N_MODEL, "decision": "decision"},
    )
    for diag in (N_RETRIEVAL, N_INDEX, N_PROMPT, N_MODEL):
        g.add_edge(diag, "decision")
    g.add_conditional_edges(
        "decision",
        _route_after_decision,
        {"remediation": "remediation", "human_review": "human_review"},
    )
    g.add_edge("remediation", END)
    g.add_edge("human_review", END)
    return g.compile()


diagnostic_graph = build_graph()


async def _load_eval_results(trace_id: str) -> dict[str, float]:
    """Latest EvalResult per metric for a trace_id."""
    async with AsyncSessionLocal() as s:
        rows = (
            await s.execute(
                select(EvalResult)
                .where(EvalResult.trace_id == trace_id)
                .order_by(EvalResult.created_at.desc())
            )
        ).scalars().all()
    out: dict[str, float] = {}
    for r in rows:
        key = _EVAL_METRIC_KEYS.get(r.eval_type.value)
        if key and key not in out:  # first (most recent) wins
            out[key] = float(r.score)
    return out


async def _load_trace_context(trace_id: str) -> dict:
    data = await load_trace_eval_data(clickhouse_client, trace_id)
    return {
        "retrieval_score": data.retrieval_score,
        "generator_model": data.generator_model,
        "fault": data.fault,
        "prompt_name": "rag_default",
        "index_name": "default",
    }


async def run_diagnostic_graph(
    trace_id: str,
    signal: str = "eval_flag",
    use_llm: bool = True,
    eval_results: dict[str, float] | None = None,
    trace_context: dict | None = None,
) -> DiagnosticState:
    if eval_results is None:
        eval_results = await _load_eval_results(trace_id)
    if trace_context is None:
        trace_context = await _load_trace_context(trace_id)

    initial: DiagnosticState = {
        "trace_id": trace_id,
        "signal": signal,
        "eval_results": eval_results,
        "trace_context": trace_context,
        "use_llm": use_llm,
        "findings": [],
        "trail": [],
    }
    logger.info("graph.run", trace_id=trace_id, signal=signal, eval_results=eval_results)
    final = await diagnostic_graph.ainvoke(initial)
    return final


def nodes_that_ran(final_state: DiagnosticState) -> list[str]:
    """Ordered list of node names from the trail (for topology inspection)."""
    return [e["node"] for e in final_state.get("trail", [])]
