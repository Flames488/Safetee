from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.journey import Journey
from app.models.sos_event import SOSEvent
from app.models.user import User
from app.schemas.user import AccountDeleteRequest, DataExportOut, ProfileUpdate, TriggerUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Partial update for basic profile fields. Deliberately narrow (name,
    email, medical info) — phone number changes go through a separate
    verified flow elsewhere, not this endpoint, since phone is also the
    login identifier."""
    if payload.email is not None:
        existing = await db.execute(select(User).where(User.email == payload.email, User.id != user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, "That email is already in use on another account")
        user.email = payload.email
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.medical_info is not None:
        user.medical_info = payload.medical_info or None

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/me/triggers", response_model=UserOut)
async def update_triggers(
    payload: TriggerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Partial update for the hidden-SOS-trigger config. The fake PIN is
    hashed the same way a password is (never stored or returned in the
    clear) — the response only ever reports whether one is set."""
    if payload.clear_fake_pin:
        user.fake_pin_hash = None
    elif payload.fake_pin:
        user.fake_pin_hash = hash_password(payload.fake_pin)

    if payload.power_button_trigger_enabled is not None:
        user.power_button_trigger_enabled = payload.power_button_trigger_enabled
    if payload.gesture_trigger_enabled is not None:
        user.gesture_trigger_enabled = payload.gesture_trigger_enabled

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/me/export", response_model=DataExportOut)
async def export_my_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Self-serve data export backing Settings' "Privacy & data controls" —
    the Privacy Policy promises the user can review their data "at any
    time from Settings", so this has to be a real download, not a link
    to the static policy text."""
    contacts = (
        await db.execute(select(TrustedContact).where(TrustedContact.user_id == user.id))
    ).scalars().all()
    journeys = (
        await db.execute(select(Journey).where(Journey.user_id == user.id))
    ).scalars().all()
    sos_events = (
        await db.execute(
            select(SOSEvent).options(selectinload(SOSEvent.alerts)).where(SOSEvent.user_id == user.id)
        )
    ).scalars().all()
    return DataExportOut(
        exported_at=datetime.now(UTC),
        profile=user,
        contacts=contacts,
        journeys=journeys,
        sos_events=sos_events,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    payload: AccountDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Password-confirmed, irreversible. Deleting the User row cascades to
    contacts/journeys/sos_events/devices/subscription/payments via the
    `cascade="all, delete-orphan"` relationships on the model — no manual
    child cleanup needed here."""
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password")
    await db.delete(user)
    await db.commit()
