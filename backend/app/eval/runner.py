"""Orchestrator: run RAGAS + DeepEval on a trace and persist EvalResults."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.clickhouse.client import ClickHouseClient
from app.db.postgres.models import EvalResult, EvalType
from app.eval import deepeval_runner, ragas_runner
from app.eval.golden_set import get_active_version
from app.eval.judge_router import JudgeRouter, judge_router
from app.eval.trace_data import load_trace_eval_data

logger = structlog.get_logger(__name__)


@dataclass
class TraceEvalReport:
    trace_id: str
    generator_model: str | None
    fault: str | None
    faithfulness: float
    context_precision: float
    context_recall: float
    answer_relevance: float
    hallucination: float
    judge_model: str
    ragas_method: str
    deepeval_method: str


_METRIC_TO_TYPE = {
    "faithfulness": EvalType.faithfulness,
    "context_precision": EvalType.retrieval_precision,
    "context_recall": EvalType.context_recall,
    "answer_relevance": EvalType.answer_relevance,
    "hallucination": EvalType.hallucination,
}


async def evaluate_trace(
    session: AsyncSession,
    ch: ClickHouseClient,
    trace_id: str,
    golden_version: str | None = None,
    persist: bool = True,
    judge: JudgeRouter | None = None,
) -> TraceEvalReport:
    judge = judge or judge_router
    data = await load_trace_eval_data(ch, trace_id)
    if not data.usable:
        raise ValueError(f"trace {trace_id} missing question/answer; cannot evaluate")

    golden_version = golden_version or await get_active_version(session)

    judge.reset_log()
    ragas = await ragas_runner.score_trace(data, judge)
    deep = await deepeval_runner.score_trace(data, judge)
    judge_model = judge.call_log[-1] if judge.call_log else "router-judge"

    report = TraceEvalReport(
        trace_id=trace_id,
        generator_model=data.generator_model,
        fault=data.fault,
        faithfulness=ragas.faithfulness,
        context_precision=ragas.context_precision,
        context_recall=ragas.context_recall,
        answer_relevance=deep.answer_relevance,
        hallucination=deep.hallucination,
        judge_model=judge_model,
        ragas_method=ragas.method,
        deepeval_method=deep.method,
    )

    if persist:
        scores = {
            "faithfulness": ragas.faithfulness,
            "context_precision": ragas.context_precision,
            "context_recall": ragas.context_recall,
            "answer_relevance": deep.answer_relevance,
            "hallucination": deep.hallucination,
        }
        for metric, value in scores.items():
            session.add(
                EvalResult(
                    trace_id=trace_id,
                    eval_type=_METRIC_TO_TYPE[metric],
                    score=value,
                    judge_model=judge_model,
                    generator_model=data.generator_model,
                    golden_set_version=golden_version,
                )
            )
        await session.commit()

    logger.info("eval.trace_scored", **{k: v for k, v in asdict(report).items() if k != "trace_id"})
    return report
