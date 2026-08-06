"""Pull a trace from ClickHouse and extract the fields eval needs."""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.db.clickhouse.client import ClickHouseClient
from app.ingestion.clickhouse_writer import read_trace


@dataclass
class TraceEvalData:
    trace_id: str
    question: str = ""
    answer: str = ""
    contexts: list[str] = field(default_factory=list)
    generator_model: str | None = None
    retrieval_score: float | None = None
    fault: str | None = None

    @property
    def usable(self) -> bool:
        return bool(self.question and self.answer)


def _f(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


async def load_trace_eval_data(ch: ClickHouseClient, trace_id: str) -> TraceEvalData:
    spans = await read_trace(ch, trace_id)
    data = TraceEvalData(trace_id=trace_id)
    for sp in spans:
        attrs = sp.get("attributes") or {}
        name = sp.get("name")
        if name == "rag.request":
            data.question = attrs.get("rag.question", data.question)
            data.fault = attrs.get("ledger.fault", data.fault)
        elif name == "rag.retrieval":
            docs = attrs.get("retrieval.documents")
            if docs:
                try:
                    data.contexts = json.loads(docs)
                except (json.JSONDecodeError, TypeError):
                    data.contexts = [docs]
            data.retrieval_score = _f(attrs.get("retrieval.score"))
        elif name == "rag.generation":
            data.answer = attrs.get("gen_ai.completion", data.answer)
            data.generator_model = attrs.get("gen_ai.request.model", data.generator_model)
    return data
