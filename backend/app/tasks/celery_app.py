"""Backward-compat shim — the Celery app now lives in app.core.celery_app."""
from app.core.celery_app import QUEUES, BaseTask, TransientError, celery_app

__all__ = ["celery_app", "QUEUES", "BaseTask", "TransientError"]
