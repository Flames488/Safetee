from app.core.config import settings

SUPER_ADMIN_PHONE = "+2348199999999"


async def _make_super_admin_client(client, monkeypatch):
    monkeypatch.setattr(settings, "super_admin_phone", SUPER_ADMIN_PHONE)
    monkeypatch.setattr(settings, "admin_master_password", "test-master-pw")
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Admin User", "phone": SUPER_ADMIN_PHONE, "password": "supersecret123"},
    )
    token = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


async def test_non_admin_cannot_view_stats(auth_client):
    r = await auth_client.get("/api/v1/admin/stats")
    assert r.status_code == 403


async def test_non_admin_cannot_list_users(auth_client):
    r = await auth_client.get("/api/v1/admin/users")
    assert r.status_code == 403


async def test_super_admin_bootstrap_via_phone_grants_stats_access(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    r = await admin.get("/api/v1/admin/stats")
    assert r.status_code == 200
    assert "total_users" in r.json()


async def test_super_admin_can_list_users(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    r = await admin.get("/api/v1/admin/users")
    assert r.status_code == 200
    assert any(u["admin_role"] == "super_admin" for u in r.json())


async def test_role_change_requires_correct_master_password(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Regular User", "phone": "+2348100000001", "password": "supersecret123"},
    )
    users = (await admin.get("/api/v1/admin/users")).json()
    target = next(u for u in users if u["phone"] == "+2348100000001")

    bad = await admin.post(
        f"/api/v1/admin/users/{target['id']}/role",
        json={"role": "viewer", "master_password": "wrong-password"},
    )
    assert bad.status_code == 403

    good = await admin.post(
        f"/api/v1/admin/users/{target['id']}/role",
        json={"role": "viewer", "master_password": "test-master-pw"},
    )
    assert good.status_code == 200
    assert good.json()["admin_role"] == "viewer"


async def test_super_admin_cannot_change_own_role(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    me = (await admin.get("/api/v1/users/me")).json()
    r = await admin.post(
        f"/api/v1/admin/users/{me['id']}/role",
        json={"role": "none", "master_password": "test-master-pw"},
    )
    assert r.status_code == 400


async def test_super_admin_cannot_suspend_own_account(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    me = (await admin.get("/api/v1/users/me")).json()
    r = await admin.post(
        f"/api/v1/admin/users/{me['id']}/suspend",
        json={"master_password": "test-master-pw"},
    )
    assert r.status_code == 400


async def test_viewer_can_read_but_not_mutate(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_master_password", "test-master-pw")
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Viewer User", "phone": "+2348100000002", "password": "supersecret123"},
    )
    token = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"

    from app.db.sync_session import SyncSessionLocal
    from app.models.enums import AdminRole
    from app.models.user import User

    db = SyncSessionLocal()
    user = db.query(User).filter_by(phone="+2348100000002").first()
    user.admin_role = AdminRole.viewer
    db.commit()
    user_id = user.id
    db.close()

    r = await client.get("/api/v1/admin/stats")
    assert r.status_code == 200  # viewer can read

    r = await client.post(
        f"/api/v1/admin/users/{user_id}/suspend",
        json={"master_password": "test-master-pw"},
    )
    assert r.status_code == 403  # mutation requires super_admin, not just viewer
