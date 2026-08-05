async def test_system_status_reports_sms_not_configured_by_default(client):
    r = await client.get("/api/v1/system/status")
    assert r.status_code == 200
    body = r.json()
    assert body == {"sms_primary_configured": False, "sms_fallback_configured": False}
