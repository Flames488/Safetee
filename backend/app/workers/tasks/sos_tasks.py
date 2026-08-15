import logging
import uuid

from app.core.config import settings
from app.core.phone import normalize_phone
from app.core.security import create_share_token
from app.db.sync_session import SyncSessionLocal
from app.models.contact import TrustedContact
from app.models.device import Device
from app.models.enums import AlertStatus, SOSStatus
from app.models.journey import Journey
from app.models.sos_event import SOSAlertDelivery, SOSEvent
from app.models.user import User
from app.services.notifications.push import send_push
from app.services.sms.fallback import SMSDeliveryFailed, send_with_fallback
from app.workers.celery_app import celery_app

logger = logging.getLogger("safetee.sos")


def _alert_body(user: User, event: SOSEvent) -> str:
    maps_link = ""
    if event.origin_lat is not None and event.origin_lng is not None:
        maps_link = f" Live location: https://maps.google.com/?q={event.origin_lat},{event.origin_lng}"
    return f"SAFETEE ALERT: {user.full_name} has triggered an emergency alert and may need help.{maps_link}"


def _matching_user_devices(db, phone: str) -> list[Device]:
    """A trusted contact has no Safetee account by default — SMS above is
    the unconditional, reliable path regardless of this. But if this
    contact's phone happens to belong to a registered user (they're a
    contact who also uses the app), also push to their registered devices
    for a faster, richer in-app notification. No match found is the
    common case and returns an empty list, not an error. Exact match on
    the indexed User.phone column — see normalize_phone's docstring for
    why this isn't a fuzzy match (was previously an unindexed full-table
    scan comparing last-10-digits, which was both slow and, more
    importantly, could match the wrong real person's account)."""
    target = normalize_phone(phone)
    if not target:
        return []
    matched_user = db.query(User.id).filter(User.phone == target).first()
    if matched_user is None:
        return []
    return db.query(Device).filter(Device.user_id == matched_user.id).all()


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
        contacts_query = (
            db.query(TrustedContact)
            .filter(TrustedContact.user_id == event.user_id)
            # created_at tiebreak — see contacts.py's list_contacts for why:
            # every contact starts at the same default priority, so without
            # this, fanout order for an untouched contact list wouldn't
            # reliably match what the Contacts page displays as the order.
            .order_by(TrustedContact.priority.asc(), TrustedContact.created_at.asc())
        )

        # A journey escalation only notifies the contacts the user actually
        # picked when starting that journey — previously this filter never
        # applied and every trusted contact got notified regardless of
        # what "who to notify" selection the journey was created with. A
        # manually-triggered SOS (no journey_id, or a journey with an
        # empty/missing selection) still notifies everyone — there's
        # either no selection to honor, or honoring an empty one would
        # mean nobody hears about a genuine emergency, which is worse than
        # over-notifying.
        if event.journey_id is not None:
            journey = db.get(Journey, event.journey_id)
            if journey is not None and journey.notify_contact_ids:
                notify_ids = {uuid.UUID(cid) for cid in journey.notify_contact_ids}
                contacts_query = contacts_query.filter(TrustedContact.id.in_(notify_ids))

        contacts = contacts_query.all()

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
            if delivery is not None and delivery.status == AlertStatus.sent:
                # Already delivered. task_acks_late means a worker crash/
                # restart mid-fanout redelivers this whole task — without
                # this check, every contact already successfully SMS'd
                # would get a second, duplicate alert.
                continue
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

            for device in _matching_user_devices(db, contact.phone):
                send_push(
                    device.push_token,
                    "SAFETEE Alert",
                    f"{user.full_name} triggered an emergency alert",
                    data={"url": "/app/alerts"},
                )

        if any_failed:
            # let the periodic retry_failed_alerts sweep pick this up rather than
            # retrying the whole fanout (which would re-send to contacts that
            # already got the message)
            logger.warning("SOS %s had partial delivery failures", sos_event_id)

    finally:
        db.close()


@celery_app.task
def notify_contacts_of_evidence(sos_event_id: str):
    """Fires exactly once per event (see `evidence_notified_at` in
    confirm_evidence) — trusted contacts get one link to a live evidence
    page, not a fresh SMS for every 15-30s chunk. New chunks just appear
    when they reload that same link; see get_evidence."""
    db = SyncSessionLocal()
    try:
        event = db.get(SOSEvent, sos_event_id)
        if event is None:
            return
        user = db.get(User, event.user_id)
        contacts = db.query(TrustedContact).filter(TrustedContact.user_id == event.user_id).all()

        for contact in contacts:
            token = create_share_token(scope="sos_evidence", resource_id=str(event.id), contact_id=str(contact.id))
            link = f"{settings.frontend_url}/#/track/{event.id}/evidence?token={token}"
            body = f"SAFETEE: Audio/video evidence is now available for {user.full_name}'s emergency alert. {link}"
            try:
                send_with_fallback(contact.phone, body)
            except SMSDeliveryFailed as exc:
                logger.error("Evidence notify for SOS %s: failed to reach %s: %s", sos_event_id, contact.phone, exc)

            # A contact who's also a user gets in-app access via their own
            # login (see get_evidence's phone-match check), so this deep
            # link doesn't need the ?token= a non-account contact requires.
            for device in _matching_user_devices(db, contact.phone):
                send_push(
                    device.push_token,
                    "SAFETEE Evidence",
                    f"Audio/video evidence is available for {user.full_name}'s alert",
                    data={"url": f"/track/{event.id}/evidence"},
                )
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
        if not failed:
            return

        # Batch-fetch instead of 3 separate db.get() round trips per
        # delivery (up to 600 extra queries per run at the 200-row limit).
        event_ids = {d.sos_event_id for d in failed}
        contact_ids = {d.contact_id for d in failed}
        events = {e.id: e for e in db.query(SOSEvent).filter(SOSEvent.id.in_(event_ids)).all()}
        contacts = {c.id: c for c in db.query(TrustedContact).filter(TrustedContact.id.in_(contact_ids)).all()}
        user_ids = {e.user_id for e in events.values()}
        users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

        for delivery in failed:
            event = events.get(delivery.sos_event_id)
            if event is None or event.status == SOSStatus.cancelled:
                continue
            contact = contacts.get(delivery.contact_id)
            user = users.get(event.user_id)
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
