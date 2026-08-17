from datetime import UTC, datetime

from app.db.session import AsyncSessionLocal
from app.models.enums import SOSStatus
from app.models.sos_event import SOSEvent


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


async def test_trigger_sos_creates_pending_event(auth_client):
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button", "lat": 6.5, "lng": 3.4})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    assert body["trigger"] == "button"
    assert body["alerts"] == []


async def test_gesture_trigger_has_no_cancel_window(auth_client):
    """Unlike button, a shake-gesture trigger has to fan out immediately —
    see trigger_sos's skip_cancel_window. cancel_window_ends_at landing at
    (approximately) "now" is what fanout_sos_alerts and the frontend both
    key off of to skip the countdown.

    Deliberately bounded against timestamps taken by *this test's own*
    clock, not against the response's `created_at` — that column comes
    from Postgres's own `NOW()`, a different clock than the Python
    process's `datetime.now(UTC)` that sets `cancel_window_ends_at`, and
    the two aren't guaranteed to agree to the microsecond even when the
    request genuinely completes first (confirmed flaky in practice, not
    just theoretical). `auth_client` talks to the app in-process over
    ASGITransport (see conftest.py), so `before`/`after` here and the
    server-side clock genuinely are the same clock — safe to bound against.
    """
    before = datetime.now(UTC)
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "gesture"})
    after = datetime.now(UTC)
    assert r.status_code == 201
    body = r.json()
    assert before <= _parse(body["cancel_window_ends_at"]) <= after


async def test_active_sos_reflects_pending_event(auth_client):
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    r = await auth_client.get("/api/v1/sos/active")
    assert r.status_code == 200
    assert r.json()["id"] == sos_id


async def test_cancel_inside_window_succeeds(auth_client):
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    r = await auth_client.post(f"/api/v1/sos/{sos_id}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"

    r = await auth_client.get("/api/v1/sos/active")
    assert r.json() is None


async def test_cancel_after_alerts_have_gone_out_is_rejected(auth_client):
    """Once fanout has moved an event past `pending`, silently cancelling is
    no longer allowed — the person must explicitly mark themselves safe
    instead, since contacts have already been notified."""
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    async with AsyncSessionLocal() as db:
        event = await db.get(SOSEvent, sos_id)
        event.status = SOSStatus.active
        await db.commit()

    r = await auth_client.post(f"/api/v1/sos/{sos_id}/cancel")
    assert r.status_code == 409


async def test_resolve_marks_safe_regardless_of_status(auth_client):
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    async with AsyncSessionLocal() as db:
        event = await db.get(SOSEvent, sos_id)
        event.status = SOSStatus.active
        await db.commit()

    r = await auth_client.post(f"/api/v1/sos/{sos_id}/resolve", json={"password": "supersecret123"})
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    r = await auth_client.get("/api/v1/sos/active")
    assert r.json() is None


async def test_resolve_with_wrong_password_is_rejected(auth_client):
    """Marking safe has to actually be the account holder — anyone who's
    simply holding the phone or watch during an active alert must not be
    able to silence it without the password."""
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    async with AsyncSessionLocal() as db:
        event = await db.get(SOSEvent, sos_id)
        event.status = SOSStatus.active
        await db.commit()

    r = await auth_client.post(f"/api/v1/sos/{sos_id}/resolve", json={"password": "wrong-password"})
    assert r.status_code == 403

    r = await auth_client.get("/api/v1/sos/active")
    assert r.json()["id"] == sos_id  # still active — the bad attempt didn't resolve it


async def test_sos_history_lists_past_events(auth_client):
    r1 = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    await auth_client.post(f"/api/v1/sos/{r1.json()['id']}/cancel")

    r2 = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "power_button"})
    await auth_client.post(f"/api/v1/sos/{r2.json()['id']}/resolve", json={"password": "supersecret123"})

    r = await auth_client.get("/api/v1/history/sos")
    assert r.status_code == 200
    events = r.json()
    assert len(events) == 2
    statuses = {e["status"] for e in events}
    assert statuses == {"cancelled", "resolved"}


async def test_sos_events_are_scoped_per_user(client):
    r = await client.post(
        "/api/v1/auth/signup", json={"full_name": "User A", "phone": "+2341111111111", "password": "supersecret123"}
    )
    token_a = r.json()["access_token"]
    await client.post(
        "/api/v1/sos/trigger", headers={"Authorization": f"Bearer {token_a}"}, json={"trigger": "button"}
    )

    r = await client.post(
        "/api/v1/auth/signup", json={"full_name": "User B", "phone": "+2342222222222", "password": "supersecret123"}
    )
    token_b = r.json()["access_token"]
    r = await client.get("/api/v1/sos/active", headers={"Authorization": f"Bearer {token_b}"})
    assert r.json() is None
