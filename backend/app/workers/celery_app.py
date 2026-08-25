from celery import Celery

from app.core.config import settings

# In local dev (and any single-process deploy with no Background Worker
# process type), every `@celery_app.task`-decorated callable is only ever
# run via `.apply(...)` — synchronously in-process by app/core/scheduler.py
# — so there's no broker consumer or beat process there to pick up a real
# schedule. The schedule below is only consumed when something actually
# points a `beat`/`worker` process at this app (docker-compose.prod.yml, on
# the production VPS); everywhere else, settings.run_periodic_tasks_in_process
# (default true) keeps app/main.py's in-process scheduler as the one and
# only place these sweeps run, so this schedule sitting unused there is
# harmless.
celery_app = Celery(
    "safetee",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks.sos_tasks",
        "app.workers.tasks.journey_tasks",
        "app.workers.tasks.billing_tasks",
        "app.workers.tasks.auth_tasks",
        "app.workers.tasks.admin_tasks",
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
    # Mirrors app/main.py's in-process intervals exactly — see that file's
    # lifespan for the corresponding start_periodic() calls.
    beat_schedule={
        "sweep-overdue-journeys": {
            "task": "app.workers.tasks.journey_tasks.sweep_overdue_journeys",
            "schedule": 30.0,
        },
        "retry-failed-alerts": {
            "task": "app.workers.tasks.sos_tasks.retry_failed_alerts",
            "schedule": 120.0,
        },
        "sweep-expired-subscriptions": {
            "task": "app.workers.tasks.billing_tasks.sweep_expired_subscriptions",
            "schedule": 3600.0,
        },
        "purge-soft-deleted-accounts": {
            "task": "app.workers.tasks.admin_tasks.purge_soft_deleted_accounts",
            "schedule": 86400.0,
        },
    },
)
