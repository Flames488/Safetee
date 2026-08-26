import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_share_token
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.enums import JourneyStatus
from app.models.journey import Journey, LocationPing
from app.models.user import User
from app.schemas.journey import JourneyCheckin, JourneyCreate, JourneyOut
from app.services.sms.fallback import SMSDeliveryFailed, send_with_fallback

router = APIRouter(prefix="/journeys", tags=["journeys"])


@router.post("", response_model=JourneyOut, status_code=status.HTTP_201_CREATED)
async def start_journey(
    payload: JourneyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(UTC)
    journey = Journey(
        user_id=user.id,
        destination_label=payload.destination_label,
        destination_lat=payload.destination_lat,
        destination_lng=payload.destination_lng,
        expected_minutes=payload.expected_minutes,
        grace_minutes=settings.journey_checkin_grace_minutes,
        expected_arrival_at=now + timedelta(minutes=payload.expected_minutes),
        notify_contact_ids=[str(cid) for cid in payload.notify_contact_ids],
    )
    db.add(journey)
    await db.commit()
    await db.refresh(journey)

    # Previously nothing ever sent notified contacts a link at all — the
    # journey's own websocket + share-token auth already supported a
    # contact viewing it live, but no code path ever minted or delivered
    # that token. Sent synchronously (thread-pooled), not via Celery, so
    # this actually works today regardless of whether safetee-worker
    # exists — same reasoning as the location-sharing feature's push.
    if user.share_location_enabled and journey.notify_contact_ids:
        contact_ids = {uuid.UUID(cid) for cid in journey.notify_contact_ids}
        # Scoped to this user's own contacts — without this, a crafted
        # notify_contact_ids UUID belonging to another user would send that
        # stranger's contact an unsolicited SMS with a live-location link.
        contacts = (
            await db.execute(
                select(TrustedContact).where(
                    TrustedContact.id.in_(contact_ids), TrustedContact.user_id == user.id
                )
            )
        ).scalars().all()
        for contact in contacts:
            token = create_share_token(scope="journey", resource_id=str(journey.id), contact_id=str(contact.id))
            link = f"{settings.frontend_url}/track/journey/{journey.id}?token={token}"
            body = f"SAFETEE: {user.full_name} started a Safe Journey and is sharing their live location with you. {link}"
            try:
                await run_in_threadpool(send_with_fallback, contact.phone, body)
            except SMSDeliveryFailed:
                pass  # best-effort, matches the location-sharing push's own tolerance for individual failures

    return journey


@router.get("/{journey_id}", response_model=JourneyOut)
async def get_journey(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Journey).where(Journey.id == journey_id, Journey.user_id == user.id))
    journey = result.scalar_one_or_none()
    if journey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journey not found")
    return journey


@router.post("/{journey_id}/checkin", status_code=status.HTTP_204_NO_CONTENT)
async def checkin(
    journey_id: uuid.UUID,
    payload: JourneyCheckin,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    journey = await _get_active_journey(db, journey_id, user.id)
    journey.last_checkin_at = datetime.now(UTC)
    # Liveness (last_checkin_at, used by the overdue-journey sweep) always
    # updates regardless of the preference — only the location trail itself
    # is opt-in. LocationPing.lat/lng are non-nullable, so honoring the
    # toggle means skipping the row entirely, not writing a null location.
    if user.share_location_enabled:
        db.add(LocationPing(
            journey_id=journey.id,
            lat=payload.lat,
            lng=payload.lng,
            accuracy_m=payload.accuracy_m,
            recorded_at=journey.last_checkin_at,
        ))
    await db.commit()


@router.post("/{journey_id}/arrived", response_model=JourneyOut)
async def mark_arrived(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _claim_active_journey(db, journey_id, user.id, JourneyStatus.arrived)


@router.post("/{journey_id}/cancel", response_model=JourneyOut)
async def cancel_journey(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _claim_active_journey(db, journey_id, user.id, JourneyStatus.cancelled)


async def _get_active_journey(db: AsyncSession, journey_id: uuid.UUID, user_id: uuid.UUID) -> Journey:
    result = await db.execute(
        select(Journey).where(Journey.id == journey_id, Journey.user_id == user_id)
    )
    journey = result.scalar_one_or_none()
    if journey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journey not found")
    if journey.status != JourneyStatus.active:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Journey is already {journey.status.value}")
    return journey


async def _claim_active_journey(
    db: AsyncSession, journey_id: uuid.UUID, user_id: uuid.UUID, new_status: JourneyStatus
) -> Journey:
    """Same atomic-claim shape as sweep_overdue_journeys' active -> escalated
    UPDATE: the read-then-write this replaced (_get_active_journey's SELECT
    followed by a plain attribute assignment + commit) had no WHERE-status
    guard on its own write, so a journey the sweep escalated to an active
    SOS event in the gap between that SELECT and this commit got silently
    overwritten back to arrived/cancelled — masking that an alert had
    already gone out. The UPDATE's own WHERE clause makes the transition
    conditional on still being 'active' at commit time, so only one of the
    two ever actually lands.
    """
    result = await db.execute(
        update(Journey)
        .where(Journey.id == journey_id, Journey.user_id == user_id, Journey.status == JourneyStatus.active)
        .values(status=new_status)
        .returning(Journey)
    )
    journey = result.scalar_one_or_none()
    if journey is not None:
        await db.commit()
        return journey

    await db.rollback()
    existing = await _get_journey_or_404(db, journey_id, user_id)
    raise HTTPException(status.HTTP_409_CONFLICT, f"Journey is already {existing.status.value}")


async def _get_journey_or_404(db: AsyncSession, journey_id: uuid.UUID, user_id: uuid.UUID) -> Journey:
    result = await db.execute(select(Journey).where(Journey.id == journey_id, Journey.user_id == user_id))
    journey = result.scalar_one_or_none()
    if journey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journey not found")
    return journey
