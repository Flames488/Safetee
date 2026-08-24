import logging
from datetime import UTC, datetime

from app.db.sync_session import SyncSessionLocal
from app.models.enums import SubscriptionStatus
from app.models.subscription import Subscription
from app.workers.celery_app import celery_app

logger = logging.getLogger("safetee.billing")


@celery_app.task
def sweep_expired_subscriptions():
    """Runs periodically (see celery_app.beat_schedule). Two things expire
    access here:
      - a trial that ran past trial_ends_at with no successful payment
      - an active subscription past current_period_end (covers both a
        cancelled subscription reaching its paid-through date, and a
        renewal payment that never came in)
    Neither case deletes anything — it only flips `status`, so payment
    history and the row itself are untouched.
    """
    db = SyncSessionLocal()
    try:
        now = datetime.now(UTC)

        # Same safety ceiling as the other periodic sweeps (sos_tasks,
        # journey_tasks): each match here flips out of the filtered status,
        # so it won't be re-selected next run — a limit just caps how much
        # a single run has to load and commit if this task went a while
        # without running (e.g. a sleeping Render dyno) and built up a
        # backlog. Leftovers are picked up on the next hourly run.
        expired_trials = (
            db.query(Subscription)
            .filter(Subscription.status == SubscriptionStatus.trialing)
            .filter(Subscription.trial_ends_at < now)
            .limit(500)
            .all()
        )
        for sub in expired_trials:
            logger.info("Trial expired for user %s", sub.user_id)
            sub.status = SubscriptionStatus.expired

        lapsed = (
            db.query(Subscription)
            .filter(Subscription.status.in_([SubscriptionStatus.active, SubscriptionStatus.past_due]))
            .filter(Subscription.current_period_end < now)
            .limit(500)
            .all()
        )
        for sub in lapsed:
            logger.info("Subscription period ended for user %s", sub.user_id)
            sub.status = SubscriptionStatus.expired

        db.commit()
    finally:
        db.close()
