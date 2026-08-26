from unittest.mock import patch

from app.db.sync_session import SyncSessionLocal
from app.models.enums import JourneyStatus
from app.models.journey import Journey


async def test_start_journey_ignores_a_notify_contact_id_owned_by_another_user(client, auth_client):
    """notify_contact_ids comes straight from the client — without scoping
    the lookup to the caller's own contacts, a crafted UUID belonging to a
    different user's contact would get an unsolicited SMS with a live
    location-share link for a journey they have nothing to do with."""
    other_signup = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Other User", "phone": "+2348100005599", "password": "supersecret123"},
    )
    other_token = other_signup.json()["access_token"]
    other_contact = await client.post(
        "/api/v1/contacts",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"name": "Other's contact", "phone": "+2348100005588", "priority": 1},
    )
    other_contact_id = other_contact.json()["id"]

    with patch("app.api.v1.journeys.send_with_fallback") as mock_send:
        r = await auth_client.post(
            "/api/v1/journeys",
            json={
                "destination_label": "Somewhere",
                "expected_minutes": 15,
                "notify_contact_ids": [other_contact_id],
            },
        )
    assert r.status_code == 201
    mock_send.assert_not_called()


async def test_start_journey(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Ikeja City Mall", "expected_minutes": 30, "notify_contact_ids": []},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "active"
    assert body["destination_label"] == "Ikeja City Mall"


async def test_checkin_records_location(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 15, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]

    r = await auth_client.post(
        f"/api/v1/journeys/{journey_id}/checkin", json={"lat": 6.45, "lng": 3.4, "accuracy_m": 5.0}
    )
    assert r.status_code == 204


async def test_mark_arrived(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 15, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]

    r = await auth_client.post(f"/api/v1/journeys/{journey_id}/arrived")
    assert r.status_code == 200
    assert r.json()["status"] == "arrived"


async def test_cancel_journey(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 15, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]

    r = await auth_client.post(f"/api/v1/journeys/{journey_id}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


async def test_cannot_checkin_on_already_arrived_journey(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 15, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]
    await auth_client.post(f"/api/v1/journeys/{journey_id}/arrived")

    r = await auth_client.post(
        f"/api/v1/journeys/{journey_id}/checkin", json={"lat": 6.45, "lng": 3.4}
    )
    assert r.status_code == 409


async def test_journey_not_found_returns_404(auth_client):
    r = await auth_client.post("/api/v1/journeys/00000000-0000-0000-0000-000000000000/arrived")
    assert r.status_code == 404


async def test_mark_arrived_after_journey_already_escalated_is_rejected(auth_client):
    """Guards _claim_active_journey's atomic-claim UPDATE. The old
    read-then-write (_get_active_journey's SELECT followed by a plain
    attribute assignment + commit) had no WHERE-status guard on its own
    write, so this would previously return 200 and silently overwrite an
    already-escalated journey back to 'arrived' — masking that the overdue
    sweep had already fired an SOS event for it."""
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 15, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]

    db = SyncSessionLocal()
    journey = db.get(Journey, journey_id)
    journey.status = JourneyStatus.escalated
    db.commit()
    db.close()

    r = await auth_client.post(f"/api/v1/journeys/{journey_id}/arrived")
    assert r.status_code == 409

    db = SyncSessionLocal()
    journey = db.get(Journey, journey_id)
    assert journey.status == JourneyStatus.escalated  # unchanged, not overwritten
    db.close()


async def test_journey_history_lists_past_journeys(auth_client):
    await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Trip 1", "expected_minutes": 15, "notify_contact_ids": []},
    )
    await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Trip 2", "expected_minutes": 20, "notify_contact_ids": []},
    )
    r = await auth_client.get("/api/v1/history/journeys")
    assert r.status_code == 200
    assert len(r.json()) == 2
