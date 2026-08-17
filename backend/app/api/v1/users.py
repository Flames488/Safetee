import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.journey import Journey
from app.models.sos_event import SOSEvent
from app.models.user import User
from app.schemas.user import (
    AccountDeleteRequest,
    AvatarConfirmRequest,
    AvatarUploadRequest,
    AvatarUploadResponse,
    DataExportOut,
    PreferencesUpdate,
    ProfileUpdate,
    TriggerUpdate,
    UserOut,
)
from app.services.storage.supabase_storage import SupabaseStorageError, supabase_storage

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


@router.post("/me/avatar/upload-url", response_model=AvatarUploadResponse)
async def create_avatar_upload_url(
    payload: AvatarUploadRequest,
    user: User = Depends(get_current_user),
):
    # {user_id}/avatar-{uuid} namespacing is what confirm_avatar checks a
    # client-supplied path against below — never trust a path the client
    # sends back without verifying it actually falls under this user.
    path = f"{user.id}/avatar-{uuid.uuid4()}.{payload.file_extension}"
    try:
        result = await supabase_storage.create_signed_upload_url(settings.supabase_avatar_bucket, path)
    except SupabaseStorageError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return AvatarUploadResponse(upload_url=result["upload_url"], path=result["path"])


@router.post("/me/avatar/confirm", response_model=UserOut)
async def confirm_avatar(
    payload: AvatarConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expected_prefix = f"{user.id}/"
    if not payload.path.startswith(expected_prefix):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path does not belong to this account")

    user.avatar_path = payload.path
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/me/avatar", response_model=UserOut)
async def delete_avatar(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reverts to the initials avatar. Doesn't bother deleting the old
    object from storage — same tradeoff already made everywhere else in
    this app that mints storage paths (see account deletion), and the old
    path is never linked from anywhere once avatar_path is cleared."""
    user.avatar_path = None
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

    if payload.gesture_trigger_enabled is not None:
        user.gesture_trigger_enabled = payload.gesture_trigger_enabled

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/me/preferences", response_model=UserOut)
async def update_preferences(
    payload: PreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """What gets shared/captured during an emergency. These aren't just
    display prefs — trigger_sos, checkin, and the evidence upload-url
    endpoint all re-check the stored value directly, so flipping one off
    here takes effect even if a stale client still tries to send that
    data."""
    if payload.share_location_enabled is not None:
        user.share_location_enabled = payload.share_location_enabled
    if payload.evidence_audio_enabled is not None:
        user.evidence_audio_enabled = payload.evidence_audio_enabled
    if payload.evidence_video_enabled is not None:
        user.evidence_video_enabled = payload.evidence_video_enabled
    if payload.evidence_photo_enabled is not None:
        user.evidence_photo_enabled = payload.evidence_photo_enabled

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
