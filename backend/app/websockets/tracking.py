import json
import logging
import uuid

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_share_token, decode_token
from app.db.session import get_db
from app.models.journey import Journey

logger = logging.getLogger("safetee.ws")
router = APIRouter()


class ConnectionManager:
    """In-memory per-journey connection registry.

    NOTE: this only works within a single API process. Once the API scales
    past one instance, replace this with a Redis pub/sub channel per
    journey_id — the API worker publishes on check-in, and each instance's
    websocket connections subscribe and forward. Flagged here rather than
    built now since it's not needed until traffic requires >1 replica.
    """

    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, journey_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(journey_id, set()).add(ws)

    def disconnect(self, journey_id: str, ws: WebSocket):
        room = self.rooms.get(journey_id)
        if room is None:
            return
        room.discard(ws)
        # Without this, every journey/share ever tracked leaves a
        # permanently-empty entry behind — an unbounded leak over the
        # life of the process, since nothing else ever revisits a room
        # once its last connection has left.
        if not room:
            del self.rooms[journey_id]

    async def broadcast(self, journey_id: str, payload: dict):
        dead = []
        for ws in self.rooms.get(journey_id, set()):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(journey_id, ws)


manager = ConnectionManager()


async def _authorize(journey_id: str, token: str | None, db: AsyncSession) -> bool | None:
    """None => reject the connection outright. True => the journey's real
    owner, may publish location frames. False => a contact holding a valid
    share link, read-only.

    Previously this endpoint had no auth at all: any connection in a room
    could broadcast arbitrary {lat, lng} frames to everyone else in it,
    including the real owner and their trusted contacts — a live spoofing
    vector in a feature whose entire point is a trustworthy location claim.
    """
    if not token:
        return None
    try:
        journey_uuid = uuid.UUID(journey_id)
    except ValueError:
        return None

    result = await db.execute(select(Journey.user_id).where(Journey.id == journey_uuid))
    owner_id = result.scalar_one_or_none()
    if owner_id is None:
        return None

    try:
        payload = decode_token(token)
        if payload.get("type") == "access" and payload.get("sub") == str(owner_id):
            return True
    except jwt.PyJWTError:
        pass

    try:
        decode_share_token(token, scope="journey", resource_id=journey_id)
        return False
    except (jwt.PyJWTError, ValueError):
        pass

    return None


@router.websocket("/ws/journeys/{journey_id}")
async def journey_tracking_socket(
    websocket: WebSocket,
    journey_id: str,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """The journey owner's client pushes {lat, lng, accuracy_m} frames here;
    every other connection in the room (e.g. a trusted contact's browser
    viewing a shared tracking link) receives them in real time, read-only."""
    can_write = await _authorize(journey_id, token, db)
    if can_write is None:
        await websocket.close(code=4401)
        return

    await manager.connect(journey_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            if not can_write:
                continue  # a viewer's own frames are never forwarded to the room
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await manager.broadcast(journey_id, payload)
    except WebSocketDisconnect:
        pass
    finally:
        # Not just in the WebSocketDisconnect branch — any other exception
        # out of the loop above must still free this connection's slot, or
        # it stays registered in the room forever (see location_sharing.py,
        # which already used finally for the same reason).
        manager.disconnect(journey_id, websocket)
