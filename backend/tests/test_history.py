from app.db.session import AsyncSessionLocal
from app.models.enums import SOSStatus
from app.models.sos_event import SOSEvent


async def test_clear_history_removes_finished_events_only(auth_client):
    # A cancelled (finished) SOS event — eligible.
    r1 = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    cancelled_id = r1.json()["id"]
    await auth_client.post(f"/api/v1/sos/{cancelled_id}/cancel")

    # An active SOS event — not eligible, must survive the clear.
    r2 = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    active_id = r2.json()["id"]
    async with AsyncSessionLocal() as db:
        event = await db.get(SOSEvent, active_id)
        event.status = SOSStatus.active
        await db.commit()

    # A cancelled journey — eligible.
    r3 = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 15, "notify_contact_ids": []},
    )
    journey_id = r3.json()["id"]
    await auth_client.post(f"/api/v1/journeys/{journey_id}/cancel")

    r = await auth_client.request(
        "DELETE", "/api/v1/history", json={"password": "supersecret123"}
    )
    assert r.status_code == 204

    sos_ids = {e["id"] for e in (await auth_client.get("/api/v1/history/sos")).json()}
    assert sos_ids == {active_id}

    journey_ids = {j["id"] for j in (await auth_client.get("/api/v1/history/journeys")).json()}
    assert journey_id not in journey_ids


async def test_clear_history_with_wrong_password_is_rejected(auth_client):
    r1 = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r1.json()["id"]
    await auth_client.post(f"/api/v1/sos/{sos_id}/cancel")

    r = await auth_client.request("DELETE", "/api/v1/history", json={"password": "wrong-password"})
    assert r.status_code == 403

    sos_ids = {e["id"] for e in (await auth_client.get("/api/v1/history/sos")).json()}
    assert sos_id in sos_ids  # untouched
