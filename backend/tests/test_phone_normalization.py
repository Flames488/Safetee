from app.core.phone import normalize_phone


def test_strips_cosmetic_formatting():
    assert normalize_phone("+234 803 123 4567") == "+2348031234567"
    assert normalize_phone("+234-803-123-4567") == "+2348031234567"
    assert normalize_phone("(+234) 803 123 4567") == "+2348031234567"


def test_maps_local_nigerian_format_to_international():
    assert normalize_phone("08031234567") == "+2348031234567"
    assert normalize_phone("0803 123 4567") == "+2348031234567"


def test_already_normalized_is_unchanged():
    assert normalize_phone("+2348031234567") == "+2348031234567"


def test_empty_and_none():
    assert normalize_phone("") == ""
    assert normalize_phone(None) == ""


def test_does_not_truncate_a_different_country_code():
    """The historical bug this replaced matched on the last 10 digits —
    which would treat two genuinely different real numbers (different
    country codes) as the same. This must never happen."""
    ng = normalize_phone("+2348031234567")
    us = normalize_phone("+18031234567")
    assert ng != us


async def test_signup_dedups_across_formatting_differences(client):
    r1 = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "First", "phone": "0803 123 4567", "password": "supersecret123"},
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Second", "phone": "+234 803 123 4567", "password": "supersecret123"},
    )
    assert r2.status_code == 409


async def test_login_works_regardless_of_format_typed_at_signup(client):
    await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Chidi", "phone": "0803 123 4567", "password": "supersecret123"},
    )
    r = await client.post(
        "/api/v1/auth/login", json={"phone": "+2348031234567", "password": "supersecret123"}
    )
    assert r.status_code == 200


async def test_incoming_alert_matches_despite_contact_phone_formatting(client):
    """The actual bug report this fix targets: a real SOS alert wasn't
    showing up on the Alerts/Network page for a trusted contact whose
    account phone didn't exactly byte-match how their number was typed
    when added as a contact — even though the SMS itself still went out
    fine (delivery never required a match)."""
    owner_signup = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Owner", "phone": "+2348100005521", "password": "supersecret123"},
    )
    owner_token = owner_signup.json()["access_token"]

    contact_signup = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Contact", "phone": "0803 123 4567", "password": "supersecret123"},
    )
    contact_token = contact_signup.json()["access_token"]

    # Owner adds Contact's number in a different format than Contact
    # themselves signed up with.
    await client.post(
        "/api/v1/contacts",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Trusted", "phone": "+234 803 123 4567"},
    )

    await client.post(
        "/api/v1/sos/trigger",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"trigger": "button"},
    )

    r = await client.get("/api/v1/sos/incoming", headers={"Authorization": f"Bearer {contact_token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["alerter_name"] == "Owner"
