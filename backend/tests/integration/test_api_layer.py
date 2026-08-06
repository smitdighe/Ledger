"""Phase 7 — API layer: auth scopes, validation, error codes, health, smoke.

Eval uses a deterministic judge double so seeding is fast/stable.
"""
from __future__ import annotations

import json
import os
import time
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import app.eval.runner as eval_runner
from app.db.postgres.session import AsyncSessionLocal
from app.eval.judge_router import JudgeRouter
from app.ingestion.otel_build import build_otlp_json
from app.main import app
from app.router.providers.base import ProviderResponse

ADMIN = {"X-API-Key": "ledger-admin-key-dev"}
INGEST = {"X-API-Key": "ledger-ingest-key-dev"}
BAD = {"X-API-Key": "not-a-real-key"}
MS = 1_000_000
MARKERS = ["pigeon", "lunar", "antarctica", "fax", "maiden", "cafeteria"]


class FakeJudge(JudgeRouter):
    async def complete(self, prompt, force_tier=None, session=None, max_tokens=256,
                       temperature=0.0, **kwargs) -> ProviderResponse:
        self.call_log.append("fake")
        return ProviderResponse("fake", "fake", "not-json", 1.0, 1)

    async def score(self, instruction, force_tier=None, session=None) -> float:
        self.call_log.append("fake")
        il = instruction.lower()
        bad = any(m in il for m in MARKERS)
        if "hallucinat" in il or "not supported" in il or "contradict" in il:
            return 0.9 if bad else 0.1
        return 0.2 if bad else 0.9


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _hex(n: int) -> str:
    return os.urandom(n).hex()


def _payload(answer: str, contexts: list[str]):
    tid, root, retr, gen = uuid.uuid4().hex, _hex(8), _hex(8), _hex(8)
    now = time.time_ns()
    spans = [
        {"trace_id": tid, "span_id": root, "parent_span_id": "", "name": "rag.request",
         "start_ns": now, "end_ns": now + 10 * MS, "status": 0,
         "attributes": {"rag.question": "What is the refund policy?"}},
        {"trace_id": tid, "span_id": retr, "parent_span_id": root, "name": "rag.retrieval",
         "start_ns": now + MS, "end_ns": now + 3 * MS, "status": 0,
         "attributes": {"retrieval.score": 0.9, "retrieval.documents": json.dumps(contexts)}},
        {"trace_id": tid, "span_id": gen, "parent_span_id": root, "name": "rag.generation",
         "start_ns": now + 4 * MS, "end_ns": now + 9 * MS, "status": 2,
         "attributes": {"gen_ai.request.model": "llama3.2:3b", "gen_ai.completion": answer}},
    ]
    return tid, build_otlp_json(spans)


@pytest_asyncio.fixture(scope="session")
async def seeded():
    """Seed one trace + eval + incident using the fast deterministic judge."""
    orig = eval_runner.judge_router
    eval_runner.judge_router = FakeJudge()
    ctx = ["Our refund policy allows a full refund within 30 days of purchase."]
    tid, payload = _payload("Refunds arrive by carrier pigeon in three lunar cycles.", ctx)
    async with _client() as c:
        r = await c.post("/api/v1/traces", params={"to_langfuse": "false", "run_eval": "false"},
                         json=payload, headers=INGEST)
        assert r.status_code == 200, r.text
        ev = await c.post("/api/v1/evals/run", json={"trace_id": tid, "force": True}, headers=ADMIN)
        assert ev.status_code == 200, ev.text
        inc = await c.post("/api/v1/incidents/trigger",
                           json={"trace_id": tid, "use_llm": False}, headers=ADMIN)
        assert inc.status_code == 200, inc.text
        incident_id = inc.json()["incident_id"]
    yield {"trace_id": tid, "incident_id": incident_id}
    eval_runner.judge_router = orig


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_auth_scopes(seeded):
    _, payload = _payload("Refunds within 30 days.", ["30 day refund policy."])
    async with _client() as c:
        # POST /traces: ingestion key ok
        r = await c.post("/api/v1/traces", params={"run_eval": "false", "to_langfuse": "false"},
                         json=payload, headers=INGEST)
        assert r.status_code == 200
        # no key -> 401, bad key -> 401
        assert (await c.post("/api/v1/traces", json=payload)).status_code == 401
        assert (await c.post("/api/v1/traces", json=payload, headers=BAD)).status_code == 401
        # admin implies ingestion
        assert (await c.post("/api/v1/traces", params={"run_eval": "false", "to_langfuse": "false"},
                             json=payload, headers=ADMIN)).status_code == 200
        # ingestion key forbidden on admin endpoints
        assert (await c.get("/api/v1/traces", headers=INGEST)).status_code == 403
        assert (await c.post("/api/v1/incidents/trigger",
                             json={"trace_id": seeded["trace_id"], "use_llm": False},
                             headers=INGEST)).status_code == 403
        # admin allowed
        assert (await c.get("/api/v1/traces", headers=ADMIN)).status_code == 200


# --------------------------------------------------------------------------
# Traces
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_traces_endpoints(seeded):
    async with _client() as c:
        lst = await c.get("/api/v1/traces", params={"limit": 10}, headers=ADMIN)
        assert lst.status_code == 200
        assert "traces" in lst.json()

        got = await c.get(f"/api/v1/traces/{seeded['trace_id']}", headers=ADMIN)
        assert got.status_code == 200
        assert got.json()["span_count"] == 3

        missing = await c.get("/api/v1/traces/deadbeef", headers=ADMIN)
        assert missing.status_code == 404
        body = missing.json()
        assert set(body) >= {"error", "detail", "request_id"}


# --------------------------------------------------------------------------
# Evals
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_evals_endpoints(seeded):
    async with _client() as c:
        lst = await c.get("/api/v1/evals", params={"trace_id": seeded["trace_id"]}, headers=ADMIN)
        assert lst.status_code == 200 and lst.json()["count"] >= 1

        gs = await c.get("/api/v1/evals/golden-set", headers=ADMIN)
        assert gs.status_code == 200 and "active_version" in gs.json()

        # duplicate eval without force -> 409
        dup = await c.post("/api/v1/evals/run", json={"trace_id": seeded["trace_id"]}, headers=ADMIN)
        assert dup.status_code == 409

        # unknown trace -> 404
        nf = await c.post("/api/v1/evals/run", json={"trace_id": "does-not-exist"}, headers=ADMIN)
        assert nf.status_code == 404

        # no ids -> 422
        bad = await c.post("/api/v1/evals/run", json={}, headers=ADMIN)
        assert bad.status_code == 422


# --------------------------------------------------------------------------
# Incidents PATCH
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_incident_patch_resolves(seeded):
    async with _client() as c:
        det = await c.get(f"/api/v1/incidents/{seeded['incident_id']}", headers=ADMIN)
        assert det.status_code == 200
        assert det.json()["diagnostic_trail"]["trail"]  # full trail present

        # missing note -> 422
        bad = await c.patch(f"/api/v1/incidents/{seeded['incident_id']}",
                            json={"status": "resolved"}, headers=ADMIN)
        assert bad.status_code == 422

        ok = await c.patch(f"/api/v1/incidents/{seeded['incident_id']}",
                           json={"resolution_note": "confirmed benign, closing"}, headers=ADMIN)
        assert ok.status_code == 200 and ok.json()["status"] == "resolved"

        det2 = await c.get(f"/api/v1/incidents/{seeded['incident_id']}", headers=ADMIN)
        assert det2.json()["status"] == "resolved"
        assert det2.json()["diagnostic_trail"]["resolution"]["note"] == "confirmed benign, closing"

        # unknown id -> 404 (valid note so body validation passes first)
        nf = await c.patch(f"/api/v1/incidents/{uuid.uuid4()}",
                           json={"resolution_note": "closing unknown"}, headers=ADMIN)
        assert nf.status_code == 404


# --------------------------------------------------------------------------
# Router PATCH respected by the router layer
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_router_patch_respected():
    from app.router.tiers import get_tiers
    async with _client() as c:
        r = await c.patch("/api/v1/router/config/gemini",
                          json={"is_enabled": False, "priority_order": 9}, headers=ADMIN)
        assert r.status_code == 200 and r.json()["is_enabled"] is False

        cfg = await c.get("/api/v1/router/config", headers=ADMIN)
        gem = next(t for t in cfg.json()["tiers"] if t["tier"] == "gemini")
        assert gem["enabled"] is False and gem["priority"] == 9

        # router layer (get_tiers) reflects the override
        async with AsyncSessionLocal() as s:
            tiers = {t.name: t for t in await get_tiers(s)}
        assert tiers["gemini"].enabled is False

        # unknown tier -> 404 ; empty patch -> 422
        assert (await c.patch("/api/v1/router/config/nope", json={"is_enabled": False},
                              headers=ADMIN)).status_code == 404
        assert (await c.patch("/api/v1/router/config/gemini", json={}, headers=ADMIN)).status_code == 422

        # restore
        await c.patch("/api/v1/router/config/gemini",
                      json={"is_enabled": True, "priority_order": 3}, headers=ADMIN)


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_health_endpoints():
    async with _client() as c:
        assert (await c.get("/health")).status_code == 200          # root, no auth
        assert (await c.get("/api/v1/health")).status_code == 200   # v1 liveness, no auth
        # protected health needs admin
        assert (await c.get("/api/v1/health/db")).status_code == 401
        assert (await c.get("/api/v1/health/db", headers=ADMIN)).json()["checks"]["postgres"] == "ok"
        assert (await c.get("/api/v1/health/tiers", headers=ADMIN)).status_code == 200
        q = await c.get("/api/v1/health/queues", headers=ADMIN)
        assert q.status_code == 200 and "ready_by_queue" in q.json() and "in_flight" in q.json()


# --------------------------------------------------------------------------
# No-500 smoke over every endpoint
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_no_500_smoke(seeded):
    tid = seeded["trace_id"]
    iid = seeded["incident_id"]
    async with _client() as c:
        calls = [
            c.get("/health"),
            c.get("/api/v1/health", headers=ADMIN),
            c.get("/api/v1/health/db", headers=ADMIN),
            c.get("/api/v1/health/tiers", headers=ADMIN),
            c.get("/api/v1/health/queues", headers=ADMIN),
            c.get("/api/v1/traces", headers=ADMIN),
            c.get(f"/api/v1/traces/{tid}", headers=ADMIN),
            c.get("/api/v1/evals", headers=ADMIN),
            c.get("/api/v1/evals/golden-set", headers=ADMIN),
            c.get("/api/v1/router/config", headers=ADMIN),
            c.post("/api/v1/router/health-check", headers=ADMIN),
            c.get("/api/v1/incidents", headers=ADMIN),
            c.get(f"/api/v1/incidents/{iid}", headers=ADMIN),
        ]
        for coro in calls:
            resp = await coro
            assert resp.status_code < 500, f"{resp.request.url} -> {resp.status_code}: {resp.text[:200]}"
