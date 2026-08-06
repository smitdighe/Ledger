"""Classifier node — sub-second triage, routed through Cerebras (Phase 3 router).

Design: routing is driven by a DETERMINISTIC signal analysis of eval scores +
trace context (reliable, and the local judge is too weak to route on alone — see
Phase 4). An LLM opinion from Cerebras (falling back to Ollama) is gathered
best-effort and recorded in the trail, but does not override the heuristic. This
keeps fan-out decisions stable while honoring "routed through Cerebras".

A single bad signal fans out to only the 2 relevant diagnostics, never all 4.
"""
from __future__ import annotations

import asyncio

import structlog

from app.agents.state import (
    CLASSIFIER_SIGNAL_THRESHOLD,
    INDEX_STALENESS,
    MODEL_DEGRADATION,
    N_INDEX,
    N_MODEL,
    N_PROMPT,
    N_RETRIEVAL,
    PROMPT_REGRESSION,
    RETRIEVAL_FAILURE,
    DiagnosticState,
    new_trail,
)

logger = structlog.get_logger(__name__)

_T = CLASSIFIER_SIGNAL_THRESHOLD


def _retrieval_strength(ev: dict, tc: dict) -> float:
    prec = ev.get("retrieval_precision", 1.0)
    rec = ev.get("context_recall", 1.0)
    rscore = tc.get("retrieval_score", 1.0)
    if rscore is None:
        rscore = 1.0
    # strength = worst deficit among retrieval signals (higher = worse)
    return max(1.0 - prec, 1.0 - rec, 1.0 - rscore)


def _generation_strength(ev: dict) -> float:
    faith = ev.get("faithfulness", 1.0)
    rel = ev.get("answer_relevance", 1.0)
    hall = ev.get("hallucination", 0.0)  # higher = worse already
    return max(1.0 - faith, 1.0 - rel, hall)


async def _llm_opinion(state: DiagnosticState) -> str | None:
    if not state.get("use_llm", True):
        return None
    from app.router.selector import router  # lazy: avoid import cost when unused

    ev = state.get("eval_results", {})
    prompt = (
        "You are an SRE triaging an LLM RAG pipeline incident. Given these eval "
        f"scores {ev} and retrieval_score={state.get('trace_context', {}).get('retrieval_score')}, "
        "name the single most likely root cause from: retrieval_failure, "
        "prompt_regression, model_degradation, index_staleness. One word:"
    )
    try:
        resp = await asyncio.wait_for(router.complete(prompt, max_tokens=12), timeout=30)
        return resp.text.strip()
    except Exception as exc:  # noqa: BLE001 — advisory only
        logger.warning("classifier.llm_opinion_failed", error=str(exc))
        return None


async def classifier(state: DiagnosticState) -> dict:
    ev = state.get("eval_results", {})
    tc = state.get("trace_context", {})

    r_strength = _retrieval_strength(ev, tc)
    g_strength = _generation_strength(ev)
    r_trig = r_strength > (1.0 - _T)   # a metric fell below the threshold
    g_trig = g_strength > (1.0 - _T)

    targets: list[str] = []
    candidates: list[str] = []
    if r_trig:
        targets += [N_RETRIEVAL, N_INDEX]
        candidates += [RETRIEVAL_FAILURE, INDEX_STALENESS]
    if g_trig:
        targets += [N_PROMPT, N_MODEL]
        candidates += [PROMPT_REGRESSION, MODEL_DEGRADATION]

    ambiguous = r_trig and g_trig
    confidence = max(r_strength, g_strength) if (r_trig or g_trig) else 0.0

    llm_opinion = await _llm_opinion(state)

    classification = {
        "candidates": candidates,
        "targets": targets,
        "confidence": round(confidence, 3),
        "ambiguous": ambiguous,
        "retrieval_strength": round(r_strength, 3),
        "generation_strength": round(g_strength, 3),
        "llm_opinion": llm_opinion,
    }
    logger.info("node.classifier", trace_id=state.get("trace_id"), **classification)

    return {
        "classification": classification,
        "trail": new_trail(
            "classifier",
            f"targets={targets} conf={confidence:.2f} ambiguous={ambiguous}",
            **classification,
        ),
    }
