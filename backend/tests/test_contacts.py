async def test_create_and_list_contact(auth_client):
    r = await auth_client.post(
        "/api/v1/contacts",
        json={"name": "Amaka Obi", "relationship_label": "Sister", "phone": "+2348100001234", "priority": 1},
    )
    assert r.status_code == 201
    contact = r.json()
    assert contact["name"] == "Amaka Obi"
    assert contact["is_verified"] is False

    r = await auth_client.get("/api/v1/contacts")
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_contacts_ordered_by_priority(auth_client):
    await auth_client.post("/api/v1/contacts", json={"name": "Second", "phone": "+2340000000002", "priority": 2})
    await auth_client.post("/api/v1/contacts", json={"name": "First", "phone": "+2340000000001", "priority": 1})

    r = await auth_client.get("/api/v1/contacts")
    names = [c["name"] for c in r.json()]
    assert names == ["First", "Second"]


async def test_move_contact_swaps_order(auth_client):
    await auth_client.post("/api/v1/contacts", json={"name": "First", "phone": "+2340000000001"})
    second = (await auth_client.post("/api/v1/contacts", json={"name": "Second", "phone": "+2340000000002"})).json()
    third = (await auth_client.post("/api/v1/contacts", json={"name": "Third", "phone": "+2340000000003"})).json()

    # All three share the same default priority — moving "Second" up must
    # still produce a real, deterministic reorder rather than a no-op
    # swap of tied values (see move_contact's renumbering).
    r = await auth_client.post(f"/api/v1/contacts/{second['id']}/move", json={"direction": "up"})
    assert r.status_code == 200
    assert [c["name"] for c in r.json()] == ["Second", "First", "Third"]

    r = await auth_client.get("/api/v1/contacts")
    assert [c["name"] for c in r.json()] == ["Second", "First", "Third"]

    # Already at the top — moving further up is a no-op, not an error.
    r = await auth_client.post(f"/api/v1/contacts/{second['id']}/move", json={"direction": "up"})
    assert r.status_code == 200
    assert [c["name"] for c in r.json()] == ["Second", "First", "Third"]

    r = await auth_client.post(f"/api/v1/contacts/{third['id']}/move", json={"direction": "down"})
    assert r.status_code == 200
    assert [c["name"] for c in r.json()] == ["Second", "First", "Third"]


async def test_move_nonexistent_contact_returns_404(auth_client):
    r = await auth_client.post(
        "/api/v1/contacts/00000000-0000-0000-0000-000000000000/move", json={"direction": "up"}
    )
    assert r.status_code == 404


async def test_delete_contact(auth_client):
    r = await auth_client.post("/api/v1/contacts", json={"name": "Amaka Obi", "phone": "+2348100001234"})
    contact_id = r.json()["id"]

    r = await auth_client.delete(f"/api/v1/contacts/{contact_id}")
    assert r.status_code == 204

    r = await auth_client.get("/api/v1/contacts")
    assert r.json() == []


async def test_delete_nonexistent_contact_returns_404(auth_client):
    r = await auth_client.delete("/api/v1/contacts/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


async def test_delete_a_contact_who_was_alerted_by_a_real_sos_does_not_500(auth_client):
    # SOSAlertDelivery.contact_id previously had no ondelete (defaulting
    # to Postgres's NO ACTION), so deleting a contact who was ever alerted
    # raised an unhandled IntegrityError instead of a clean response.
    from unittest.mock import patch

    r = await auth_client.post("/api/v1/contacts", json={"name": "Amaka Obi", "phone": "+2348100001234"})
    contact_id = r.json()["id"]

    with patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send:
        mock_send.return_value = ("sms_twilio", "SM-fake-ref")
        r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
        sos_id = r.json()["id"]
        from app.workers.tasks.sos_tasks import fanout_sos_alerts
        fanout_sos_alerts.apply(args=[sos_id])

    r = await auth_client.delete(f"/api/v1/contacts/{contact_id}")
    assert r.status_code == 204


async def test_contacts_are_scoped_per_user(client):
    # user A creates a contact
    r = await client.post(
        "/api/v1/auth/signup", json={"full_name": "User A", "phone": "+2341111111111", "password": "supersecret123"}
    )
    token_a = r.json()["access_token"]
    await client.post(
        "/api/v1/contacts", headers={"Authorization": f"Bearer {token_a}"},
        json={"name": "A's contact", "phone": "+2340000000001"},
    )

    # user B should not see it
    r = await client.post(
        "/api/v1/auth/signup", json={"full_name": "User B", "phone": "+2342222222222", "password": "supersecret123"}
    )
    token_b = r.json()["access_token"]
    r = await client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {token_b}"})
    assert r.json() == []


async def test_last_active_at_only_shows_for_a_mutual_contact(client):
    # Merely saving a real user's number as your own contact is enough to
    # learn is_app_user/avatar_url (that's always been true), but
    # last_active_at is presence data — it must stay hidden until *they've*
    # also added you back, matching the same reciprocity
    # POST /locations/requests enforces server-side (is_trusted_contact_of).
    a = await client.post(
        "/api/v1/auth/signup", json={"full_name": "User A", "phone": "+2341111111111", "password": "supersecret123"}
    )
    token_a = a.json()["access_token"]
    b = await client.post(
        "/api/v1/auth/signup", json={"full_name": "User B", "phone": "+2342222222222", "password": "supersecret123"}
    )
    token_b = b.json()["access_token"]

    # A adds B as a contact — not mutual yet.
    await client.post(
        "/api/v1/contacts", headers={"Authorization": f"Bearer {token_a}"},
        json={"name": "User B", "phone": "+2342222222222"},
    )
    r = await client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {token_a}"})
    contact = r.json()[0]
    assert contact["is_app_user"] is True  # still visible — not the sensitive part
    assert contact["last_active_at"] is None  # not mutual yet — must stay hidden

    # B adds A back — now mutual.
    await client.post(
        "/api/v1/contacts", headers={"Authorization": f"Bearer {token_b}"},
        json={"name": "User A", "phone": "+2341111111111"},
    )
    r = await client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {token_a}"})
    assert r.json()[0]["last_active_at"] is not None
