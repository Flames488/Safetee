import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.enums import SOSStatus
from app.models.sos_event import SOSEvent
from app.models.user import User
from app.schemas.sos import SOSEventOut, SOSTriggerRequest
from app.workers.tasks.sos_tasks import fanout_sos_alerts

router = APIRouter(prefix="/sos", tags=["sos"])


@router.post("/trigger", response_model=SOSEventOut, status_code=status.HTTP_201_CREATED)
async def trigger_sos(
    payload: SOSTriggerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(UTC)
    event = SOSEvent(
        user_id=user.id,
        journey_id=payload.journey_id,
        trigger=payload.trigger,
        status=SOSStatus.pending,
        origin_lat=payload.lat,
        origin_lng=payload.lng,
        cancel_window_ends_at=now + timedelta(seconds=settings.sos_cancel_window_seconds),
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

    # Fires after the cancel window. fanout_sos_alerts re-checks event.status
    # itself, so a cancel recorded in the meantime is enough to no-op it —
    # no task revocation plumbing required.
    fanout_sos_alerts.apply_async(args=[str(event.id)], countdown=settings.sos_cancel_window_seconds)

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
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await _get_event(db, event_id, user.id)
    event.status = SOSStatus.resolved
    event.resolved_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(event, attribute_names=["status", "resolved_at"])
    return event


@router.get("/active", response_model=SOSEventOut | None)
async def get_active_sos(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(SOSEvent)
        .options(selectinload(SOSEvent.alerts))
        .where(
            SOSEvent.user_id == user.id,
            SOSEvent.status.in_([SOSStatus.pending, SOSStatus.active]),
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
