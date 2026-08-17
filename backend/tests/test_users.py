from unittest.mock import patch


async def test_get_me_returns_current_user(auth_client):
    r = await auth_client.get("/api/v1/users/me")
    assert r.status_code == 200
    body = r.json()
    assert body["full_name"] == "Chidi Okafor"
    assert body["phone"] == "+2348100005521"
    assert body["email"] == "chidi@example.com"
    assert body["is_verified"] is False
    assert "password_hash" not in body


async def test_get_me_without_token_is_rejected(client):
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401


async def test_get_me_with_garbage_token_is_rejected(client):
    r = await client.get(
        "/api/v1/users/me", headers={"Authorization": "Bearer not.a.real.token"}
    )
    assert r.status_code == 401


async def test_export_requires_auth(client):
    r = await client.get("/api/v1/users/me/export")
    assert r.status_code == 401


async def test_export_returns_profile_and_related_data(auth_client):
    await auth_client.post(
        "/api/v1/contacts",
        json={"name": "Amaka", "phone": "+2348100009001", "priority": 1},
    )

    r = await auth_client.get("/api/v1/users/me/export")
    assert r.status_code == 200
    body = r.json()
    assert body["profile"]["phone"] == "+2348100005521"
    assert len(body["contacts"]) == 1
    assert body["contacts"][0]["name"] == "Amaka"
    assert body["journeys"] == []
    assert body["sos_events"] == []
    assert "exported_at" in body


async def test_avatar_upload_url_rejects_disallowed_extension(auth_client):
    r = await auth_client.post("/api/v1/users/me/avatar/upload-url", json={"file_extension": "gif"})
    assert r.status_code == 422


async def test_avatar_upload_and_confirm_sets_avatar_url(auth_client):
    with patch("app.api.v1.users.supabase_storage.create_signed_upload_url") as mock_upload:
        # Echo the given path back, like the real Supabase client does —
        # a hardcoded "path" here would test nothing about the endpoint
        # actually returning *its own* generated path.
        mock_upload.side_effect = lambda bucket, path: {"upload_url": "https://example.supabase.co/fake-signed-url", "path": path}
        r = await auth_client.post("/api/v1/users/me/avatar/upload-url", json={"file_extension": "jpg"})
    assert r.status_code == 200
    path = r.json()["path"]
    assert path.endswith(".jpg")

    r = await auth_client.post("/api/v1/users/me/avatar/confirm", json={"path": path})
    assert r.status_code == 200
    assert r.json()["avatar_url"] is not None
    assert path in r.json()["avatar_url"]

    r = await auth_client.get("/api/v1/users/me")
    assert r.json()["avatar_url"] is not None


async def test_avatar_confirm_rejects_path_belonging_to_someone_else(auth_client):
    r = await auth_client.post(
        "/api/v1/users/me/avatar/confirm", json={"path": "00000000-0000-0000-0000-000000000000/avatar-x.jpg"}
    )
    assert r.status_code == 400

    r = await auth_client.get("/api/v1/users/me")
    assert r.json()["avatar_url"] is None


async def test_delete_avatar_clears_it(auth_client):
    with patch("app.api.v1.users.supabase_storage.create_signed_upload_url") as mock_upload:
        # Echo the given path back, like the real Supabase client does —
        # a hardcoded "path" here would test nothing about the endpoint
        # actually returning *its own* generated path.
        mock_upload.side_effect = lambda bucket, path: {"upload_url": "https://example.supabase.co/fake-signed-url", "path": path}
        r = await auth_client.post("/api/v1/users/me/avatar/upload-url", json={"file_extension": "png"})
    path = r.json()["path"]
    await auth_client.post("/api/v1/users/me/avatar/confirm", json={"path": path})

    r = await auth_client.delete("/api/v1/users/me/avatar")
    assert r.status_code == 200
    assert r.json()["avatar_url"] is None

    r = await auth_client.get("/api/v1/users/me")
    assert r.json()["avatar_url"] is None


async def test_delete_account_requires_auth(client):
    r = await client.request("DELETE", "/api/v1/users/me", json={"password": "whatever"})
    assert r.status_code == 401


async def test_delete_account_rejects_wrong_password(auth_client):
    r = await auth_client.request(
        "DELETE", "/api/v1/users/me", json={"password": "totally-wrong-password"}
    )
    assert r.status_code == 403

    # account must still exist and be usable
    r = await auth_client.get("/api/v1/users/me")
    assert r.status_code == 200


async def test_delete_account_succeeds_with_correct_password_and_cascades(auth_client):
    await auth_client.post(
        "/api/v1/contacts",
        json={"name": "Tunde", "phone": "+2348100009002", "priority": 1},
    )

    r = await auth_client.request("DELETE", "/api/v1/users/me", json={"password": "supersecret123"})
    assert r.status_code == 204

    # the same access token must no longer resolve to a usable account
    r = await auth_client.get("/api/v1/users/me")
    assert r.status_code == 401

    # the phone number must be free again for signup
    r = await auth_client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Chidi Okafor", "phone": "+2348100005521", "password": "supersecret123"},
    )
    assert r.status_code == 201
