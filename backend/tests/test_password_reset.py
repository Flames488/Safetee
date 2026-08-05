from unittest.mock import patch


async def _signup(client, phone="+2348100007001"):
    r = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Reset Test", "phone": phone, "password": "originalpassword123"},
    )
    assert r.status_code == 201
    return phone


async def test_forgot_password_on_registered_phone_returns_204(client):
    phone = await _signup(client, "+2348100007002")
    r = await client.post("/api/v1/auth/forgot-password", json={"phone": phone})
    assert r.status_code == 204


async def test_forgot_password_on_unregistered_phone_still_returns_204(client):
    """Must respond identically whether or not the number is registered —
    a different status/shape here would let someone enumerate accounts."""
    r = await client.post("/api/v1/auth/forgot-password", json={"phone": "+2348109999888"})
    assert r.status_code == 204


async def test_forgot_password_is_rate_limited_per_phone(client):
    phone = await _signup(client, "+2348100007003")
    statuses = [
        (await client.post("/api/v1/auth/forgot-password", json={"phone": phone})).status_code
        for _ in range(5)
    ]
    assert statuses[:3] == [204, 204, 204]
    assert 429 in statuses[3:]


async def test_reset_password_with_correct_otp_succeeds_and_signs_in(client):
    phone = await _signup(client, "+2348100007004")

    with patch("app.api.v1.auth.secrets.randbelow", return_value=123456):
        r = await client.post("/api/v1/auth/forgot-password", json={"phone": phone})
        assert r.status_code == 204

    r = await client.post(
        "/api/v1/auth/reset-password",
        json={"phone": phone, "otp": "123456", "new_password": "brandnewpassword123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["refresh_token"]

    # old password must no longer work, new one must
    r = await client.post("/api/v1/auth/login", json={"phone": phone, "password": "originalpassword123"})
    assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"phone": phone, "password": "brandnewpassword123"})
    assert r.status_code == 200


async def test_reset_password_with_wrong_otp_is_rejected(client):
    phone = await _signup(client, "+2348100007005")
    with patch("app.api.v1.auth.secrets.randbelow", return_value=123456):
        await client.post("/api/v1/auth/forgot-password", json={"phone": phone})

    r = await client.post(
        "/api/v1/auth/reset-password",
        json={"phone": phone, "otp": "000000", "new_password": "someotherpassword123"},
    )
    assert r.status_code == 400


async def test_reset_password_otp_is_single_use(client):
    """A correct OTP must not be replayable — the second attempt with the
    same code, even though it was valid once, must fail."""
    phone = await _signup(client, "+2348100007006")
    with patch("app.api.v1.auth.secrets.randbelow", return_value=654321):
        await client.post("/api/v1/auth/forgot-password", json={"phone": phone})

    r1 = await client.post(
        "/api/v1/auth/reset-password",
        json={"phone": phone, "otp": "654321", "new_password": "firstnewpassword123"},
    )
    assert r1.status_code == 200

    r2 = await client.post(
        "/api/v1/auth/reset-password",
        json={"phone": phone, "otp": "654321", "new_password": "secondnewpassword123"},
    )
    assert r2.status_code == 400


async def test_reset_password_guess_attempts_are_rate_limited(client):
    phone = await _signup(client, "+2348100007007")
    with patch("app.api.v1.auth.secrets.randbelow", return_value=111111):
        await client.post("/api/v1/auth/forgot-password", json={"phone": phone})

    statuses = [
        (
            await client.post(
                "/api/v1/auth/reset-password",
                json={"phone": phone, "otp": "999999", "new_password": "irrelevantpass123"},
            )
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [400, 400, 400, 400, 400]
    assert statuses[5] == 429
