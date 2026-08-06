"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import install_error_handlers
from app.db.clickhouse.client import clickhouse_client

logger = structlog.get_logger(__name__)

DESCRIPTION = """
Ledger — LLM/agent observability & auto-remediation platform.

**Auth**: all endpoints require an `X-API-Key` header.
- *ingestion* scope: `POST /traces` only
- *admin* scope: full access

Pipeline: ingest (OTLP → ClickHouse) → eval (RAGAS/DeepEval) → drift → diagnostic
swarm (LangGraph) → remediation, wired asynchronously via Celery.
"""

TAGS_METADATA = [
    {"name": "health", "description": "Liveness and component health."},
    {"name": "traces", "description": "OTLP ingestion and trace retrieval."},
    {"name": "evals", "description": "Eval runs, results, and the golden set."},
    {"name": "router", "description": "4-tier LLM router config and health."},
    {"name": "incidents", "description": "Diagnostic swarm triggers and incidents."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await clickhouse_client.connect()
    logger.info("app.startup", env=settings.app_env)
    yield
    await clickhouse_client.close()
    logger.info("app.shutdown")


app = FastAPI(
    title="Ledger API",
    version="0.1.0",
    description=DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    lifespan=lifespan,
)
install_error_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["health"], summary="Root liveness probe",
         description="Unauthenticated liveness check for load balancers.")
async def root_health() -> dict:
    return {"status": "ok", "env": settings.app_env}
