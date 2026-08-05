import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.enums import JourneyStatus
from app.models.journey import Journey, LocationPing
from app.models.user import User
from app.schemas.journey import JourneyCheckin, JourneyCreate, JourneyOut

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
    journey = await _get_active_journey(db, journey_id, user.id)
    journey.status = JourneyStatus.arrived
    await db.commit()
    await db.refresh(journey)
    return journey


@router.post("/{journey_id}/cancel", response_model=JourneyOut)
async def cancel_journey(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    journey = await _get_active_journey(db, journey_id, user.id)
    journey.status = JourneyStatus.cancelled
    await db.commit()
    await db.refresh(journey)
    return journey


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
