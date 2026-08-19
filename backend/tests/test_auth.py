from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.enums import AccountStatus
from app.models.user import User


async def test_signup_returns_tokens(client):
    r = await client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Chidi Okafor",
            "phone": "+2348100005521",
            "email": "chidi@example.com",
            "password": "supersecret123",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["token_type"] == "bearer"


async def test_signup_rejects_filled_honeypot(client):
    r = await client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Bot",
            "phone": "+2348100005521",
            "password": "supersecret123",
            "website": "http://spam.example",
        },
    )
    assert r.status_code == 400

    # must not have actually created the account
    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100005521", "password": "supersecret123"}
    )
    assert r.status_code == 401


async def test_signup_is_rate_limited_per_phone(client):
    payload = {"full_name": "Chidi", "phone": "+2348100005521", "password": "supersecret123"}
    for _ in range(5):
        r = await client.post("/api/v1/auth/signup", json=payload)
        assert r.status_code in (201, 409)  # first succeeds, rest 409 on the dedup check — neither is a 429 yet

    r = await client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 429


async def test_signup_rejects_duplicate_phone(client):
    payload = {"full_name": "Chidi", "phone": "+2348100005521", "password": "supersecret123"}
    r1 = await client.post("/api/v1/auth/signup", json=payload)
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/v1/auth/signup",
        json={**payload, "full_name": "Someone Else", "password": "anotherpassword123"},
    )
    assert r2.status_code == 409


async def test_login_with_correct_password(client):
    await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Chidi", "phone": "+2348100005521", "password": "supersecret123"},
    )
    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100005521", "password": "supersecret123"}
    )
    assert r.status_code == 200
    assert r.json()["access_token"]


async def test_login_with_wrong_password_is_rejected(client):
    await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Chidi", "phone": "+2348100005521", "password": "supersecret123"},
    )
    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100005521", "password": "wrong-password"}
    )
    assert r.status_code == 401


async def test_login_with_unregistered_phone_is_rejected(client):
    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348109999999", "password": "whatever12345"}
    )
    assert r.status_code == 401


async def test_login_with_correct_password_but_suspended_account_is_rejected(client):
    """A suspended account must fail clearly at login rather than getting a
    token pair that then 401s on every subsequent request via
    get_current_user's own account_status check."""
    await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Chidi", "phone": "+2348100005521", "password": "supersecret123"},
    )

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.phone == "+2348100005521"))).scalar_one()
        user.account_status = AccountStatus.suspended
        await db.commit()

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100005521", "password": "supersecret123"}
    )
    assert r.status_code == 403


async def test_long_password_hashes_and_verifies_correctly(client):
    """Regression test: passlib's bcrypt backend used to crash on this before
    the switch to calling bcrypt directly (see README `Bugs found and fixed`).
    A 200-char password with the sha256 pre-hash must still round-trip."""
    long_password = "x" * 200
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Long Pw", "phone": "+2348100001111", "password": long_password},
    )
    assert r.status_code == 201

    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348100001111", "password": long_password}
    )
    assert r.status_code == 200


async def test_refresh_token_issues_new_access_token(client):
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Chidi", "phone": "+2348100005521", "password": "supersecret123"},
    )
    refresh_token = r.json()["refresh_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    assert r.json()["access_token"]


async def test_protected_route_without_token_is_rejected(client):
    r = await client.get("/api/v1/contacts")
    assert r.status_code == 401


async def test_protected_route_with_garbage_token_is_rejected(client):
    r = await client.get(
        "/api/v1/contacts", headers={"Authorization": "Bearer not.a.real.token"}
    )
    assert r.status_code == 401
