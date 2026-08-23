from app.websockets.tracking import ConnectionManager


class FakeSocket:
    """Stands in for a WebSocket in these tests — ConnectionManager only
    ever calls .accept()/.send_text() on it, both trivially fakeable
    without spinning up a real connection."""

    def __init__(self, fail=False):
        self.fail = fail
        self.sent = []

    async def accept(self):
        pass

    async def send_text(self, data):
        if self.fail:
            raise RuntimeError("connection closed")
        self.sent.append(data)


async def test_disconnect_removes_the_room_entirely_once_empty():
    """Without this, every journey/share ever tracked leaves a permanently
    empty dict entry behind — an unbounded leak over the life of the
    process, since nothing else ever revisits a room once its last
    connection has left."""
    manager = ConnectionManager()
    ws = FakeSocket()
    await manager.connect("journey-1", ws)
    assert "journey-1" in manager.rooms

    manager.disconnect("journey-1", ws)
    assert "journey-1" not in manager.rooms


async def test_disconnect_on_unknown_room_is_a_safe_no_op():
    manager = ConnectionManager()
    manager.disconnect("never-connected", FakeSocket())  # must not raise


async def test_disconnect_keeps_the_room_while_other_connections_remain():
    manager = ConnectionManager()
    ws1, ws2 = FakeSocket(), FakeSocket()
    await manager.connect("journey-2", ws1)
    await manager.connect("journey-2", ws2)

    manager.disconnect("journey-2", ws1)
    assert "journey-2" in manager.rooms
    assert manager.rooms["journey-2"] == {ws2}


async def test_broadcast_prunes_a_dead_connection_and_its_now_empty_room():
    manager = ConnectionManager()
    dead = FakeSocket(fail=True)
    await manager.connect("journey-3", dead)

    await manager.broadcast("journey-3", {"lat": 1, "lng": 2})

    assert "journey-3" not in manager.rooms


async def test_broadcast_reaches_every_live_connection_in_the_room():
    manager = ConnectionManager()
    a, b = FakeSocket(), FakeSocket()
    await manager.connect("journey-4", a)
    await manager.connect("journey-4", b)

    await manager.broadcast("journey-4", {"lat": 1, "lng": 2})

    assert len(a.sent) == 1
    assert len(b.sent) == 1
