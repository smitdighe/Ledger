"""Task status inspection via Celery's result backend (AsyncResult).

Reusable by future endpoints — no custom status table (Celery's backend covers it).
"""
from __future__ import annotations

from typing import Any

from celery.result import AsyncResult

from app.core.celery_app import celery_app


def get_task_status(task_id: str) -> dict[str, Any]:
    r = AsyncResult(task_id, app=celery_app)
    ready = r.ready()
    return {
        "task_id": task_id,
        "state": r.state,               # PENDING / STARTED / RETRY / SUCCESS / FAILURE
        "ready": ready,
        "successful": r.successful() if ready else None,
        "result": r.result if (ready and r.successful()) else None,
        "error": str(r.result) if (ready and r.failed()) else None,
    }
