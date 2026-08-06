"""Shared LangGraph state for the diagnostic swarm.

Parallel diagnostic nodes append to `findings` and `trail` via additive
reducers so fan-out/fan-in merges cleanly. Root-cause candidate strings match
the Phase 1 `RootCause` enum values.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

# canonical root-cause labels (== app.db.postgres.models.RootCause values)
RETRIEVAL_FAILURE = "retrieval_failure"
PROMPT_REGRESSION = "prompt_regression"
MODEL_DEGRADATION = "model_degradation"
INDEX_STALENESS = "index_staleness"

# diagnostic node names
N_RETRIEVAL = "retrieval_diagnostic"
N_PROMPT = "prompt_diagnostic"
N_MODEL = "model_diagnostic"
N_INDEX = "index_diagnostic"

# routing / decision thresholds
CLASSIFIER_SIGNAL_THRESHOLD = 0.5   # eval score below this = a bad signal
DECISION_CONFIDENCE_THRESHOLD = 0.55  # min finding confidence to remediate
AMBIGUITY_MARGIN = 0.10             # same-bucket top-2 closer than this = ambiguous
AMBIGUITY_MARGIN_CROSS = 0.25       # cross-bucket (retrieval vs generation) mixed signal

# which broad failure domain each root cause belongs to
ROOT_CAUSE_BUCKET = {
    RETRIEVAL_FAILURE: "retrieval",
    INDEX_STALENESS: "retrieval",
    PROMPT_REGRESSION: "generation",
    MODEL_DEGRADATION: "generation",
}


class Finding(TypedDict):
    node: str
    root_cause_candidate: str | None
    confidence: float
    supporting_evidence: dict[str, Any]


class TrailEntry(TypedDict):
    node: str
    summary: str
    data: dict[str, Any]


class DiagnosticState(TypedDict, total=False):
    # --- inputs ---
    trace_id: str
    signal: str                       # what triggered the graph
    eval_results: dict[str, float]    # metric -> score (Phase 4)
    trace_context: dict[str, Any]     # retrieval_score, generator_model, fault, ...
    use_llm: bool                     # gather Cerebras LLM opinion in classifier

    # --- classifier ---
    classification: dict[str, Any]    # {candidates, confidence, targets, llm_opinion}

    # --- diagnostics (additive across parallel nodes) ---
    findings: Annotated[list[Finding], operator.add]
    trail: Annotated[list[TrailEntry], operator.add]

    # --- decision ---
    chosen_root_cause: str | None
    chosen_confidence: float
    chosen_finding: dict[str, Any]
    needs_human_review: bool

    # --- remediation ---
    remediation_action: str | None
    remediation_status: str
    incident_id: str | None

    # --- error handling ---
    error: str | None
    retries: int


def new_trail(node: str, summary: str, **data: Any) -> list[TrailEntry]:
    """Convenience: single-entry trail list for a node's return."""
    return [TrailEntry(node=node, summary=summary, data=data)]
