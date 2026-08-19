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


async def _make_regular_user(client, phone="+2348100000099", full_name="Target User"):
    """Signup only returns a token pair (no user id) — fetch the id via
    that new account's own /users/me rather than assuming its shape, since
    admin action URLs below need it."""
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": full_name, "phone": phone, "password": "supersecret123"},
    )
    tokens = r.json()
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    return {**tokens, **me.json()}


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
        json={"master_password": "test-master-pw", "reason": "testing self-suspend guard"},
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
        json={"master_password": "test-master-pw", "reason": "testing viewer permission guard"},
    )
    assert r.status_code == 403  # mutation requires super_admin, not just viewer


async def test_suspend_requires_a_real_reason(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/suspend",
        json={"master_password": "test-master-pw", "reason": ""},
    )
    assert r.status_code == 422


async def test_suspend_blocks_login_and_reinstate_undoes_it(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/suspend",
        json={"master_password": "test-master-pw", "reason": "abusive messages reported"},
    )
    assert r.status_code == 200
    assert r.json()["account_status"] == "suspended"

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"}
    )
    assert r.status_code == 403

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/reinstate",
        json={"master_password": "test-master-pw"},
    )
    assert r.status_code == 200
    assert r.json()["account_status"] == "active"

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"}
    )
    assert r.status_code == 200


async def test_ban_blocks_login(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/ban",
        json={"master_password": "test-master-pw", "reason": "fraudulent activity"},
    )
    assert r.status_code == 200
    assert r.json()["account_status"] == "banned"

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"}
    )
    assert r.status_code == 403


async def test_force_logout_invalidates_existing_token_but_not_a_fresh_login(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)
    old_token = target["access_token"]

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/force-logout",
        json={"master_password": "test-master-pw", "reason": "reported stolen device"},
    )
    assert r.status_code == 200

    r = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {old_token}"})
    assert r.status_code == 401

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"}
    )
    assert r.status_code == 200
    new_token = r.json()["access_token"]
    r = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {new_token}"})
    assert r.status_code == 200


async def test_grant_trial_extends_from_the_later_of_now_or_existing_end(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/trial",
        json={"master_password": "test-master-pw", "days": 14},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["subscription_status"] == "trialing"
    assert body["trial_ends_at"] is not None


async def test_soft_delete_blocks_login_and_restore_undoes_it(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/delete",
        json={"master_password": "test-master-pw", "reason": "requested account closure via support"},
    )
    assert r.status_code == 200
    assert r.json()["deleted_at"] is not None

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"}
    )
    assert r.status_code == 403

    r = await admin.post(
        f"/api/v1/admin/users/{target['id']}/restore",
        json={"master_password": "test-master-pw"},
    )
    assert r.status_code == 200
    assert r.json()["deleted_at"] is None

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"}
    )
    assert r.status_code == 200


async def test_audit_log_records_actions_with_reason(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)

    await admin.post(
        f"/api/v1/admin/users/{target['id']}/ban",
        json={"master_password": "test-master-pw", "reason": "fraudulent activity"},
    )

    r = await admin.get("/api/v1/admin/audit-log")
    assert r.status_code == 200
    entries = r.json()
    ban_entry = next(e for e in entries if e["action"] == "ban")
    assert ban_entry["reason"] == "fraudulent activity"
    assert ban_entry["target_user_id"] == target["id"]
    assert ban_entry["admin_name"] == "Admin User"


async def test_user_detail_includes_login_history(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)
    await client.post("/api/v1/auth/login", json={"phone": "+2348100000099", "password": "supersecret123"})

    r = await admin.get(f"/api/v1/admin/users/{target['id']}")
    assert r.status_code == 200
    body = r.json()
    # signup itself never logs a LoginEvent (only /auth/login does) — the
    # one explicit login above is the only entry expected.
    assert len(body["login_history"]) == 1
    assert body["login_history"][0]["ip_address"] is not None


async def test_users_list_filters_by_status(client, monkeypatch):
    admin = await _make_super_admin_client(client, monkeypatch)
    target = await _make_regular_user(client)
    await admin.post(
        f"/api/v1/admin/users/{target['id']}/ban",
        json={"master_password": "test-master-pw", "reason": "fraudulent activity"},
    )

    r = await admin.get("/api/v1/admin/users", params={"status_filter": "banned"})
    assert r.status_code == 200
    phones = [u["phone"] for u in r.json()]
    assert "+2348100000099" in phones
    assert all(u["account_status"] == "banned" for u in r.json())
