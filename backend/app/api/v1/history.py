import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.security import verify_password
from app.db.session import get_db
from app.models.enums import JourneyStatus, SOSStatus, SOSTrigger
from app.models.journey import Journey
from app.models.sos_event import SOSEvent
from app.models.user import User
from app.schemas.journey import JourneyOut
from app.schemas.sos import SOSEventOut

router = APIRouter(prefix="/history", tags=["history"])


class HistoryClearRequest(BaseModel):
    password: str
    # Omitted (None) on either means "every eligible entry of that kind" —
    # what the original one-tap "Clear all" did, and still does. An empty
    # list is different from omitted: it means the caller (the per-item
    # selection UI in History.jsx) deliberately selected zero entries of
    # that kind, so nothing of that kind should be touched.
    sos_ids: list[uuid.UUID] | None = None
    journey_ids: list[uuid.UUID] | None = None


@router.get("/journeys", response_model=list[JourneyOut])
async def journey_history(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), limit: int = 50
):
    result = await db.execute(
        select(Journey)
        .where(Journey.user_id == user.id)
        .order_by(Journey.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/sos", response_model=list[SOSEventOut])
async def sos_history(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), limit: int = 50
):
    # A fake-PIN duress trigger is deliberately invisible to its own
    # account — the whole point is that whoever forced the login sees
    # nothing unusual. See POST /auth/login.
    result = await db.execute(
        select(SOSEvent)
        .options(selectinload(SOSEvent.alerts))
        .where(SOSEvent.user_id == user.id, SOSEvent.trigger != SOSTrigger.fake_pin)
        .order_by(SOSEvent.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_history(
    payload: HistoryClearRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Password-confirmed for the same reason account deletion is: someone
    who's simply gotten hold of an already-unlocked phone shouldn't be able
    to wipe the record of past alerts. Only finished journeys/SOS events are
    eligible — anything still active or pending is left alone no matter what,
    so this can never be used to make an in-progress emergency disappear.
    Pass sos_ids/journey_ids to clear only specific entries (the History
    page's per-item selection); omit both to clear everything eligible."""
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password")

    sos_clause = [SOSEvent.user_id == user.id, SOSEvent.status.in_([SOSStatus.resolved, SOSStatus.cancelled])]
    if payload.sos_ids is not None:
        sos_clause.append(SOSEvent.id.in_(payload.sos_ids))
    await db.execute(delete(SOSEvent).where(*sos_clause))

    journey_clause = [
        Journey.user_id == user.id,
        Journey.status.in_([JourneyStatus.arrived, JourneyStatus.escalated, JourneyStatus.cancelled]),
    ]
    if payload.journey_ids is not None:
        journey_clause.append(Journey.id.in_(payload.journey_ids))
    await db.execute(delete(Journey).where(*journey_clause))

    await db.commit()
