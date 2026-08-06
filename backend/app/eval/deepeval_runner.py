"""DeepEval scoring (answer relevancy, hallucination) via the judge router.

DeepEval defaults to OpenAI; we inject a custom DeepEvalBaseLLM backed by the
non-paid judge router and use the async API (a_measure/a_generate) so judge
calls stay on the caller's event loop. Falls back to a robust router-judge
scorer when the local judge can't satisfy DeepEval's structured output.

Score conventions:
  answer_relevance : 1 = fully relevant, 0 = irrelevant
  hallucination    : 1 = hallucinated / unsupported, 0 = fully grounded
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import structlog
from deepeval.metrics import AnswerRelevancyMetric, HallucinationMetric
from deepeval.models.base_model import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase

from app.eval.judge_router import JudgeRouter, judge_router
from app.eval.trace_data import TraceEvalData

logger = structlog.get_logger(__name__)


class RouterDeepEvalLLM(DeepEvalBaseLLM):
    """Adapts DeepEval's LLM interface onto the non-paid judge router."""

    def __init__(self, judge: JudgeRouter, force_tier: str | None = None):
        self._judge = judge
        self._force_tier = force_tier
        super().__init__(model_name="router-judge")

    def load_model(self):
        return self

    def get_model_name(self) -> str:
        return "router-judge"

    async def a_generate(self, prompt: str, schema=None, *args, **kwargs):
        resp = await self._judge.complete(
            prompt, force_tier=self._force_tier, max_tokens=1024
        )
        if schema is not None:
            return _coerce_schema(resp.text, schema)
        return resp.text

    def generate(self, prompt: str, schema=None, *args, **kwargs):
        # sync path unused by a_measure; provided for interface completeness
        import anyio

        return anyio.from_thread.run(self.a_generate, prompt, schema)


def _coerce_schema(text: str, schema):
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in judge output")
    return schema.model_validate(json.loads(text[start : end + 1]))


@dataclass
class DeepEvalScores:
    answer_relevance: float
    hallucination: float
    method: str  # "deepeval" | "fallback" | "mixed"


async def score_trace(data: TraceEvalData, judge: JudgeRouter | None = None) -> DeepEvalScores:
    judge = judge or judge_router
    model = RouterDeepEvalLLM(judge)
    ctx = data.contexts or ["(none)"]
    ctx_text = "\n".join(f"- {c}" for c in ctx)

    used_deepeval = False

    # --- answer relevancy ---
    relevance = None
    try:
        tc = LLMTestCase(input=data.question, actual_output=data.answer, retrieval_context=ctx)
        m = AnswerRelevancyMetric(model=model, async_mode=True, threshold=0.5)
        await m.a_measure(tc, _show_indicator=False)
        relevance = float(m.score) if m.score is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("deepeval.answer_relevancy_failed", error=str(exc))
    if relevance is None:
        relevance = await judge.score(
            f"Question: {data.question}\nAnswer: {data.answer}\n\n"
            "How relevant and on-topic is the answer to the question?"
        )
    else:
        used_deepeval = True

    # --- hallucination ---
    halluc = None
    try:
        tc = LLMTestCase(input=data.question, actual_output=data.answer, context=ctx)
        m = HallucinationMetric(model=model, async_mode=True, threshold=0.5)
        await m.a_measure(tc, _show_indicator=False)
        halluc = float(m.score) if m.score is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("deepeval.hallucination_failed", error=str(exc))
    if halluc is None:
        halluc = await judge.score(
            f"Answer: {data.answer}\nContext:\n{ctx_text}\n\n"
            "Does the answer contain claims that are NOT supported by, or contradict, "
            "the context? 1 means yes (hallucinated), 0 means fully grounded."
        )
    else:
        used_deepeval = True

    method = "deepeval" if used_deepeval else "fallback"
    return DeepEvalScores(relevance, halluc, method)
