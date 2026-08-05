from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

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

# Beat schedule: journeys are swept every 30s so a missed check-in escalates
# to SOS within, worst case, 30s + grace period — not a full minute-cron away.
celery_app.conf.beat_schedule = {
    "sweep-overdue-journeys": {
        "task": "app.workers.tasks.journey_tasks.sweep_overdue_journeys",
        "schedule": 30.0,
    },
    "retry-failed-sos-alerts": {
        "task": "app.workers.tasks.sos_tasks.retry_failed_alerts",
        "schedule": crontab(minute="*/2"),
    },
    "sweep-expired-subscriptions": {
        "task": "app.workers.tasks.billing_tasks.sweep_expired_subscriptions",
        "schedule": crontab(minute=0),  # hourly — expiry isn't as time-critical as an SOS
    },
}
