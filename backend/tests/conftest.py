"""Test config: run Celery tasks eagerly (inline) so the async pipeline can be
exercised end-to-end without a separate worker. nest_asyncio makes the shared
session event loop reentrant so eager async tasks can run inside it.
"""
import nest_asyncio

nest_asyncio.apply()

from app.core.celery_app import celery_app  # noqa: E402

celery_app.conf.task_always_eager = True
# False so eager mode re-executes autoretries inline (instead of surfacing the
# Retry exception on the first failure); task outcomes are asserted directly.
celery_app.conf.task_eager_propagates = False
