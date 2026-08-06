"""Run async task bodies from sync Celery tasks.

Module-level async singletons (redis.asyncio, SQLAlchemy async engine,
clickhouse client) are event-loop-bound. To keep them valid across task
invocations — and to allow eager tasks to run inside an already-running loop
(tests) — we reuse the running loop when present (made reentrant via
nest_asyncio) and otherwise keep one persistent loop per process (worker).
"""
from __future__ import annotations

import asyncio
from typing import Any, Coroutine

import nest_asyncio

nest_asyncio.apply()

_persistent_loop: asyncio.AbstractEventLoop | None = None


def run_async(coro: Coroutine[Any, Any, Any]) -> Any:
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None

    if running is not None:
        # eager task inside a running loop (tests) — reentrant via nest_asyncio
        return running.run_until_complete(coro)

    global _persistent_loop
    if _persistent_loop is None or _persistent_loop.is_closed():
        _persistent_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_persistent_loop)
    return _persistent_loop.run_until_complete(coro)
