import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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
        self.rooms.get(journey_id, set()).discard(ws)

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


@router.websocket("/ws/journeys/{journey_id}")
async def journey_tracking_socket(websocket: WebSocket, journey_id: str):
    """The journey owner's client pushes {lat, lng, accuracy_m} frames here;
    every other connection in the room (e.g. a trusted contact's browser
    viewing a shared tracking link) receives them in real time."""
    await manager.connect(journey_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await manager.broadcast(journey_id, payload)
    except WebSocketDisconnect:
        manager.disconnect(journey_id, websocket)
