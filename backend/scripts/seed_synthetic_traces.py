"""Generate realistic synthetic RAG traces and push them through POST /traces.

Each trace: rag.request (root) -> rag.retrieval + rag.generation (LLM span).
~30% of traces get an injected fault: high latency, low retrieval score, or
hallucinated-looking output. Later phases (eval/agents) validate against these.

    python scripts/seed_synthetic_traces.py --count 20
"""
from __future__ import annotations

import argparse
import json
import os
import random
import time
import uuid

import httpx

from app.eval.synthetic_qa import (
    CANONICAL_QA,
    HALLUCINATED_ANSWERS,
    IRRELEVANT_CONTEXTS,
)
from app.ingestion.otel_build import SpanSpec, build_otlp_json

MODELS = ["llama3.2:3b", "phi4-mini", "gemini-2.0-flash", "groq/llama-3.1-8b"]


def _hex(n: int) -> str:
    return os.urandom(n).hex()


def _make_trace() -> list[SpanSpec]:
    trace_id = uuid.uuid4().hex  # 32 hex
    root_id = _hex(8)
    retr_id = _hex(8)
    gen_id = _hex(8)

    fault = random.random() < 0.30
    fault_kind = random.choice(["latency", "low_recall", "hallucination"]) if fault else None

    qi = random.randrange(len(CANONICAL_QA))
    entry = CANONICAL_QA[qi]
    question = entry["question"]

    # tie retrieved contexts + answer to the fault kind so eval has real signal
    if fault_kind == "low_recall":
        contexts = list(IRRELEVANT_CONTEXTS)
        answer = entry["answer"]
    elif fault_kind == "hallucination":
        contexts = list(entry["contexts"])
        answer = HALLUCINATED_ANSWERS[qi % len(HALLUCINATED_ANSWERS)]
    else:
        contexts = list(entry["contexts"])
        answer = entry["answer"]

    retrieval_score = 0.12 if fault_kind == "low_recall" else round(random.uniform(0.72, 0.98), 3)
    gen_latency_ms = 8200 if fault_kind == "latency" else random.randint(180, 900)
    retr_latency_ms = 2500 if fault_kind == "latency" else random.randint(40, 260)

    now = time.time_ns()
    root_start = now
    retr_start = now + 1_000_000
    retr_end = retr_start + retr_latency_ms * 1_000_000
    gen_start = retr_end + 1_000_000
    gen_end = gen_start + gen_latency_ms * 1_000_000
    root_end = gen_end + 1_000_000

    err = 2 if fault_kind == "hallucination" else 0

    root: SpanSpec = {
        "trace_id": trace_id,
        "span_id": root_id,
        "parent_span_id": "",
        "name": "rag.request",
        "start_ns": root_start,
        "end_ns": root_end,
        "status": err,
        "attributes": {"rag.question": question, "ledger.fault": fault_kind or "none"},
    }
    retrieval: SpanSpec = {
        "trace_id": trace_id,
        "span_id": retr_id,
        "parent_span_id": root_id,
        "name": "rag.retrieval",
        "start_ns": retr_start,
        "end_ns": retr_end,
        "status": 0,
        "attributes": {
            "retrieval.score": retrieval_score,
            "retrieval.num_docs": len(contexts),
            "retrieval.top_k": 5,
            "retrieval.documents": json.dumps(contexts),
        },
    }
    generation: SpanSpec = {
        "trace_id": trace_id,
        "span_id": gen_id,
        "parent_span_id": root_id,
        "name": "rag.generation",
        "start_ns": gen_start,
        "end_ns": gen_end,
        "status": err,
        "attributes": {
            "gen_ai.request.model": random.choice(MODELS),
            "gen_ai.prompt": f"Context + question: {question}",
            "gen_ai.completion": answer,
            "gen_ai.usage.input_tokens": random.randint(200, 1200),
            "gen_ai.usage.output_tokens": random.randint(20, 180),
            "gen_ai.usage.total_tokens": random.randint(240, 1350),
            "ledger.hallucination_suspected": fault_kind == "hallucination",
        },
    }
    return [root, retrieval, generation]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--url", default="http://localhost:8000/api/v1/traces")
    ap.add_argument("--no-langfuse", action="store_true")
    args = ap.parse_args()

    faults = 0
    with httpx.Client(timeout=30) as client:
        for i in range(args.count):
            spans = _make_trace()
            if spans[0]["attributes"]["ledger.fault"] != "none":
                faults += 1
            payload = build_otlp_json(spans)
            params = {"to_langfuse": "false"} if args.no_langfuse else {}
            r = client.post(args.url, json=payload, params=params)
            r.raise_for_status()
            data = r.json()
            print(f"[{i + 1:>3}/{args.count}] trace={data['trace_ids'][0]} "
                  f"spans={data['accepted_spans']} ch_rows={data['clickhouse_rows_written']} "
                  f"lf={data['langfuse_traces_pushed']}")

    print(f"\nseeded {args.count} traces ({faults} with injected faults)")


if __name__ == "__main__":
    main()
