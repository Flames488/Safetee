import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import exists, not_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit
from app.core.scheduler import run_soon
from app.core.security import decode_share_token, decode_token, verify_password
from app.db.session import get_db
from app.models.enums import SOSStatus, SOSTrigger
from app.models.sos_acknowledgment import SOSAcknowledgment
from app.models.sos_event import SOSEvent
from app.models.user import User
from app.schemas.sos import (
    EvidenceConfirmRequest,
    EvidenceOut,
    EvidenceUploadRequest,
    EvidenceUploadResponse,
    IncomingAlertOut,
    MediaType,
    SOSEventOut,
    SOSResolveRequest,
    SOSTriggerRequest,
)
from app.services.contact_matching import is_trusted_contact_of, watched_owner_ids
from app.services.storage.supabase_storage import SupabaseStorageError, supabase_storage
from app.workers.tasks.sos_tasks import (
    fanout_sos_alerts,
    notify_contacts_of_evidence,
    notify_contacts_of_resolution,
)

router = APIRouter(prefix="/sos", tags=["sos"])

_EVIDENCE_FIELD = {"audio": "audio_segment_paths", "video": "video_segment_paths", "photo": "photo_paths"}
_EVIDENCE_CAP_SETTING = {
    "audio": "evidence_max_audio_chunks",
    "video": "evidence_max_video_chunks",
    "photo": "evidence_max_photos",
}
_EVIDENCE_PREFERENCE_ATTR = {
    "audio": "evidence_audio_enabled",
    "video": "evidence_video_enabled",
    "photo": "evidence_photo_enabled",
}


def _evidence_cap(media_type: MediaType) -> int:
    return getattr(settings, _EVIDENCE_CAP_SETTING[media_type])


@router.post("/trigger", response_model=SOSEventOut, status_code=status.HTTP_201_CREATED)
async def trigger_sos(
    payload: SOSTriggerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(UTC)
    # Re-check the stored preference rather than trusting the client to
    # simply omit lat/lng — a stale or tampered client could still send
    # coordinates even with the toggle off.
    share_location = user.share_location_enabled

    # The shake gesture (like the duress PIN and a journey-timeout
    # escalation — see auth.py's login and journey_tasks.py) is opt-in and
    # requires three distinct hard shakes within 1.2s (see
    # shakeDetector.js's SHAKE_DELTA_THRESHOLD/SHAKES_NEEDED), well above
    # ordinary handling jostle — so unlike the button, an accidental fire
    # is already unlikely by the time this endpoint is even called. Skipping
    # the cancel window here means someone who deliberately triggered it
    # covertly (can't safely reach for a visible "cancel" screen without
    # tipping off whoever they're hiding it from) gets contacts alerted and
    # evidence capture started immediately, not several seconds later. The
    # button trigger keeps the cancel window — it's a visible, deliberate
    # tap made with the app already open, exactly the case a brief "oops,
    # false alarm" window is meant for.
    skip_cancel_window = payload.trigger == SOSTrigger.gesture

    # Single-shot: consumed here regardless of outcome, so an armed window
    # affects exactly the next trigger and never lingers — see
    # POST /users/me/practice-drill/arm.
    is_practice = user.practice_armed_until is not None and user.practice_armed_until > now
    if user.practice_armed_until is not None:
        user.practice_armed_until = None
        db.add(user)

    event = SOSEvent(
        user_id=user.id,
        journey_id=payload.journey_id,
        trigger=payload.trigger,
        status=SOSStatus.pending,
        is_practice=is_practice,
        origin_lat=payload.lat if share_location else None,
        origin_lng=payload.lng if share_location else None,
        cancel_window_ends_at=now if skip_cancel_window else now + timedelta(seconds=settings.sos_cancel_window_seconds),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    # `refresh()` doesn't populate relationships, and SOSEventOut serializes
    # `alerts` — a lazy-load attempt here happens outside the greenlet/async
    # context FastAPI's response serialization runs in and crashes with
    # MissingGreenlet. A brand-new event never has any alerts yet, so mark
    # the collection as loaded directly rather than assigning to it (plain
    # assignment still triggers a lazy-load of the *old* value first).
    set_committed_value(event, "alerts", [])

    # Fires after the cancel window (zero for a gesture trigger — see
    # above). fanout_sos_alerts re-checks event.status itself, so a cancel
    # recorded in the meantime is enough to no-op it — no task revocation
    # plumbing required. Runs in-process (see app/core/scheduler.py) rather
    # than via Celery's broker — nothing consumes that queue in production.
    run_soon(fanout_sos_alerts, str(event.id), delay=0 if skip_cancel_window else settings.sos_cancel_window_seconds)

    return event


@router.post("/{event_id}/cancel", response_model=SOSEventOut)
async def cancel_sos(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await _get_event(db, event_id, user.id)
    if event.status != SOSStatus.pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Alert has already gone out to contacts and can no longer be silently cancelled — mark yourself safe instead.",
        )
    event.status = SOSStatus.cancelled
    event.resolved_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(event, attribute_names=["status", "resolved_at"])
    return event


@router.post("/{event_id}/resolve", response_model=SOSEventOut)
async def resolve_sos(
    event_id: uuid.UUID,
    payload: SOSResolveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await _get_event(db, event_id, user.id)
    # Password-gated: unlike cancel_sos (only reachable inside the brief
    # pending/countdown window), this is the "mark myself safe" action once
    # a real alert has already gone out — it must not be something anyone
    # who's simply holding the phone or watch can do.
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password")
    event.status = SOSStatus.resolved
    event.resolved_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(event, attribute_names=["status", "resolved_at"])
    run_soon(notify_contacts_of_resolution, str(event.id))
    return event


@router.get("/active", response_model=SOSEventOut | None)
async def get_active_sos(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    # Same invisibility rule as sos_history — see POST /auth/login.
    result = await db.execute(
        select(SOSEvent)
        .options(selectinload(SOSEvent.alerts))
        .where(
            SOSEvent.user_id == user.id,
            SOSEvent.status.in_([SOSStatus.pending, SOSStatus.active]),
            SOSEvent.trigger != SOSTrigger.fake_pin,
        )
        .order_by(SOSEvent.created_at.desc())
    )
    return result.scalars().first()


async def _get_event(db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID) -> SOSEvent:
    result = await db.execute(
        select(SOSEvent)
        .options(selectinload(SOSEvent.alerts))
        .where(SOSEvent.id == event_id, SOSEvent.user_id == user_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS event not found")
    return event


@router.post("/{event_id}/evidence/upload-url", response_model=EvidenceUploadResponse)
async def create_evidence_upload_url(
    event_id: uuid.UUID,
    payload: EvidenceUploadRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Each call mints a real signed upload URL against Supabase and, if the
    # client actually uploads to it without ever calling confirm, leaves an
    # orphaned object behind — the cap below only counts *confirmed*
    # evidence, so nothing else stops a buggy or malicious client from
    # calling this endpoint indefinitely and growing storage unbounded.
    await enforce_rate_limit(f"evidence-upload-url:{user.id}:{event_id}", max_attempts=30, window_seconds=600)

    event = await _get_event(db, event_id, user.id)

    # Defense-in-depth: SOSActive.jsx already skips capture entirely for a
    # practice drill (see is_practice), but a stale/tampered client could
    # still call this directly — nothing about a drill should ever result
    # in real evidence, let alone the real "evidence available" SMS
    # notify_contacts_of_evidence sends to real contacts on confirm.
    if event.is_practice:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Evidence capture is not available for a practice drill")

    # Defense-in-depth: the frontend already skips requesting a disabled
    # media type, but a stale/tampered client could still call this
    # directly, so re-check the stored preference here too.
    if not getattr(user, _EVIDENCE_PREFERENCE_ATTR[payload.media_type]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"{payload.media_type} evidence capture is disabled for this account")

    existing = getattr(event, _EVIDENCE_FIELD[payload.media_type])
    if len(existing) >= _evidence_cap(payload.media_type):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Evidence limit reached for {payload.media_type} on this event"
        )

    # {user_id}/{event_id}/... namespacing is what confirm_evidence checks
    # a client-supplied path against below — never trust a path the client
    # sends back without verifying it actually falls under the event it
    # claims to belong to.
    path = f"{user.id}/{event.id}/{payload.media_type}-{uuid.uuid4()}.{payload.file_extension}"
    try:
        result = await supabase_storage.create_signed_upload_url(settings.supabase_evidence_bucket, path)
    except SupabaseStorageError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return EvidenceUploadResponse(upload_url=result["upload_url"], path=result["path"], media_type=payload.media_type)


@router.post("/{event_id}/evidence/confirm", response_model=SOSEventOut)
async def confirm_evidence(
    event_id: uuid.UUID,
    payload: EvidenceConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await _get_event(db, event_id, user.id)

    if event.is_practice:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Evidence capture is not available for a practice drill")

    expected_prefix = f"{user.id}/{event.id}/"
    if not payload.path.startswith(expected_prefix):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path does not belong to this event")

    # Evidence chunks land every 15-30s and each confirm does a Python-level
    # read-modify-write of a Postgres ARRAY column (append, then write the
    # whole list back) — two confirms for the same event overlapping (two
    # chunks confirmed back-to-back, or a retried request racing the
    # original) would otherwise silently lose whichever one commits first,
    # since both start from the same `existing` snapshot. Locking the row
    # here serializes those confirms so the second one re-reads the
    # first's already-committed append instead of clobbering it.
    event = (
        await db.execute(select(SOSEvent).where(SOSEvent.id == event.id).with_for_update())
    ).scalar_one()

    field_name = _EVIDENCE_FIELD[payload.media_type]
    existing = getattr(event, field_name)
    if payload.path in existing:
        return event  # already confirmed — a retried confirm is a no-op, not an error

    if len(existing) >= _evidence_cap(payload.media_type):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Evidence limit reached for {payload.media_type} on this event"
        )

    setattr(event, field_name, [*existing, payload.path])

    is_first_evidence = event.evidence_notified_at is None
    if is_first_evidence:
        event.evidence_notified_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(event, attribute_names=[field_name, "evidence_notified_at"])

    if is_first_evidence:
        run_soon(notify_contacts_of_evidence, str(event.id))

    return event


@router.get("/{event_id}/evidence", response_model=EvidenceOut)
async def get_evidence(
    event_id: uuid.UUID,
    share_token: str | None = None,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Reachable two ways: the event's own owner (normal bearer token), or
    a trusted contact holding a share link (no account required) — see
    `notify_contacts_of_evidence`, which is what mints that link. Deliberately
    not behind `get_current_user`, since a contact has no Safetee account
    at all."""
    event = await db.get(SOSEvent, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS event not found")

    if not await _caller_may_view_evidence(db, event, authorization, share_token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to view this event's evidence")

    try:
        audio_urls = [await supabase_storage.create_signed_download_url(p) for p in event.audio_segment_paths]
        video_urls = [await supabase_storage.create_signed_download_url(p) for p in event.video_segment_paths]
        photo_urls = [await supabase_storage.create_signed_download_url(p) for p in event.photo_paths]
    except SupabaseStorageError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return EvidenceOut(audio_urls=audio_urls, video_urls=video_urls, photo_urls=photo_urls)


async def _caller_may_view_evidence(
    db: AsyncSession, event: SOSEvent, authorization: str | None, share_token: str | None
) -> bool:
    if authorization and authorization.lower().startswith("bearer "):
        try:
            payload = decode_token(authorization.split(" ", 1)[1])
            if payload.get("type") == "access":
                caller_id = payload["sub"]
                if caller_id == str(event.user_id):
                    return True
                # Not the owner — but a logged-in trusted contact should
                # reach this via their own account too, not only the SMS
                # link's token (that link may have expired, or they may
                # simply prefer using the app they already have installed).
                caller = await db.get(User, uuid.UUID(caller_id))
                if caller and await is_trusted_contact_of(db, event.user_id, caller.phone):
                    return True
        except (jwt.PyJWTError, ValueError, KeyError):
            pass
    if share_token:
        try:
            decode_share_token(share_token, scope="sos_evidence", resource_id=str(event.id))
            return True
        except (jwt.PyJWTError, ValueError):
            pass
    return False


@router.get("/incoming", response_model=list[IncomingAlertOut])
async def list_incoming_alerts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """SOS events triggered by someone who has the current user listed as
    a trusted contact — the in-app counterpart to the SMS alert, for
    contacts who happen to also be Safetee users."""
    owner_ids = await watched_owner_ids(db, user.phone)
    owner_ids.discard(user.id)  # never surface your own alerts as "incoming"
    if not owner_ids:
        return []

    # Once this viewer has explicitly acknowledged an alert, it stops
    # showing up here (and therefore in the Dashboard banner, which reads
    # from this same endpoint) — filtered in SQL, not fetched-then-hidden,
    # so it doesn't eat into the 50-row limit below.
    already_acked = exists().where(
        SOSAcknowledgment.sos_event_id == SOSEvent.id,
        SOSAcknowledgment.user_id == user.id,
    )
    result = await db.execute(
        select(SOSEvent, User)
        .join(User, User.id == SOSEvent.user_id)
        # A practice drill (see SOSEvent.is_practice) never sends this
        # contact a real SMS/push, and shouldn't be pullable here either
        # — otherwise opening the app and polling this endpoint would
        # show a fake alert as if it were real, defeating the entire
        # point of a drill being invisible to real contacts.
        .where(SOSEvent.user_id.in_(owner_ids), not_(already_acked), not_(SOSEvent.is_practice))
        .order_by(SOSEvent.created_at.desc())
        .limit(50)
    )
    return [
        IncomingAlertOut(
            id=event.id,
            status=event.status,
            trigger=event.trigger,
            created_at=event.created_at,
            resolved_at=event.resolved_at,
            origin_lat=event.origin_lat,
            origin_lng=event.origin_lng,
            alerter_name=alerter.full_name,
            alerter_avatar_url=alerter.avatar_url,
        )
        for event, alerter in result.all()
    ]


@router.post("/{event_id}/acknowledge", status_code=status.HTTP_204_NO_CONTENT)
async def acknowledge_alert(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A trusted contact marks an alert as seen — dismisses it from their
    own incoming-alerts view (Dashboard banner, Network page) only. Doesn't
    touch the SOS event's own resolved/cancelled status; only the alerter
    can mark themselves safe. Idempotent."""
    event = await db.get(SOSEvent, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS event not found")
    if event.user_id != user.id and not await is_trusted_contact_of(db, event.user_id, user.phone):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")

    existing = (
        await db.execute(
            select(SOSAcknowledgment).where(
                SOSAcknowledgment.sos_event_id == event_id, SOSAcknowledgment.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(SOSAcknowledgment(sos_event_id=event_id, user_id=user.id))
        await db.commit()
