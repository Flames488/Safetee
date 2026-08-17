from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.device import Device
from app.models.user import User


async def test_register_and_unregister_device(auth_client):
    r = await auth_client.post(
        "/api/v1/devices",
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/abc123", "keys": {"p256dh": "x", "auth": "y"}},
    )
    assert r.status_code == 204

    r = await auth_client.delete(
        "/api/v1/devices?endpoint=https://fcm.googleapis.com/fcm/send/abc123"
    )
    assert r.status_code == 204


async def test_unregister_does_not_match_via_like_wildcard(auth_client):
    """endpoint is matched via a SQL LIKE substring — `_` and `%` are
    wildcards there. Without escaping them, unregistering the device whose
    endpoint contains `_` could also delete an unrelated device whose token
    merely differs by one character at that position (any char matches `_`).
    """
    await auth_client.post(
        "/api/v1/devices",
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/abc_123", "keys": {"p256dh": "x", "auth": "y"}},
    )
    # Same endpoint but with a literal 'X' where the real one has '_' —
    # a LIKE pattern with an unescaped '_' would treat these as matching.
    await auth_client.post(
        "/api/v1/devices",
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/abcX123", "keys": {"p256dh": "x", "auth": "y"}},
    )

    r = await auth_client.delete(
        "/api/v1/devices?endpoint=https://fcm.googleapis.com/fcm/send/abc_123"
    )
    assert r.status_code == 204

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.phone == "+2348100005521"))).scalar_one()
        remaining = (await db.execute(select(Device).where(Device.user_id == user.id))).scalars().all()

    assert len(remaining) == 1
    assert "abcX123" in remaining[0].push_token
