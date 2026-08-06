"""Aggregate v1 API router."""
from fastapi import APIRouter

from app.api.v1.endpoints import evals, health, incidents, router_config, traces

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(traces.router)
api_router.include_router(router_config.router)
api_router.include_router(evals.router)
api_router.include_router(incidents.router)
