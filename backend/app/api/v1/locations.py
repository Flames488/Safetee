import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.phone import normalize_phone
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.device import Device
from app.models.enums import LocationShareStatus
from app.models.location_share import LocationShare
from app.models.user import User
from app.schemas.location import (
    LocationRequestCreate,
    LocationShareCreate,
    LocationShareOut,
    LocationShareRespond,
    WatcherOut,
)
from app.services.contact_matching import is_trusted_contact_of, watched_owner_ids
from app.services.notifications.push import send_push

router = APIRouter(prefix="/locations", tags=["locations"])


def _clamp_duration(requested: int | None) -> int:
    duration = requested or settings.location_share_default_minutes
    return min(duration, settings.location_share_max_minutes)


async def _devices_for(db: AsyncSession, user_id: uuid.UUID) -> list[Device]:
    return (await db.execute(select(Device).where(Device.user_id == user_id))).scalars().all()


async def _push_all(db: AsyncSession, user_id: uuid.UUID, title: str, body: str, url: str) -> None:
    """Sent synchronously (via a threadpool, not blocking the event loop)
    rather than through a Celery task like every other notification in
    this app — deliberately. This feature is meant to feel instant, and
    unlike SMS (which needs Celery's retry semantics for reliability),
    push is already best-effort with no retry story. Bonus: it means
    location requests/shares actually work even while safetee-worker
    doesn't exist in production, which nothing else in the app can claim
    right now."""
    for device in await _devices_for(db, user_id):
        await run_in_threadpool(send_push, device.push_token, title, body, {"url": url})


async def _build_outs(db: AsyncSession, shares: list[LocationShare]) -> list[LocationShareOut]:
    user_ids = {s.owner_id for s in shares} | {s.viewer_id for s in shares}
    names: dict[uuid.UUID, str] = {}
    if user_ids:
        rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))).all()
        names = {r.id: r.full_name for r in rows}
    return [
        LocationShareOut(
            id=s.id,
            status=s.status,
            initiated_by_viewer=s.initiated_by_viewer,
            duration_minutes=s.duration_minutes,
            started_at=s.started_at,
            expires_at=s.expires_at,
            created_at=s.created_at,
            owner_id=s.owner_id,
            viewer_id=s.viewer_id,
            owner_name=names.get(s.owner_id, ""),
            viewer_name=names.get(s.viewer_id, ""),
        )
        for s in shares
    ]


async def _get_actionable_request(db: AsyncSession, share_id: uuid.UUID, owner_id: uuid.UUID) -> LocationShare:
    share = await db.get(LocationShare, share_id)
    if share is None or share.owner_id != owner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location request not found")
    if share.status != LocationShareStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Request is already {share.status.value}")
    stale_after = share.created_at + timedelta(hours=settings.location_request_expire_hours)
    if datetime.now(UTC) > stale_after:
        raise HTTPException(status.HTTP_410_GONE, "This request has expired — ask them to send a new one")
    return share


@router.get("/watchers", response_model=list[WatcherOut])
async def list_watchers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """People who could be asked for their location — everyone who has the
    current user listed as a trusted contact, same population as the
    incoming-alerts feed."""
    owner_ids = await watched_owner_ids(db, user.phone)
    owner_ids.discard(user.id)
    if not owner_ids:
        return []
    rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(owner_ids)))).all()
    return [WatcherOut(user_id=r.id, full_name=r.full_name) for r in rows]


@router.post("/requests", response_model=LocationShareOut, status_code=status.HTTP_201_CREATED)
async def request_location(
    payload: LocationRequestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.target_user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't request your own location")
    target = await db.get(User, payload.target_user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    # Re-verified server-side regardless of what the frontend's watcher
    # list showed — a target id alone is never proof of the relationship.
    if not await is_trusted_contact_of(db, target.id, user.phone):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You're not a trusted contact of this user")

    existing = (
        await db.execute(
            select(LocationShare).where(
                LocationShare.owner_id == target.id,
                LocationShare.viewer_id == user.id,
                LocationShare.status == LocationShareStatus.pending,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        # Repeated taps re-surface the same pending request instead of
        # piling up duplicates and re-notifying every time.
        return (await _build_outs(db, [existing]))[0]

    share = LocationShare(
        owner_id=target.id,
        viewer_id=user.id,
        status=LocationShareStatus.pending,
        initiated_by_viewer=True,
        duration_minutes=settings.location_share_default_minutes,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    # /app/alerts is where the frontend actually renders incoming location
    # requests (IncomingAlerts.jsx's "Location requests" section) — there's
    # no separate /app/location-requests route.
    await _push_all(db, target.id, "Location request", f"{user.full_name} wants to see your location", "/app/alerts")

    return (await _build_outs(db, [share]))[0]


@router.get("/requests/incoming", response_model=list[LocationShareOut])
async def list_incoming_requests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stale_cutoff = datetime.now(UTC) - timedelta(hours=settings.location_request_expire_hours)
    shares = (
        await db.execute(
            select(LocationShare)
            .where(
                LocationShare.owner_id == user.id,
                LocationShare.status == LocationShareStatus.pending,
                LocationShare.created_at > stale_cutoff,
            )
            .order_by(LocationShare.created_at.desc())
        )
    ).scalars().all()
    return await _build_outs(db, shares)


@router.post("/requests/{share_id}/accept", response_model=LocationShareOut)
async def accept_request(
    share_id: uuid.UUID,
    payload: LocationShareRespond,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    share = await _get_actionable_request(db, share_id, user.id)
    duration = _clamp_duration(payload.duration_minutes)
    now = datetime.now(UTC)
    share.status = LocationShareStatus.active
    share.duration_minutes = duration
    share.started_at = now
    share.expires_at = now + timedelta(minutes=duration)
    await db.commit()
    await db.refresh(share)

    await _push_all(
        db, share.viewer_id, "Location shared", f"{user.full_name} is sharing their location with you",
        f"/track/location/{share.id}",
    )

    return (await _build_outs(db, [share]))[0]


@router.post("/requests/{share_id}/decline", response_model=LocationShareOut)
async def decline_request(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    share = await _get_actionable_request(db, share_id, user.id)
    share.status = LocationShareStatus.declined
    await db.commit()
    await db.refresh(share)
    return (await _build_outs(db, [share]))[0]


@router.post("/share", response_model=LocationShareOut, status_code=status.HTTP_201_CREATED)
async def share_location(
    payload: LocationShareCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """'Share at will' — the owner starts this unprompted, no request
    involved. Still restricted to a contact who's genuinely a registered
    user (there's no account to authorize or notify otherwise)."""
    contact = await db.get(TrustedContact, payload.contact_id)
    if contact is None or contact.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")

    target_user = (
        await db.execute(select(User).where(User.phone == normalize_phone(contact.phone)))
    ).scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This contact isn't a Safetee user yet")

    duration = _clamp_duration(payload.duration_minutes)
    now = datetime.now(UTC)
    share = LocationShare(
        owner_id=user.id,
        viewer_id=target_user.id,
        status=LocationShareStatus.active,
        initiated_by_viewer=False,
        duration_minutes=duration,
        started_at=now,
        expires_at=now + timedelta(minutes=duration),
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    await _push_all(
        db, target_user.id, "Location shared", f"{user.full_name} is sharing their location with you",
        f"/track/location/{share.id}",
    )

    return (await _build_outs(db, [share]))[0]


@router.get("/shares/active", response_model=list[LocationShareOut])
async def list_active_shares(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The owner's own view of what they're currently broadcasting — lets
    them see (and stop) everything live at a glance."""
    shares = (
        await db.execute(
            select(LocationShare)
            .where(
                LocationShare.owner_id == user.id,
                LocationShare.status == LocationShareStatus.active,
                LocationShare.expires_at > datetime.now(UTC),
            )
            .order_by(LocationShare.created_at.desc())
        )
    ).scalars().all()
    return await _build_outs(db, shares)


@router.get("/shares/viewing", response_model=list[LocationShareOut])
async def list_viewing_shares(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The other side of /shares/active — locations currently shared *with*
    the current user (from an accepted request or a self-initiated share
    someone sent them). Without this, the only way to find a granted share
    is the deep link in its push notification, which silently doesn't
    exist for anyone who hasn't set up push."""
    shares = (
        await db.execute(
            select(LocationShare)
            .where(
                LocationShare.viewer_id == user.id,
                LocationShare.status == LocationShareStatus.active,
                LocationShare.expires_at > datetime.now(UTC),
            )
            .order_by(LocationShare.created_at.desc())
        )
    ).scalars().all()
    return await _build_outs(db, shares)


@router.post("/shares/{share_id}/stop", response_model=LocationShareOut)
async def stop_share(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    share = await db.get(LocationShare, share_id)
    if share is None or share.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    if share.status == LocationShareStatus.active:
        share.status = LocationShareStatus.stopped
        await db.commit()
        await db.refresh(share)
    return (await _build_outs(db, [share]))[0]


@router.get("/shares/{share_id}", response_model=LocationShareOut)
async def get_share(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Either side of the share can poll this — the owner to confirm it's
    live, the viewer to check status/expiry before (and while) connecting
    to the websocket."""
    share = await db.get(LocationShare, share_id)
    if share is None or user.id not in (share.owner_id, share.viewer_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    return (await _build_outs(db, [share]))[0]
