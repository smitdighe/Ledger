"""Phase 8 load test — sustained ingestion traffic against the LIVE API+worker.

Ramps concurrent POST /traces (run_eval configurable), measures POST latency,
ingestion-queue backlog over time, drain time, and verifies zero drops by
counting landed traces in ClickHouse.

    python scripts/load_test.py --total 1000 --concurrency 50
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import uuid

import httpx
import redis as redis_sync

from app.core.config import settings
from app.ingestion.otel_build import build_otlp_json

H = {"X-API-Key": settings.admin_api_key}
MS = 1_000_000
API = "http://127.0.0.1:8080/api/v1/traces"
MODELS = ["llama3.2:3b", "phi4-mini", "gemini-2.0-flash", "groq/llama-3.1-8b"]


def _hex(n): return os.urandom(n).hex()


def _payload():
    tid, root, retr, gen = uuid.uuid4().hex, _hex(8), _hex(8), _hex(8)
    now = time.time_ns()
    sp = [
        {"trace_id": tid, "span_id": root, "parent_span_id": "", "name": "rag.request",
         "start_ns": now, "end_ns": now + 10 * MS, "status": 0,
         "attributes": {"rag.question": "q?"}},
        {"trace_id": tid, "span_id": retr, "parent_span_id": root, "name": "rag.retrieval",
         "start_ns": now + MS, "end_ns": now + 3 * MS, "status": 0,
         "attributes": {"retrieval.score": 0.9, "retrieval.documents": json.dumps(["ctx"])}},
        {"trace_id": tid, "span_id": gen, "parent_span_id": root, "name": "rag.generation",
         "start_ns": now + 4 * MS, "end_ns": now + 9 * MS, "status": 0,
         "attributes": {"gen_ai.request.model": MODELS[int(now) % 4],
                        "gen_ai.completion": "ans", "gen_ai.usage.total_tokens": 100}},
    ]
    return tid, build_otlp_json(sp)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--total", type=int, default=1000)
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--run-eval", action="store_true")
    args = ap.parse_args()

    r = redis_sync.from_url(settings.redis_url, decode_responses=True)
    params = {"to_langfuse": "false", "run_eval": "true" if args.run_eval else "false"}

    sem = asyncio.Semaphore(args.concurrency)
    latencies, errors, tids = [], [], []
    peak_backlog = 0

    async def one(client):
        nonlocal peak_backlog
        tid, pl = _payload()
        async with sem:
            t0 = time.perf_counter()
            try:
                resp = await client.post(API, params=params, json=pl, headers=H)
                latencies.append((time.perf_counter() - t0) * 1000)
                if resp.status_code == 200:
                    tids.append(tid)
                else:
                    errors.append((resp.status_code, resp.text[:80]))
            except Exception as e:  # noqa: BLE001
                errors.append(("exc", str(e)[:80]))

    print(f"sending {args.total} traces, concurrency={args.concurrency}, run_eval={args.run_eval}")
    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=60) as client:
        tasks = [asyncio.create_task(one(client)) for _ in range(args.total)]
        # sample backlog while sending
        async def sampler():
            nonlocal peak_backlog
            while not all(t.done() for t in tasks):
                peak_backlog = max(peak_backlog, r.llen("ingestion"))
                await asyncio.sleep(0.2)
        samp = asyncio.create_task(sampler())
        await asyncio.gather(*tasks)
        samp.cancel()
    send_dur = time.perf_counter() - start

    accepted = len(tids)
    send_rate = accepted / send_dur * 60
    lat_sorted = sorted(latencies)
    p50 = lat_sorted[len(lat_sorted)//2] if lat_sorted else 0
    p99 = lat_sorted[int(len(lat_sorted)*0.99)] if lat_sorted else 0

    print(f"accepted={accepted}/{args.total} errors={len(errors)} "
          f"send_dur={send_dur:.1f}s send_rate={send_rate:.0f}/min "
          f"post_latency p50={p50:.0f}ms p99={p99:.0f}ms peak_ingestion_backlog={peak_backlog}")
    if errors:
        print("  first errors:", errors[:3])

    # True drain = poll ClickHouse landed-count until it stops rising (llen is
    # misleading under Celery prefetch/acks_late — backlog lives in unacked).
    import clickhouse_connect
    ch = clickhouse_connect.get_client(
        host=settings.clickhouse_host, port=settings.clickhouse_port,
        username=settings.clickhouse_user, password=settings.clickhouse_password,
        database=settings.clickhouse_db)

    def landed_count() -> int:
        c = 0
        for i in range(0, len(tids), 500):
            chunk = tids[i:i+500]
            c += ch.query("SELECT uniqExact(trace_id) FROM ledger.traces WHERE trace_id IN %(ids)s",
                          parameters={"ids": chunk}).result_rows[0][0]
        return c

    drain_start = time.perf_counter()
    prev, stable = -1, 0
    while time.perf_counter() - drain_start < 300:
        cur = landed_count()
        if cur == accepted:
            break
        if cur == prev:
            stable += 1
            if stable >= 4:  # no progress for ~4s -> worker idle / stuck
                break
        else:
            stable = 0
        prev = cur
        await asyncio.sleep(1)
    drain = time.perf_counter() - drain_start
    landed = landed_count()
    total = time.perf_counter() - start
    print(f"landed_in_clickhouse={landed}/{accepted} DROPS={accepted - landed} "
          f"drain_time={drain:.1f}s worker_throughput={landed/total*60:.0f} traces/min")


if __name__ == "__main__":
    asyncio.run(main())
