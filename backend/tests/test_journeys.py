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
