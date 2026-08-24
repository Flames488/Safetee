import asyncio
import json
import logging
import uuid

import jwt
import redis.asyncio as redis
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_share_token, decode_token
from app.db.session import get_db
from app.models.journey import Journey

logger = logging.getLogger("safetee.ws")
router = APIRouter()


class ConnectionManager:
    """Per-room connection registry, relayed across API processes via Redis
    pub/sub. `channel_prefix` keeps each feature's rooms (journey tracking
    vs. location sharing) on separate channels even though both features
    share this class, so a UUID collision between a journey and a share
    can never cross-talk.

    The local `rooms` dict alone only ever covers connections held by this
    one process — with more than one gunicorn worker (see Dockerfile's
    `-w 2`), a journey's owner and a viewer holding its share link can
    easily land on different processes, and neither would ever see the
    other's frames without this relay.
    """

    def __init__(self, channel_prefix: str):
        self.rooms: dict[str, set[WebSocket]] = {}
        self._channel_prefix = channel_prefix
        self._instance_id = uuid.uuid4().hex
        self._redis = redis.from_url(settings.redis_url, decode_responses=True)
        self._relay_tasks: dict[str, asyncio.Task] = {}

    def _channel(self, room_id: str) -> str:
        return f"ws:{self._channel_prefix}:{room_id}"

    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        is_new_room = room_id not in self.rooms
        self.rooms.setdefault(room_id, set()).add(ws)
        if is_new_room:
            # Subscribing here (and awaiting it) rather than inside the
            # background task below matters: Redis doesn't queue messages
            # for a subscription that hasn't registered yet, so if a
            # broadcast() on another process happened to publish between
            # this task merely being *created* and it actually reaching
            # its subscribe() call, that frame would be silently dropped.
            # Awaiting the subscribe before connect() returns closes that
            # window — by the time a caller can possibly trigger a
            # broadcast, this room is already listening.
            pubsub = self._redis.pubsub()
            try:
                await pubsub.subscribe(self._channel(room_id))
            except redis.RedisError:
                # Same-process delivery in broadcast() still works without
                # this — only cross-process relay is lost while Redis is down.
                logger.warning("Could not subscribe to relay channel for room %s", room_id)
                return
            self._relay_tasks[room_id] = asyncio.create_task(self._relay(room_id, pubsub))

    def disconnect(self, room_id: str, ws: WebSocket):
        room = self.rooms.get(room_id)
        if room is None:
            return
        room.discard(ws)
        # Without this, every journey/share ever tracked leaves a
        # permanently-empty entry behind — an unbounded leak over the
        # life of the process, since nothing else ever revisits a room
        # once its last connection has left.
        if not room:
            del self.rooms[room_id]
            task = self._relay_tasks.pop(room_id, None)
            if task:
                task.cancel()

    async def broadcast(self, room_id: str, payload: dict):
        dead = []
        for ws in self.rooms.get(room_id, set()):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

        # Best-effort relay to any other process holding a connection for
        # this same room. If Redis is briefly unreachable, same-process
        # delivery above still covers the common case, so this failure is
        # logged rather than raised.
        try:
            await self._redis.publish(
                self._channel(room_id),
                json.dumps({"origin": self._instance_id, "payload": payload}),
            )
        except redis.RedisError:
            logger.warning("Cross-process broadcast relay failed for room %s", room_id)

    async def _relay(self, room_id: str, pubsub):
        """Forwards frames published by *other* processes to this
        process's local sockets for the room. Runs only while this
        process has at least one local connection in the room (started in
        connect(), cancelled in disconnect() once the room empties here).
        `pubsub` arrives already subscribed — see connect() for why."""
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    envelope = json.loads(message["data"])
                except json.JSONDecodeError:
                    continue
                if envelope.get("origin") == self._instance_id:
                    continue  # this process's own broadcast() already delivered it locally
                dead = []
                for ws in self.rooms.get(room_id, set()):
                    try:
                        await ws.send_text(json.dumps(envelope["payload"]))
                    except Exception:  # noqa: BLE001
                        dead.append(ws)
                for ws in dead:
                    self.disconnect(room_id, ws)
        except asyncio.CancelledError:
            pass
        except redis.RedisError:
            logger.warning("Redis relay subscription failed for room %s", room_id)
        finally:
            try:
                await pubsub.unsubscribe(self._channel(room_id))
                await pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass


manager = ConnectionManager(channel_prefix="journey")


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
