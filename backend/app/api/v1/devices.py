import json

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.user import DeviceRegister

router = APIRouter(prefix="/devices", tags=["devices"])

_LIKE_ESCAPE = "\\"


def _escape_like(value: str) -> str:
    """`.contains()` compiles to a `LIKE '%...%'`, where `%`/`_` are
    wildcards — a push endpoint URL routinely contains `_` and can contain
    `%`, so without escaping, unregistering one device could accidentally
    also match (and delete) a different device of the same user whose
    token merely differs by one character at that position."""
    return value.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2).replace("%", rf"{_LIKE_ESCAPE}%").replace("_", rf"{_LIKE_ESCAPE}_")


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def register_device(
    payload: DeviceRegister,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Called after the browser grants Notification permission and
    subscribes via pushManager.subscribe() — see Settings.jsx. push_token
    stores the whole {endpoint, keys} subscription as JSON, not a single
    opaque string the way FCM tokens work; send_push() parses it back out.
    Re-subscribing with the same endpoint (e.g. re-opening the app) is a
    no-op rather than a duplicate row.
    """
    push_token = json.dumps({"endpoint": payload.endpoint, "keys": payload.keys})
    existing = await db.execute(
        select(Device).where(Device.user_id == user.id, Device.push_token == push_token)
    )
    if existing.scalar_one_or_none() is None:
        db.add(Device(user_id=user.id, push_token=push_token, platform=payload.platform))
        await db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(
    endpoint: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Called when the user turns notifications off. Matches by substring
    since push_token stores the whole subscription JSON blob, not just the
    endpoint — safe because endpoint URLs are unique, random per-subscription
    paths, as long as LIKE wildcards in it are escaped (see _escape_like)."""
    result = await db.execute(
        select(Device).where(
            Device.user_id == user.id,
            Device.push_token.contains(_escape_like(endpoint), escape=_LIKE_ESCAPE),
        )
    )
    for device in result.scalars().all():
        await db.delete(device)
    await db.commit()
