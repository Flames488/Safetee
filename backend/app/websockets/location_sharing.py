import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import LocationShareStatus
from app.models.location_share import LocationShare
from app.websockets.tracking import ConnectionManager

logger = logging.getLogger("safetee.ws")
router = APIRouter()

# Separate room registry from the journey-tracking one (app/websockets/
# tracking.py) — same class, different keyspace (share_id vs journey_id),
# kept as distinct instances (and a distinct Redis channel prefix) rather
# than sharing one dict so the two features can never cross-talk even in
# the (practically impossible) case of a UUID collision between a journey
# and a location share.
manager = ConnectionManager(channel_prefix="location")


async def _authorize(share_id: str, token: str | None, db: AsyncSession) -> bool | None:
    """None => reject the connection outright. True => the share's owner,
    may publish location frames. False => the share's viewer, read-only.

    Simpler than the journey-tracking websocket's auth: both sides of a
    LocationShare are always real, authenticated Safetee accounts (that's
    the whole premise of this feature — it only works between two app
    users) — no share-token/no-account-viewer path to also support.
    """
    if not token:
        return None
    try:
        share_uuid = uuid.UUID(share_id)
    except ValueError:
        return None

    share = await db.get(LocationShare, share_uuid)
    if share is None or share.status != LocationShareStatus.active:
        return None
    if share.expires_at is None or share.expires_at <= datetime.now(UTC):
        return None

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        caller_id = payload.get("sub")
    except jwt.PyJWTError:
        return None

    if caller_id == str(share.owner_id):
        return True
    if caller_id == str(share.viewer_id):
        return False
    return None


@router.websocket("/ws/locations/{share_id}")
async def location_share_socket(
    websocket: WebSocket,
    share_id: str,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """The share owner's client pushes {lat, lng, accuracy_m} frames here;
    the viewer receives them in real time, read-only. Unlike journey
    tracking, nothing here is ever persisted to the database — see
    LocationShare's own docstring for why that's deliberate.

    No Celery sweep enforces expires_at (this feature doesn't depend on
    the worker existing at all — see app/api/v1/locations.py). Instead the
    receive loop re-checks the already-fetched share's expiry on a timeout
    cadence, so a session that goes quiet (no frames, nobody reconnecting)
    still actually ends around when it's supposed to, not just whenever
    someone happens to send the next frame.
    """
    can_write = await _authorize(share_id, token, db)
    if can_write is None:
        await websocket.close(code=4401)
        return

    share = await db.get(LocationShare, uuid.UUID(share_id))
    await manager.connect(share_id, websocket)
    try:
        while True:
            # db.get() on the object already loaded above would just
            # return the same session-cached instance without re-querying
            # — an explicit refresh is required to see a stop_share()
            # commit made from a different request/session. Without this,
            # POST /shares/{id}/stop had zero effect on a socket that was
            # already open (a second tab, a background tab, anything that
            # doesn't proactively .close() the way ShareLocation.jsx does)
            # until expires_at eventually passed on its own.
            await db.refresh(share)
            if share.status != LocationShareStatus.active:
                await websocket.close(code=4409)  # owner stopped the share
                break
            remaining = (share.expires_at - datetime.now(UTC)).total_seconds()
            if remaining <= 0:
                await websocket.close(code=4408)  # session's time window ended
                break
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=min(remaining, 30))
            except TimeoutError:
                continue  # no frame in this window — loop back and re-check expiry
            if not can_write:
                continue  # a viewer's own frames are never forwarded to the room
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await manager.broadcast(share_id, payload)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(share_id, websocket)
