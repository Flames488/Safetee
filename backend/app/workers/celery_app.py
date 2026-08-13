from celery import Celery

from app.core.config import settings

# Kept only so `@celery_app.task` still gives every task callable a plain
# `.apply(...)` — run synchronously in-process by app/core/scheduler.py.
# There is deliberately no broker consumer anywhere (Render's free tier has
# no free Background Worker instance type — see scheduler.py's module
# docstring), so nothing here is ever dispatched via `.delay()`/
# `.apply_async()`, and there is no beat_schedule: if a stray Celery worker
# or beat process is ever pointed at this app (e.g. a local docker-compose
# profile), it must find an empty schedule and an unused queue rather than
# double-executing sweeps that the in-process scheduler already runs.
celery_app = Celery(
    "safetee",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks.sos_tasks",
        "app.workers.tasks.journey_tasks",
        "app.workers.tasks.billing_tasks",
        "app.workers.tasks.auth_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,             # redeliver if a worker dies mid-fanout
    worker_prefetch_multiplier=1,    # don't hoard SOS tasks behind slow ones
    task_default_retry_delay=5,
    result_expires=3600,
    timezone="UTC",
)
