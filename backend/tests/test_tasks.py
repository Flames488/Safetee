from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from app.db.sync_session import SyncSessionLocal
from app.models.device import Device
from app.models.enums import JourneyStatus
from app.models.journey import Journey
from app.models.sos_event import SOSAlertDelivery, SOSEvent
from app.models.user import User
from app.services.sms.fallback import SMSDeliveryFailed


async def test_fanout_sends_to_every_contact_in_priority_order(auth_client):
    await auth_client.post(
        "/api/v1/contacts", json={"name": "Second", "phone": "+2340000000002", "priority": 2}
    )
    await auth_client.post(
        "/api/v1/contacts", json={"name": "First", "phone": "+2340000000001", "priority": 1}
    )
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button", "lat": 6.5, "lng": 3.4})
    sos_id = r.json()["id"]

    with patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send:
        mock_send.return_value = ("sms_twilio", "SM-fake-ref")
        from app.workers.tasks.sos_tasks import fanout_sos_alerts
        result = fanout_sos_alerts.apply(args=[sos_id])

    assert result.state == "SUCCESS"
    assert mock_send.call_count == 2
    # location link must be in the message body
    for call in mock_send.call_args_list:
        assert "maps.google.com" in call.args[1]

    db = SyncSessionLocal()
    event = db.get(SOSEvent, sos_id)
    assert event.status.value == "active"
    deliveries = db.query(SOSAlertDelivery).filter_by(sos_event_id=sos_id).all()
    assert len(deliveries) == 2
    assert all(d.status.value == "sent" for d in deliveries)
    db.close()


async def test_fanout_marks_delivery_failed_when_sms_fails(auth_client):
    await auth_client.post("/api/v1/contacts", json={"name": "Contact", "phone": "+2340000000001"})
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    with patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send:
        mock_send.side_effect = SMSDeliveryFailed("twilio: down; termii: down")
        from app.workers.tasks.sos_tasks import fanout_sos_alerts
        result = fanout_sos_alerts.apply(args=[sos_id])

    assert result.state == "SUCCESS"  # the task itself doesn't crash on a provider failure
    db = SyncSessionLocal()
    deliveries = db.query(SOSAlertDelivery).filter_by(sos_event_id=sos_id).all()
    assert deliveries[0].status.value == "failed"
    assert deliveries[0].attempt_count == 1
    db.close()


async def test_fanout_prunes_device_on_expired_push_subscription(client, auth_client):
    """A contact who's also a registered Safetee user gets an in-app push
    in addition to SMS (see _matching_user_devices_by_phone). If their subscription
    is permanently gone (send_push returning "expired"), the stale Device
    row must be deleted — not retried forever on every future alert."""
    contact_signup = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Contact User", "phone": "+2340000000001", "password": "supersecret123"},
    )
    contact_token = contact_signup.json()["access_token"]
    await client.post(
        "/api/v1/devices",
        headers={"Authorization": f"Bearer {contact_token}"},
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/dead", "keys": {"p256dh": "x", "auth": "y"}},
    )

    await auth_client.post("/api/v1/contacts", json={"name": "Contact", "phone": "+2340000000001"})
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    with (
        patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send,
        patch("app.workers.tasks.sos_tasks.send_push") as mock_push,
    ):
        mock_send.return_value = ("sms_twilio", "SM-fake-ref")
        mock_push.return_value = "expired"
        from app.workers.tasks.sos_tasks import fanout_sos_alerts
        fanout_sos_alerts.apply(args=[sos_id])

    assert mock_push.called
    db = SyncSessionLocal()
    contact_user = db.query(User).filter_by(phone="+2340000000001").one()
    remaining = db.query(Device).filter_by(user_id=contact_user.id).all()
    assert remaining == []
    db.close()


async def test_fanout_matches_each_contacts_device_to_the_right_account(client, auth_client):
    """The device lookup is batched across all contacts in one pass (see
    _matching_user_devices_by_phone) rather than queried per contact — this
    guards against that batching cross-wiring devices between accounts,
    e.g. pushing contact A's alert to contact B's device."""
    contact_a = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Contact A", "phone": "+2340000000001", "password": "supersecret123"},
    )
    contact_b = await client.post(
        "/api/v1/auth/signup",
        json={"full_name": "Contact B", "phone": "+2340000000002", "password": "supersecret123"},
    )
    await client.post(
        "/api/v1/devices",
        headers={"Authorization": f"Bearer {contact_a.json()['access_token']}"},
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/a", "keys": {"p256dh": "x", "auth": "y"}},
    )
    await client.post(
        "/api/v1/devices",
        headers={"Authorization": f"Bearer {contact_b.json()['access_token']}"},
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/b", "keys": {"p256dh": "x", "auth": "y"}},
    )

    await auth_client.post("/api/v1/contacts", json={"name": "A", "phone": "+2340000000001", "priority": 1})
    await auth_client.post("/api/v1/contacts", json={"name": "B", "phone": "+2340000000002", "priority": 2})
    # A third contact with no Safetee account at all — must not blow up the
    # batched lookup and must not receive a push.
    await auth_client.post("/api/v1/contacts", json={"name": "C", "phone": "+2340000000003", "priority": 3})
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    with (
        patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send,
        patch("app.workers.tasks.sos_tasks.send_push") as mock_push,
    ):
        mock_send.return_value = ("sms_twilio", "SM-fake-ref")
        mock_push.return_value = "sent"
        from app.workers.tasks.sos_tasks import fanout_sos_alerts
        fanout_sos_alerts.apply(args=[sos_id])

    assert mock_push.call_count == 2
    pushed_tokens = {call.args[0] for call in mock_push.call_args_list}
    assert pushed_tokens == {
        "https://fcm.googleapis.com/fcm/send/a",
        "https://fcm.googleapis.com/fcm/send/b",
    }


async def test_retry_failed_alerts_recovers_a_failed_delivery(auth_client):
    await auth_client.post("/api/v1/contacts", json={"name": "Contact", "phone": "+2340000000001"})
    r = await auth_client.post("/api/v1/sos/trigger", json={"trigger": "button"})
    sos_id = r.json()["id"]

    from app.workers.tasks.sos_tasks import fanout_sos_alerts, retry_failed_alerts

    with patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send:
        mock_send.side_effect = SMSDeliveryFailed("both down")
        fanout_sos_alerts.apply(args=[sos_id])

    with patch("app.workers.tasks.sos_tasks.send_with_fallback") as mock_send:
        mock_send.return_value = ("sms_termii", "TERMII-REF")
        retry_failed_alerts.apply()

    db = SyncSessionLocal()
    delivery = db.query(SOSAlertDelivery).filter_by(sos_event_id=sos_id).first()
    assert delivery.status.value == "sent"
    assert delivery.channel.value == "sms_termii"
    assert delivery.attempt_count == 2
    db.close()


async def test_journey_sweep_escalates_a_genuinely_overdue_journey(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 30, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]

    # Realistic backdate: shift both created_at and expected_arrival_at
    # together, as if this journey genuinely started 45 minutes ago.
    db = SyncSessionLocal()
    journey = db.get(Journey, journey_id)
    now = datetime.now(UTC)
    journey.created_at = now - timedelta(minutes=45)
    journey.expected_arrival_at = now - timedelta(minutes=15)  # due 15 min ago; grace is 10 min
    db.commit()
    db.close()

    with patch("app.workers.tasks.journey_tasks.fanout_sos_alerts") as mock_fanout:
        from app.workers.tasks.journey_tasks import sweep_overdue_journeys
        sweep_overdue_journeys.apply()

    assert mock_fanout.apply.called

    db = SyncSessionLocal()
    journey = db.get(Journey, journey_id)
    assert journey.status == JourneyStatus.escalated
    events = db.query(SOSEvent).filter_by(journey_id=journey_id).all()
    assert len(events) == 1
    assert events[0].trigger.value == "journey_timeout"
    assert events[0].status.value == "active"  # no cancel window on auto-escalation
    db.close()


async def test_journey_sweep_leaves_on_time_journeys_alone(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Nearby", "expected_minutes": 30, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]

    with patch("app.workers.tasks.journey_tasks.fanout_sos_alerts") as mock_fanout:
        from app.workers.tasks.journey_tasks import sweep_overdue_journeys
        sweep_overdue_journeys.apply()

    assert not mock_fanout.apply.called
    db = SyncSessionLocal()
    journey = db.get(Journey, journey_id)
    assert journey.status == JourneyStatus.active
    db.close()


async def test_journey_sweep_does_not_double_escalate(auth_client):
    r = await auth_client.post(
        "/api/v1/journeys",
        json={"destination_label": "Somewhere", "expected_minutes": 30, "notify_contact_ids": []},
    )
    journey_id = r.json()["id"]
    db = SyncSessionLocal()
    journey = db.get(Journey, journey_id)
    now = datetime.now(UTC)
    journey.created_at = now - timedelta(minutes=45)
    journey.expected_arrival_at = now - timedelta(minutes=15)
    db.commit()
    db.close()

    from app.workers.tasks.journey_tasks import sweep_overdue_journeys
    with patch("app.workers.tasks.journey_tasks.fanout_sos_alerts") as mock_fanout:
        sweep_overdue_journeys.apply()
        assert mock_fanout.apply.call_count == 1
        sweep_overdue_journeys.apply()
        assert mock_fanout.apply.call_count == 1  # unchanged — already escalated
