from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enums import SOSTrigger
from app.models.journey import Journey
from app.models.sos_event import SOSEvent
from app.models.user import User
from app.schemas.journey import JourneyOut
from app.schemas.sos import SOSEventOut

router = APIRouter(prefix="/history", tags=["history"])


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
