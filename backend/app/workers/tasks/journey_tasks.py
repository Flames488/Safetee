import logging
from datetime import UTC, datetime, timedelta

from app.db.sync_session import SyncSessionLocal
from app.models.enums import JourneyStatus, SOSStatus, SOSTrigger
from app.models.journey import Journey
from app.models.sos_event import SOSEvent
from app.workers.celery_app import celery_app
from app.workers.tasks.sos_tasks import fanout_sos_alerts

logger = logging.getLogger("safetee.journey")


@celery_app.task
def sweep_overdue_journeys():
    """Runs every 30s. A journey is overdue once now > expected_arrival_at +
    grace_minutes with no check-in inside that window. Overdue journeys are
    escalated straight to an active SOS event — skipping the cancel-window
    that a manually-triggered SOS gets, since the person has already had
    `grace_minutes` to respond and didn't.
    """
    db = SyncSessionLocal()
    try:
        now = datetime.now(UTC)
        overdue = (
            db.query(Journey)
            .filter(Journey.status == JourneyStatus.active)
            .all()
        )
        for journey in overdue:
            deadline = journey.expected_arrival_at + timedelta(minutes=journey.grace_minutes)
            last_signal = journey.last_checkin_at or journey.created_at
            if now < deadline or last_signal > deadline:
                continue

            logger.warning("Journey %s missed check-in — escalating to SOS", journey.id)
            journey.status = JourneyStatus.escalated

            event = SOSEvent(
                user_id=journey.user_id,
                journey_id=journey.id,
                trigger=SOSTrigger.journey_timeout,
                status=SOSStatus.active,  # no cancel window — already overdue
                cancel_window_ends_at=now,
            )
            db.add(event)
            db.commit()
            db.refresh(event)

            fanout_sos_alerts.delay(str(event.id))
    finally:
        db.close()
