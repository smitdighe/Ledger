"""Finalized Celery application for Ledger.

Redis broker/backend, JSON serialization, per-stage queues
(ingestion / eval / diagnostic), a project-wide exponential-backoff retry
policy (overridable per task), and the Beat schedule for periodic jobs.
"""
from __future__ import annotations

from celery import Celery, Task
from celery.schedules import schedule

from app.core.config import settings

_broker = settings.celery_broker_url or settings.redis_url
_backend = settings.celery_result_backend or settings.redis_url

QUEUES = ("default", "ingestion", "eval", "diagnostic")


class TransientError(Exception):
    """Retryable failure (e.g. transient ClickHouse/network error)."""


class BaseTask(Task):
    """Project-wide default retry policy. Individual tasks may override."""
    autoretry_for = (TransientError,)
    max_retries = 3
    retry_backoff = True          # exponential backoff
    retry_backoff_max = 60        # cap backoff at 60s
    retry_jitter = True
    acks_late = True


celery_app = Celery("ledger", broker=_broker, backend=_backend)
celery_app.Task = BaseTask  # all @celery_app.task inherit the retry policy

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_default_queue="default",
    task_routes={
        "app.tasks.ingestion_tasks.*": {"queue": "ingestion"},
        "app.tasks.eval_tasks.*": {"queue": "eval"},
        "app.tasks.diagnostic_tasks.*": {"queue": "diagnostic"},
        "app.tasks.scheduled.*": {"queue": "default"},
    },
    worker_prefetch_multiplier=1,
    task_track_started=True,
    result_expires=3600,
    # fail fast when the broker is down instead of hanging the caller (API):
    # short connect/socket timeouts and no publish-retry loop.
    broker_connection_timeout=3,
    broker_transport_options={"socket_timeout": 3, "socket_connect_timeout": 3},
    task_publish_retry=False,
    imports=(
        "app.tasks.ingestion_tasks",
        "app.tasks.eval_tasks",
        "app.tasks.diagnostic_tasks",
        "app.tasks.scheduled",
    ),
)

# --- Beat schedule (periodic jobs) -----------------------------------------
# Intervals are conservative defaults — tune per the Phase 6 report.
DRIFT_CHECK_INTERVAL = 300      # 5 min
HEALTH_PING_INTERVAL = 60       # 1 min
GOLDEN_REFRESH_INTERVAL = 86400  # 24 h

celery_app.conf.beat_schedule = {
    "periodic-drift-check": {
        "task": "app.tasks.scheduled.periodic_drift_check",
        "schedule": schedule(DRIFT_CHECK_INTERVAL),
    },
    "golden-set-refresh-check": {
        "task": "app.tasks.scheduled.golden_set_refresh_check",
        "schedule": schedule(GOLDEN_REFRESH_INTERVAL),
    },
    "router-health-ping": {
        "task": "app.tasks.scheduled.router_health_ping",
        "schedule": schedule(HEALTH_PING_INTERVAL),
    },
}
