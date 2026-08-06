"""Ping every infra service. Run after `docker compose up -d`.

    .venv/Scripts/python.exe scripts/check_connectivity.py
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

results: list[tuple[str, bool, str]] = []


def check(name: str):
    def deco(fn):
        try:
            msg = fn()
            results.append((name, True, msg or "ok"))
        except Exception as e:  # noqa: BLE001
            results.append((name, False, f"{type(e).__name__}: {e}"))
    return deco


@check("postgres")
def _pg():
    import psycopg

    dsn = os.environ["ALEMBIC_DATABASE_URL"].replace("+psycopg", "")
    with psycopg.connect(dsn, connect_timeout=5) as c:
        return c.execute("select version()").fetchone()[0].split(",")[0]


@check("postgres:langfuse-db")
def _pglf():
    import psycopg

    dsn = os.environ["ALEMBIC_DATABASE_URL"].replace("+psycopg", "").rsplit("/", 1)[0] + "/langfuse"
    with psycopg.connect(dsn, connect_timeout=5) as c:
        return "langfuse db reachable: " + str(c.execute("select 1").fetchone()[0])


@check("redis")
def _redis():
    import redis

    r = redis.from_url(os.environ["REDIS_URL"], socket_connect_timeout=5)
    return "PONG" if r.ping() else "no pong"


@check("clickhouse")
def _ch():
    import clickhouse_connect

    client = clickhouse_connect.get_client(
        host=os.getenv("CLICKHOUSE_HOST", "localhost"),
        port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
        username=os.getenv("CLICKHOUSE_USER", "ledger"),
        password=os.getenv("CLICKHOUSE_PASSWORD", "clickhouse"),
        connect_timeout=5,
    )
    return client.query("select version()").result_rows[0][0]


@check("langfuse-ui")
def _lf():
    import httpx

    url = os.getenv("LANGFUSE_HOST", "http://localhost:3000") + "/api/public/health"
    r = httpx.get(url, timeout=5)
    r.raise_for_status()
    return f"HTTP {r.status_code}"


@check("ollama")
def _ol():
    import httpx

    url = os.getenv("OLLAMA_HOST", "http://localhost:11434") + "/api/tags"
    r = httpx.get(url, timeout=5)
    r.raise_for_status()
    names = [m["name"] for m in r.json().get("models", [])]
    return "models: " + (", ".join(names) or "none")


ok = True
for name, passed, msg in results:
    flag = "PASS" if passed else "FAIL"
    if not passed:
        ok = False
    print(f"[{flag}] {name:24} {msg}")

sys.exit(0 if ok else 1)
