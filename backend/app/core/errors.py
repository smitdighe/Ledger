"""Consistent error responses + request-id correlation.

Every error returns `{error, detail, request_id}` with a proper status code and
no stack trace leaking to the client. Unexpected errors are logged in full
server-side and reported as a generic 500.
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.router.providers.base import ProviderRateLimited
from app.router.selector import RouterExhausted

logger = structlog.get_logger(__name__)


def _request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None)
    if not rid:
        rid = str(uuid.uuid4())
        request.state.request_id = rid
    return rid


def _body(error: str, detail, request_id: str) -> dict:
    return {"error": error, "detail": detail, "request_id": request_id}


def install_error_handlers(app: FastAPI) -> None:
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exc(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content=_body("http_error", exc.detail, _request_id(request)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exc(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body("validation_error", exc.errors(), _request_id(request)),
        )

    @app.exception_handler(ProviderRateLimited)
    async def rate_limited(request: Request, exc: ProviderRateLimited):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content=_body("rate_limited", str(exc), _request_id(request)),
        )

    @app.exception_handler(RouterExhausted)
    async def router_exhausted(request: Request, exc: RouterExhausted):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_body("router_exhausted", str(exc), _request_id(request)),
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        rid = _request_id(request)
        logger.error(
            "api.unhandled_exception",
            request_id=rid, path=request.url.path, method=request.method,
            error=str(exc), exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_body("internal_error", "an unexpected error occurred", rid),
        )
