"""RAGAS scoring (faithfulness, context precision/recall) via the judge router.

RAGAS defaults to OpenAI; we inject a BaseRagasLLM backed by the non-paid judge
router. With a small local judge, RAGAS's structured-output prompts can fail to
parse — each metric therefore falls back to a robust router-judge scorer. Both
paths are non-paid.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass

import app.eval._ragas_compat  # noqa: F401  (must precede ragas import)
import structlog
from langchain_core.outputs import Generation, LLMResult
from ragas.dataset_schema import SingleTurnSample
from ragas.llms.base import BaseRagasLLM
from ragas.metrics import (
    Faithfulness,
    LLMContextPrecisionWithReference,
    LLMContextRecall,
)

from app.eval.judge_router import JudgeRouter, judge_router
from app.eval.trace_data import TraceEvalData

logger = structlog.get_logger(__name__)

_METRIC_TIMEOUT = 90  # seconds per RAGAS metric before falling back


class RouterRagasLLM(BaseRagasLLM):
    """Adapts RAGAS's LLM interface onto the non-paid judge router."""

    def __init__(self, judge: JudgeRouter, force_tier: str | None = None):
        self._judge = judge
        self._force_tier = force_tier
        # RAGAS metrics read `.run_config` off the LLM; BaseRagasLLM's __init__
        # sets it. We don't call super().__init__ (no positional llm), so set it
        # explicitly or the framework path fails with AttributeError.
        from ragas.run_config import RunConfig

        self.run_config = RunConfig()

    def set_run_config(self, run_config) -> None:
        self.run_config = run_config

    def is_finished(self, response: LLMResult) -> bool:
        return True

    async def agenerate_text(self, prompt, n=1, temperature=None, stop=None, callbacks=None) -> LLMResult:
        text = prompt.to_string() if hasattr(prompt, "to_string") else str(prompt)
        resp = await self._judge.complete(
            text, force_tier=self._force_tier, max_tokens=1024, temperature=temperature or 0.0
        )
        gens = [[Generation(text=resp.text)] for _ in range(n)]
        return LLMResult(generations=gens)

    def generate_text(self, prompt, n=1, temperature=None, stop=None, callbacks=None) -> LLMResult:
        return asyncio.get_event_loop().run_until_complete(
            self.agenerate_text(prompt, n, temperature, stop, callbacks)
        )


@dataclass
class RagasScores:
    faithfulness: float
    context_precision: float
    context_recall: float
    method: str  # "ragas" | "fallback" | "mixed"


async def _safe_metric(coro_factory, label: str) -> float | None:
    try:
        val = await asyncio.wait_for(coro_factory(), timeout=_METRIC_TIMEOUT)
        if val is None or val != val:  # NaN guard
            return None
        return float(val)
    except Exception as exc:  # noqa: BLE001
        # include the type: TimeoutError et al. have an empty str()
        logger.warning("ragas.metric_failed", metric=label, error=f"{type(exc).__name__}: {exc}")
        return None


async def score_trace(data: TraceEvalData, judge: JudgeRouter | None = None) -> RagasScores:
    judge = judge or judge_router
    ragas_llm = RouterRagasLLM(judge)
    ctx = data.contexts or []
    ctx_text = "\n".join(f"- {c}" for c in ctx) if ctx else "(no context retrieved)"

    sample = SingleTurnSample(
        user_input=data.question,
        response=data.answer,
        retrieved_contexts=ctx or ["(none)"],
        reference=data.answer,  # golden reference for recall
    )

    used_ragas = False

    # --- faithfulness ---
    faith = await _safe_metric(
        lambda: Faithfulness(llm=ragas_llm).single_turn_ascore(sample), "faithfulness"
    )
    if faith is None:
        faith = await judge.score(
            f"Answer: {data.answer}\nContext:\n{ctx_text}\n\n"
            "How well is every factual claim in the answer supported by the context?"
        )
    else:
        used_ragas = True

    # --- context precision ---
    precision = await _safe_metric(
        lambda: LLMContextPrecisionWithReference(llm=ragas_llm).single_turn_ascore(sample),
        "context_precision",
    )
    if precision is None:
        precision = await judge.score(
            f"Question: {data.question}\nRetrieved context:\n{ctx_text}\n\n"
            "How relevant is the retrieved context to answering the question?"
        )
    else:
        used_ragas = True

    # --- context recall ---
    recall = await _safe_metric(
        lambda: LLMContextRecall(llm=ragas_llm).single_turn_ascore(sample), "context_recall"
    )
    if recall is None:
        recall = await judge.score(
            f"Expected answer: {data.answer}\nRetrieved context:\n{ctx_text}\n\n"
            "How much of the expected answer's information is present in the context?"
        )
    else:
        used_ragas = True

    method = "ragas" if used_ragas else "fallback"
    return RagasScores(faith, precision, recall, method)
