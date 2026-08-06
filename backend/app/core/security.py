"""API-key auth with scopes.

Two keys (from config): an admin key (full access) and an ingestion key
(POST /traces only). Header: `X-API-Key`. Missing key -> 401; valid key but
insufficient scope -> 403.
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from app.core.config import settings

# scope names
SCOPE_ADMIN = "admin"
SCOPE_INGESTION = "ingestion"


def _scopes_for_key(api_key: str | None) -> set[str]:
    if not api_key:
        return set()
    if api_key == settings.admin_api_key:
        return {SCOPE_ADMIN, SCOPE_INGESTION}  # admin implies ingestion
    if api_key == settings.ingestion_api_key:
        return {SCOPE_INGESTION}
    return set()


async def get_scopes(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> set[str]:
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing API key (set X-API-Key header)",
        )
    scopes = _scopes_for_key(x_api_key)
    if not scopes:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid API key")
    return scopes


def require_scope(scope: str):
    """Dependency factory: require `scope` (admin always satisfies)."""

    async def _dep(scopes: set[str] = Depends(get_scopes)) -> set[str]:
        if scope not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"requires '{scope}' scope",
            )
        return scopes

    return _dep


# ready-made dependencies
require_admin = require_scope(SCOPE_ADMIN)
require_ingestion = require_scope(SCOPE_INGESTION)
