"""Router config + health endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.db.postgres.models import RouterConfig
from app.db.postgres.session import get_session
from app.router.health_check import get_health, run_health_checks
from app.router.tiers import ensure_seeded, get_tiers

router = APIRouter(tags=["router"])


class TierPatch(BaseModel):
    is_enabled: bool | None = Field(default=None, description="enable/disable the tier")
    priority_order: int | None = Field(default=None, ge=1, description="lower = higher priority")


@router.get("/router/config", summary="Router tier config + live health",
            description="Current tier priority/enabled state plus live cached health/latency "
                        "(Phase 3). Admin only.")
async def router_config(
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    tiers = await get_tiers(session)
    rows = {
        r.tier_name: r
        for r in (await session.execute(select(RouterConfig))).scalars().all()
    }
    out = []
    for spec in tiers:
        row = rows.get(spec.name)
        out.append({
            "tier": spec.name, "role": spec.role, "priority": spec.priority,
            "enabled": spec.enabled, "available": spec.provider.available,
            "cached_health": await get_health(spec.name),
            "last_health_check": row.last_health_check.isoformat() if row and row.last_health_check else None,
            "last_latency_ms": row.last_latency_ms if row else None,
            "rpm": spec.rpm, "rpd": spec.rpd, "default_model": spec.provider.default_model,
        })
    return {"tiers": out}


@router.patch("/router/config/{tier_name}", summary="Override a tier's state",
              description="Manually enable/disable a tier or change its priority "
                          "(independent of the automated reroute tool). Admin only.")
async def patch_tier(
    tier_name: str,
    body: TierPatch,
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.is_enabled is None and body.priority_order is None:
        raise HTTPException(status_code=422, detail="provide is_enabled and/or priority_order")

    await ensure_seeded(session)
    row = (await session.execute(
        select(RouterConfig).where(RouterConfig.tier_name == tier_name)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"tier '{tier_name}' not found")

    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    if body.priority_order is not None:
        row.priority_order = body.priority_order
    await session.commit()
    await session.refresh(row)

    return {
        "tier": row.tier_name,
        "is_enabled": row.is_enabled,
        "priority_order": row.priority_order,
    }


@router.post("/router/health-check", summary="Run on-demand health probes",
             description="Probe every provider now and persist latency/health. Admin only.")
async def router_health_check(
    _: set = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    results = await run_health_checks(session)
    return {"results": results}
