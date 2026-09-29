"""Replay the diagnostic-swarm integration scenarios A -> B -> C and record the
real outputs the video shows.

Mode A (this script): disposable postgres:16-alpine + redis:7-alpine containers
on free ports, `alembic upgrade head`, then each scenario runs the real
`run_diagnostic_graph` with exactly the inserts and inputs of
backend/tests/integration/test_diagnostic_swarm.py (use_llm=False). ClickHouse
points at an unreachable port on purpose: index_diagnostic's trend query
catches the error and returns None, as it would with no retrieval history.

Every scenario runs in its own child process so its structlog stdout can be
captured verbatim (ANSI colour codes stripped) into data/logs/{A,B,C}.log.
State carries over between children through the containers, exactly like the
test module's shared database.

Nothing here can reach the developer database: all DSNs are overridden in the
environment (env beats backend/.env) and asserted before the first write.

Run:  node tools/run-py.js tools/run_scenarios.py [--no-probe] [--keep]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

VIDEO = Path(__file__).resolve().parents[1]
REPO = VIDEO.parent
BACKEND = REPO / "backend"
DATA = VIDEO / "data"
FIXTURES = DATA / "fixtures"
LOGS = DATA / "logs"

PG_IMAGE = "postgres:16-alpine"
REDIS_IMAGE = "redis:7-alpine"
PG_NAME = "ledger-video-pg"
REDIS_NAME = "ledger-video-redis"
PG_DB, PG_USER, PG_PASS = "ledger_video", "ledger", "video"
ADMIN_KEY = "video-admin"
INGEST_KEY = "video-ingest"

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


# ==========================================================================
# orchestrator side
# ==========================================================================
def _docker(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], capture_output=True, text=True, check=check)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait(cmd: list[str], ok, what: str, timeout: float = 90.0) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and ok(r.stdout):
            return
        time.sleep(0.5)
    raise TimeoutError(f"{what} not ready after {timeout}s")


def start_containers() -> tuple[int, int]:
    for name in (PG_NAME, REDIS_NAME):
        _docker("rm", "-f", name, check=False)
    pg_port, redis_port = _free_port(), _free_port()
    _docker("run", "-d", "--name", PG_NAME,
            "-e", f"POSTGRES_USER={PG_USER}", "-e", f"POSTGRES_PASSWORD={PG_PASS}",
            "-e", f"POSTGRES_DB={PG_DB}", "-p", f"127.0.0.1:{pg_port}:5432", PG_IMAGE)
    _docker("run", "-d", "--name", REDIS_NAME, "-p", f"127.0.0.1:{redis_port}:6379", REDIS_IMAGE)
    # -h 127.0.0.1: the entrypoint's init-phase server only listens on the unix socket
    _wait(["docker", "exec", PG_NAME, "pg_isready", "-h", "127.0.0.1", "-U", PG_USER, "-d", PG_DB],
          lambda out: "accepting connections" in out, "postgres")
    _wait(["docker", "exec", REDIS_NAME, "redis-cli", "ping"], lambda out: "PONG" in out, "redis")
    return pg_port, redis_port


def stop_containers() -> None:
    for name in (PG_NAME, REDIS_NAME):
        _docker("rm", "-f", "-v", name, check=False)


def scenario_env(pg_port: int, redis_port: int) -> dict[str, str]:
    redis_url = f"redis://127.0.0.1:{redis_port}/0"
    return {
        "DATABASE_URL": f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@127.0.0.1:{pg_port}/{PG_DB}",
        "ALEMBIC_DATABASE_URL": f"postgresql+psycopg://{PG_USER}:{PG_PASS}@127.0.0.1:{pg_port}/{PG_DB}",
        "REDIS_URL": redis_url,
        "CELERY_BROKER_URL": redis_url,
        "CELERY_RESULT_BACKEND": redis_url,
        # unreachable on purpose (see module docstring)
        "CLICKHOUSE_HOST": "127.0.0.1",
        "CLICKHOUSE_PORT": "1",
        "CLICKHOUSE_NATIVE_PORT": "1",
        "CLICKHOUSE_PASSWORD": "video",
        "LANGFUSE_HOST": "http://127.0.0.1:1",
        "LANGFUSE_PUBLIC_KEY": "",
        "LANGFUSE_SECRET_KEY": "",
        "LANGFUSE_TRACING_ENABLED": "false",
        "ADMIN_API_KEY": ADMIN_KEY,
        "INGESTION_API_KEY": INGEST_KEY,
        "APP_ENV": "local",
        "ALLOWED_ORIGINS": "",
        "LEDGER_VIDEO_PG_PORT": str(pg_port),
        "LEDGER_VIDEO_REDIS_PORT": str(redis_port),
        "DEEPEVAL_TELEMETRY_OPT_OUT": "1",
        "DEEPEVAL_DISABLE_DOTENV": "1",
        "RAGAS_DO_NOT_TRACK": "true",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }


def run_child(step: str, env: dict[str, str], extra: list[str] | None = None) -> dict:
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / f"{step}.json"
        cmd = [sys.executable, str(Path(__file__).resolve()), "--step", step, "--out", str(out), *(extra or [])]
        r = subprocess.run(cmd, cwd=BACKEND, env={**os.environ, **env}, capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            sys.stderr.write(r.stderr[-6000:])
            raise RuntimeError(f"step {step} failed ({r.returncode})")
        if step in ("A", "B", "C"):
            LOGS.mkdir(parents=True, exist_ok=True)
            text = ANSI.sub("", r.stdout).replace("\r\n", "\n")
            (LOGS / f"{step}.log").write_text(text, encoding="utf-8")
        return json.loads(out.read_text(encoding="utf-8"))


def orchestrate(args: argparse.Namespace) -> None:
    pg_port, redis_port = start_containers()
    try:
        env = scenario_env(pg_port, redis_port)
        mig = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND,
                             env={**os.environ, **env}, capture_output=True, text=True)
        if mig.returncode != 0:
            sys.stderr.write(mig.stderr[-4000:])
            raise RuntimeError("alembic upgrade head failed")
        results = {}
        for step in ("A", "B", "C"):
            results[step] = run_child(step, env)
            print(f"scenario {step}: ok")
        extra = ["--ids", json.dumps({k: results[k]["final"]["incident_id"] for k in "ABC"})]
        if args.no_probe:
            extra.append("--no-probe")
        fixtures = run_child("fixtures", env, extra)
        write_fixtures(results, fixtures)
        print("fixtures: ok")
    finally:
        if not args.keep:
            stop_containers()


def write_fixtures(results: dict, fx: dict) -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    prov = {
        "_provenance": "mode-a",
        "_how": "video/tools/run_scenarios.py: disposable postgres:16-alpine + redis:7-alpine, "
                "alembic upgrade head, scenarios replayed from "
                "backend/tests/integration/test_diagnostic_swarm.py with use_llm=False",
    }

    def dump(name: str, body) -> None:
        payload = {**prov, **body} if isinstance(body, dict) else {**prov, "data": body}
        (FIXTURES / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
                                     encoding="utf-8")

    for k in "ABC":
        dump(f"scenario_{k}.json", results[k])
    for name, body in fx["api"].items():
        dump(f"api_{name}.json", body)
    dump("hook_trace.json", fx["hook_trace"])
    dump("ingest.json", fx["ingest"])
    dump("probe.json", fx["probe"])


# ==========================================================================
# child side (imports the real app; env already points at the containers)
# ==========================================================================
def _guard() -> None:
    from app.core.config import settings

    pg = os.environ["LEDGER_VIDEO_PG_PORT"]
    rd = os.environ["LEDGER_VIDEO_REDIS_PORT"]
    if f"@127.0.0.1:{pg}/{PG_DB}" not in settings.database_url:
        raise SystemExit("refusing to run: DATABASE_URL is not the disposable container")
    if f"127.0.0.1:{rd}/" not in settings.redis_url:
        raise SystemExit("refusing to run: REDIS_URL is not the disposable container")


def _jsonable(obj):
    return json.loads(json.dumps(obj, default=str))


def _ev(trace_id, score, gen_model, created_at):
    from app.db.postgres.models import EvalResult, EvalType

    return EvalResult(trace_id=trace_id, eval_type=EvalType.faithfulness, score=score,
                      judge_model="fake", generator_model=gen_model, created_at=created_at)


async def step_a() -> dict:
    from app.agents.graph import nodes_that_ran, run_diagnostic_graph

    # test_retrieval_failure_classified_and_remediated
    final = await run_diagnostic_graph(
        "swarm-retrieval", use_llm=False,
        eval_results={"faithfulness": 0.92, "answer_relevance": 0.9, "hallucination": 0.0,
                      "retrieval_precision": 0.15, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.12, "generator_model": "llama3.2:3b",
                       "prompt_name": "rag_default", "index_name": "default"},
    )
    # same test: reindex is idempotent, a second run must not throw
    second = await run_diagnostic_graph(
        "swarm-retrieval", use_llm=False,
        eval_results={"faithfulness": 0.92, "answer_relevance": 0.9, "hallucination": 0.0,
                      "retrieval_precision": 0.15, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.12, "generator_model": "llama3.2:3b"},
    )
    return {"scenario": "A", "test": "test_retrieval_failure_classified_and_remediated",
            "nodes_ran": nodes_that_ran(final), "final": _jsonable(final),
            "repeat": {"nodes_ran": nodes_that_ran(second), "incident_id": second.get("incident_id"),
                       "remediation_action": second.get("remediation_action")}}


async def step_b() -> dict:
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import delete, select

    from app.agents.graph import nodes_that_ran, run_diagnostic_graph
    from app.agents.tools.rollback_tool import rollback
    from app.db.postgres.models import EvalResult, EvalType, PromptVersion
    from app.db.postgres.session import AsyncSessionLocal
    from app.eval import drift
    from app.eval.runner import TraceEvalReport
    from app.tasks.eval_tasks import _flag_reasons

    now = datetime.now(timezone.utc)
    # test_prompt_regression_triggers_rollback: identical setup
    async with AsyncSessionLocal() as s:
        await s.execute(delete(EvalResult).where(EvalResult.eval_type == EvalType.faithfulness))
        await s.execute(delete(PromptVersion).where(PromptVersion.prompt_name == "rag_default"))
        s.add(PromptVersion(prompt_name="rag_default", version=1, content_hash="h1",
                            content="good prompt", is_active=True, created_at=now - timedelta(days=3)))
        s.add(PromptVersion(prompt_name="rag_default", version=2, content_hash="h2",
                            content="regressed prompt", is_active=False, created_at=now - timedelta(days=1)))
        for _ in range(10):
            s.add(_ev("hist-before", 0.9, "groq/llama-3.1-8b", now - timedelta(days=2)))
        for _ in range(10):
            s.add(_ev("hist-after", 0.25, None, now))
        await s.commit()

    scores = {"faithfulness": 0.25, "answer_relevance": 0.3, "hallucination": 0.6,
              "retrieval_precision": 0.9, "context_recall": 0.9}

    # what eval_tasks._eval_impl does before dispatching: rolling drift (persist=False)
    # over this history, then _flag_reasons on the trace's scores
    async with AsyncSessionLocal() as s:
        d = await drift.detect_drift(s, EvalType.faithfulness, persist=False)
        history = [
            {"trace_id": r.trace_id, "score": r.score, "generator_model": r.generator_model,
             "created_at": r.created_at.isoformat()}
            for r in (await s.execute(
                select(EvalResult).where(EvalResult.eval_type == EvalType.faithfulness)
                .order_by(EvalResult.created_at.asc(), EvalResult.trace_id.desc())
            )).scalars().all()
        ]
        versions_before = [
            {"version": v.version, "is_active": v.is_active, "created_at": v.created_at.isoformat()}
            for v in (await s.execute(select(PromptVersion).order_by(PromptVersion.version))).scalars().all()
        ]
    report = TraceEvalReport(
        trace_id="swarm-prompt", generator_model="groq/llama-3.1-8b", fault=None,
        faithfulness=scores["faithfulness"], context_precision=scores["retrieval_precision"],
        context_recall=scores["context_recall"], answer_relevance=scores["answer_relevance"],
        hallucination=scores["hallucination"], judge_model="fake", ragas_method="scenario",
        deepeval_method="scenario",
    )
    reasons = _flag_reasons(report)
    if d.drifted:
        reasons.append("faithfulness_drift")

    final = await run_diagnostic_graph(
        "swarm-prompt", use_llm=False, eval_results=scores,
        trace_context={"retrieval_score": 0.9, "generator_model": "groq/llama-3.1-8b",
                       "prompt_name": "rag_default", "index_name": "default"},
    )
    async with AsyncSessionLocal() as s:
        versions_after = {v.version: v.is_active for v in (await s.execute(
            select(PromptVersion).where(PromptVersion.prompt_name == "rag_default"))).scalars().all()}
    # same test: rollback is idempotent
    r1 = await rollback("rag_default")
    r2 = await rollback("rag_default")
    return {"scenario": "B", "test": "test_prompt_regression_triggers_rollback",
            "eval_scores": scores,
            "drift": _jsonable(d.__dict__),
            "flag": {"flagged": bool(reasons), "reasons": reasons},
            "faithfulness_history": history,
            "prompt_versions_before": versions_before,
            "prompt_versions_after": {str(k): v for k, v in sorted(versions_after.items())},
            "rollback_repeat": [_jsonable(r1), _jsonable(r2)],
            "nodes_ran": nodes_that_ran(final), "final": _jsonable(final)}


async def step_c() -> dict:
    import uuid
    from datetime import datetime, timezone

    from app.agents.graph import nodes_that_ran, run_diagnostic_graph
    from app.db.postgres.models import Incident
    from app.db.postgres.session import AsyncSessionLocal

    now = datetime.now(timezone.utc)
    # test_mixed_signal_lands_in_human_review: identical setup (on top of B's history)
    async with AsyncSessionLocal() as s:
        for _ in range(10):
            s.add(_ev("q-ollama", 0.2, "llama3.2:3b", now))
        await s.commit()
    final = await run_diagnostic_graph(
        "swarm-mixed", use_llm=False,
        eval_results={"faithfulness": 0.18, "answer_relevance": 0.2, "hallucination": 0.8,
                      "retrieval_precision": 0.18, "context_recall": 0.2},
        trace_context={"retrieval_score": 0.15, "generator_model": "llama3.2:3b",
                       "prompt_name": "rag_default", "index_name": "default"},
    )
    async with AsyncSessionLocal() as s:
        inc = await s.get(Incident, uuid.UUID(final["incident_id"]))
    return {"scenario": "C", "test": "test_mixed_signal_lands_in_human_review",
            "incident_row": {"status": inc.status.value,
                             "root_cause": inc.root_cause.value if inc.root_cause else None},
            "nodes_ran": nodes_that_ran(final), "final": _jsonable(final)}


def _hook_trace() -> dict:
    """First seed whose synthetic trace is a hallucination fault on the refund question."""
    import importlib.util
    import random

    from app.eval.synthetic_qa import CANONICAL_QA
    from app.ingestion.otel_build import build_otlp_json

    spec = importlib.util.spec_from_file_location("seed_synthetic_traces",
                                                  BACKEND / "scripts" / "seed_synthetic_traces.py")
    seed_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed_mod)
    refund_q = CANONICAL_QA[0]["question"]
    for k in range(100_000):
        random.seed(k)
        spans = seed_mod._make_trace()
        root, retrieval, gen = spans
        if root["attributes"]["ledger.fault"] == "hallucination" and root["attributes"]["rag.question"] == refund_q:
            return {
                "seed": k,
                "script": "backend/scripts/seed_synthetic_traces.py:_make_trace",
                "fault": root["attributes"]["ledger.fault"],
                "question": root["attributes"]["rag.question"],
                "span_name": gen["name"],
                "model": gen["attributes"]["gen_ai.request.model"],
                "completion": gen["attributes"]["gen_ai.completion"],
                "generation_latency_ms": (gen["end_ns"] - gen["start_ns"]) // 1_000_000,
                "retrieval_latency_ms": (retrieval["end_ns"] - retrieval["start_ns"]) // 1_000_000,
                "retrieval_score": retrieval["attributes"]["retrieval.score"],
                "retrieved_documents": json.loads(retrieval["attributes"]["retrieval.documents"]),
                "status": gen["status"],
                "otlp": build_otlp_json(spans),
            }
    raise LookupError("no hallucination/refund seed found")


async def step_fixtures(ids: dict, probe: bool) -> dict:
    from httpx import ASGITransport, AsyncClient

    from app.main import app
    from app.router.tiers import default_tiers

    admin = {"X-API-Key": ADMIN_KEY}
    api: dict = {}
    hook = _hook_trace()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        async def get(name: str, path: str, **kw):
            r = await c.get(path, headers=admin, **kw)
            r.raise_for_status()
            api[name] = {"path": path, "params": kw.get("params"), "status": r.status_code, "body": r.json()}

        probe_result = {"ran": False, "reason": "disabled (--no-probe)"}
        available = [t.name for t in default_tiers() if t.provider.available and not t.is_floor]
        if probe and available:
            r = await c.post("/api/v1/router/health-check", headers=admin)
            probe_result = {"ran": True, "status": r.status_code, "body": r.json()}
        elif probe:
            probe_result = {"ran": False, "reason": "no provider keys configured; health left null"}

        await get("health", "/api/v1/health")
        await get("health_tiers", "/api/v1/health/tiers")
        await get("router_config", "/api/v1/router/config")
        await get("incidents", "/api/v1/incidents")
        await get("incidents_recent", "/api/v1/incidents", params={"limit": 5})
        for k in "ABC":
            await get(f"incident_{k}", f"/api/v1/incidents/{ids[k]}")

        # ingest contract, through the real endpoint (the task is only enqueued; no worker runs)
        body = json.dumps(hook["otlp"]).encode()
        ingest = {}
        r = await c.post("/api/v1/traces", content=body,
                         headers={"X-API-Key": INGEST_KEY, "Content-Type": "application/json"})
        ingest["accepted"] = {"status": r.status_code, "body": r.json()}
        r = await c.post("/api/v1/traces", content=body, headers={"Content-Type": "application/json"})
        ingest["missing_key"] = {"status": r.status_code, "body": r.json()}
        r = await c.get("/api/v1/incidents", headers={"X-API-Key": INGEST_KEY})
        ingest["wrong_scope"] = {"status": r.status_code, "body": r.json(), "path": "GET /api/v1/incidents"}
        r = await c.post("/api/v1/traces", content=body,
                         headers={"X-API-Key": INGEST_KEY, "Content-Type": "text/plain"})
        ingest["bad_content_type"] = {"status": r.status_code, "body": r.json()}
        # a JSON syntax error is a ValueError inside decode_otlp, so it lands on the 415 branch;
        # the 400 branch catches every other decode failure (never a 500)
        r = await c.post("/api/v1/traces", content=b"{not json",
                         headers={"X-API-Key": INGEST_KEY, "Content-Type": "application/json"})
        ingest["json_syntax_error"] = {"status": r.status_code, "body": r.json()}
        r = await c.post("/api/v1/traces", content=b"[]",
                         headers={"X-API-Key": INGEST_KEY, "Content-Type": "application/json"})
        ingest["malformed_structure"] = {"status": r.status_code, "body": r.json()}
        r = await c.post("/api/v1/traces", content=b"\xff\xfe\x00garbage",
                         headers={"X-API-Key": INGEST_KEY, "Content-Type": "application/x-protobuf"})
        ingest["malformed_protobuf"] = {"status": r.status_code, "body": r.json()}
    return {"api": api, "hook_trace": hook, "ingest": ingest, "probe": probe_result}


def child(args: argparse.Namespace) -> None:
    sys.path.insert(0, str(BACKEND))
    _guard()
    if args.step == "A":
        res = asyncio.run(step_a())
    elif args.step == "B":
        res = asyncio.run(step_b())
    elif args.step == "C":
        res = asyncio.run(step_c())
    else:
        res = asyncio.run(step_fixtures(json.loads(args.ids), probe=not args.no_probe))
    Path(args.out).write_text(json.dumps(res, default=str), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", choices=["A", "B", "C", "fixtures"])
    ap.add_argument("--out")
    ap.add_argument("--ids")
    ap.add_argument("--no-probe", action="store_true")
    ap.add_argument("--keep", action="store_true", help="leave the containers running")
    a = ap.parse_args()
    if a.step:
        child(a)
    else:
        orchestrate(a)
