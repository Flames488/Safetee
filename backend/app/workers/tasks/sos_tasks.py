import logging

from app.core.config import settings
from app.db.sync_session import SyncSessionLocal
from app.models.contact import TrustedContact
from app.models.enums import AlertStatus, SOSStatus
from app.models.sos_event import SOSAlertDelivery, SOSEvent
from app.models.user import User
from app.services.sms.fallback import SMSDeliveryFailed, send_with_fallback
from app.workers.celery_app import celery_app

logger = logging.getLogger("safetee.sos")


def _alert_body(user: User, event: SOSEvent) -> str:
    maps_link = ""
    if event.origin_lat is not None and event.origin_lng is not None:
        maps_link = f" Live location: https://maps.google.com/?q={event.origin_lat},{event.origin_lng}"
    return f"SAFETEE ALERT: {user.full_name} has triggered an emergency alert and may need help.{maps_link}"


@celery_app.task(bind=True, max_retries=settings.sos_fanout_max_retries, default_retry_delay=10)
def fanout_sos_alerts(self, sos_event_id: str):
    """Notifies every trusted contact for a triggered SOS event, in priority
    order. Each (contact, channel) attempt is persisted as its own row so
    the SOS-active screen can show real per-contact delivery status, and so
    a partial failure only retries the deliveries that actually failed.
    """
    db = SyncSessionLocal()
    try:
        event = db.get(SOSEvent, sos_event_id)
        if event is None or event.status not in (SOSStatus.pending, SOSStatus.active):
            return

        event.status = SOSStatus.active
        db.commit()

        user = db.get(User, event.user_id)
        contacts = (
            db.query(TrustedContact)
            .filter(TrustedContact.user_id == event.user_id)
            .order_by(TrustedContact.priority.asc())
            .all()
        )

        if not contacts:
            logger.error("SOS %s fired with zero trusted contacts on file", sos_event_id)
            return

        body = _alert_body(user, event)
        any_failed = False

        for contact in contacts:
            delivery = (
                db.query(SOSAlertDelivery)
                .filter_by(sos_event_id=event.id, contact_id=contact.id)
                .first()
            )
            if delivery is None:
                delivery = SOSAlertDelivery(
                    sos_event_id=event.id, contact_id=contact.id, channel="sms_twilio", attempt_count=0
                )
                db.add(delivery)

            delivery.attempt_count += 1
            try:
                channel, provider_ref = send_with_fallback(contact.phone, body)
                delivery.channel = channel
                delivery.provider_ref = provider_ref
                delivery.status = AlertStatus.sent
                delivery.last_error = None
            except SMSDeliveryFailed as exc:
                delivery.status = AlertStatus.failed
                delivery.last_error = str(exc)[:500]
                any_failed = True
                logger.error("SOS %s: alert to %s failed: %s", sos_event_id, contact.phone, exc)

            db.commit()

        if any_failed:
            # let the periodic retry_failed_alerts sweep pick this up rather than
            # retrying the whole fanout (which would re-send to contacts that
            # already got the message)
            logger.warning("SOS %s had partial delivery failures", sos_event_id)

    finally:
        db.close()


@celery_app.task
def retry_failed_alerts():
    """Runs every 2 minutes. Re-attempts only the individual deliveries that
    failed, up to SOS_FANOUT_MAX_RETRIES, instead of re-firing whole events."""
    db = SyncSessionLocal()
    try:
        failed = (
            db.query(SOSAlertDelivery)
            .filter(
                SOSAlertDelivery.status == AlertStatus.failed,
                SOSAlertDelivery.attempt_count < settings.sos_fanout_max_retries,
            )
            .limit(200)
            .all()
        )
        for delivery in failed:
            event = db.get(SOSEvent, delivery.sos_event_id)
            if event is None or event.status == SOSStatus.cancelled:
                continue
            contact = db.get(TrustedContact, delivery.contact_id)
            user = db.get(User, event.user_id)
            delivery.attempt_count += 1
            try:
                channel, provider_ref = send_with_fallback(contact.phone, _alert_body(user, event))
                delivery.channel = channel
                delivery.provider_ref = provider_ref
                delivery.status = AlertStatus.sent
                delivery.last_error = None
            except SMSDeliveryFailed as exc:
                delivery.status = AlertStatus.failed
                delivery.last_error = str(exc)[:500]
            db.commit()
    finally:
        db.close()
