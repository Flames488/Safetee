import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

from app.core.config import settings


async def test_plans_are_public_and_unauthenticated(client):
    r = await client.get("/api/v1/billing/plans")
    assert r.status_code == 200
    tiers = {p["id"] for p in r.json()}
    assert tiers == {"individual", "family", "organization"}


async def test_new_user_gets_a_trialing_subscription_on_first_read(auth_client):
    r = await auth_client.get("/api/v1/billing/subscription")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "trialing"
    assert body["trial_ends_at"] is not None


async def test_checkout_requires_email(client):
    # auth_client's fixture user already has an email set — this needs a
    # user who genuinely doesn't, to exercise the "add an email" path.
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "No Email", "phone": "+2348100000098", "password": "supersecret123"},
    )
    client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    r = await client.post(
        "/api/v1/billing/checkout", json={"tier": "individual", "billing_interval": "monthly"}
    )
    assert r.status_code == 400


async def test_checkout_computes_correct_price_and_calls_paystack(auth_client):
    await auth_client.patch("/api/v1/users/me", json={"email": "payer@example.com"})

    with patch("app.api.v1.billing.paystack.initialize_transaction", new_callable=AsyncMock) as mock_init:
        mock_init.return_value = {"authorization_url": "https://paystack.test/pay/abc", "access_code": "abc"}
        r = await auth_client.post(
            "/api/v1/billing/checkout", json={"tier": "family", "billing_interval": "monthly"}
        )
    assert r.status_code == 200
    assert r.json()["authorization_url"] == "https://paystack.test/pay/abc"
    assert mock_init.call_args.kwargs["amount_kobo"] == 500_000  # family monthly, app/core/plans.py


async def test_checkout_ignores_extra_seats_for_non_organization_tier(auth_client):
    await auth_client.patch("/api/v1/users/me", json={"email": "payer2@example.com"})
    with patch("app.api.v1.billing.paystack.initialize_transaction", new_callable=AsyncMock) as mock_init:
        mock_init.return_value = {"authorization_url": "https://paystack.test/pay/xyz", "access_code": "xyz"}
        await auth_client.post(
            "/api/v1/billing/checkout",
            json={"tier": "individual", "billing_interval": "monthly", "extra_seats": 50},
        )
    assert mock_init.call_args.kwargs["amount_kobo"] == 150_000  # base price only — seats don't apply here


async def test_cancel_subscription_requires_an_active_one(auth_client):
    r = await auth_client.post("/api/v1/billing/cancel")
    assert r.status_code == 400  # a fresh account is trialing, not active


async def test_webhook_rejects_invalid_signature(client):
    r = await client.post(
        "/api/v1/billing/webhook",
        json={"event": "charge.success", "data": {"reference": "whatever"}},
        headers={"x-paystack-signature": "not-a-real-signature"},
    )
    assert r.status_code == 401


async def test_webhook_activates_subscription_on_valid_signature(client, monkeypatch):
    monkeypatch.setattr(settings, "paystack_secret_key", "test-secret-key")

    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Payer", "phone": "+2348100000099", "password": "supersecret123"},
    )
    token = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    await client.patch("/api/v1/users/me", json={"email": "payer3@example.com"})

    with patch("app.api.v1.billing.paystack.initialize_transaction", new_callable=AsyncMock) as mock_init:
        mock_init.return_value = {"authorization_url": "https://paystack.test/pay/ref1", "access_code": "x"}
        checkout_r = await client.post(
            "/api/v1/billing/checkout", json={"tier": "individual", "billing_interval": "monthly"}
        )
    reference = checkout_r.json()["reference"]
    del client.headers["Authorization"]  # Paystack calls the webhook directly, not as this user

    body = json.dumps({"event": "charge.success", "data": {"reference": reference}}).encode()
    signature = hmac.new(b"test-secret-key", body, hashlib.sha512).hexdigest()

    with patch("app.api.v1.billing.paystack.verify_transaction", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {"status": "success", "id": 12345, "customer": {}, "authorization": {}}
        r = await client.post(
            "/api/v1/billing/webhook",
            content=body,
            headers={"x-paystack-signature": signature, "content-type": "application/json"},
        )
    assert r.status_code == 200

    client.headers["Authorization"] = f"Bearer {token}"
    sub = (await client.get("/api/v1/billing/subscription")).json()
    assert sub["status"] == "active"
    assert sub["tier"] == "individual"


async def test_verify_endpoint_activates_subscription_without_waiting_on_webhook(auth_client):
    """The frontend calls this the instant Paystack redirects back — it
    must be able to activate a subscription on its own, since the webhook
    (a separate, asynchronous call from Paystack) isn't guaranteed to have
    landed yet."""
    await auth_client.patch("/api/v1/users/me", json={"email": "verify1@example.com"})

    with patch("app.api.v1.billing.paystack.initialize_transaction", new_callable=AsyncMock) as mock_init:
        mock_init.return_value = {"authorization_url": "https://paystack.test/pay/ref2", "access_code": "x"}
        checkout_r = await auth_client.post(
            "/api/v1/billing/checkout", json={"tier": "family", "billing_interval": "annual"}
        )
    reference = checkout_r.json()["reference"]

    with patch("app.api.v1.billing.paystack.verify_transaction", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {"status": "success", "id": 999, "customer": {}, "authorization": {}}
        r = await auth_client.post(f"/api/v1/billing/verify/{reference}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "active"
    assert body["tier"] == "family"
    assert body["billing_interval"] == "annual"


async def test_verify_endpoint_is_idempotent_alongside_the_webhook(auth_client):
    """Whichever of the webhook or this endpoint lands first activates the
    subscription; the other must no-op rather than re-verifying with
    Paystack a second time or double-processing the payment."""
    await auth_client.patch("/api/v1/users/me", json={"email": "verify2@example.com"})

    with patch("app.api.v1.billing.paystack.initialize_transaction", new_callable=AsyncMock) as mock_init:
        mock_init.return_value = {"authorization_url": "https://paystack.test/pay/ref3", "access_code": "x"}
        checkout_r = await auth_client.post(
            "/api/v1/billing/checkout", json={"tier": "individual", "billing_interval": "monthly"}
        )
    reference = checkout_r.json()["reference"]

    with patch("app.api.v1.billing.paystack.verify_transaction", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {"status": "success", "id": 1000, "customer": {}, "authorization": {}}
        first = await auth_client.post(f"/api/v1/billing/verify/{reference}")
        assert first.status_code == 200
        assert mock_verify.await_count == 1

        second = await auth_client.post(f"/api/v1/billing/verify/{reference}")
        assert second.status_code == 200
        # Already succeeded — must not call Paystack again.
        assert mock_verify.await_count == 1


async def test_verify_endpoint_rejects_a_reference_belonging_to_another_user(client):
    r1 = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Owner", "phone": "+2348100000097", "password": "supersecret123"},
    )
    owner_token = r1.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {owner_token}"
    await client.patch("/api/v1/users/me", json={"email": "owner@example.com"})
    with patch("app.api.v1.billing.paystack.initialize_transaction", new_callable=AsyncMock) as mock_init:
        mock_init.return_value = {"authorization_url": "https://paystack.test/pay/ref4", "access_code": "x"}
        checkout_r = await client.post(
            "/api/v1/billing/checkout", json={"tier": "individual", "billing_interval": "monthly"}
        )
    reference = checkout_r.json()["reference"]

    r2 = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Snooper", "phone": "+2348100000096", "password": "supersecret123"},
    )
    client.headers["Authorization"] = f"Bearer {r2.json()['access_token']}"

    r = await client.post(f"/api/v1/billing/verify/{reference}")
    assert r.status_code == 404
