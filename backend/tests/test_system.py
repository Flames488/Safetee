async def test_system_status_reports_sms_not_configured_by_default(client):
    r = await client.get("/api/v1/system/status")
    assert r.status_code == 200
    body = r.json()
    assert body["sms_primary_configured"] is False
    assert body["sms_fallback_configured"] is False
    # None outside Render (RENDER_GIT_COMMIT unset) — real value only present
    # in a real Render deploy, not something to hardcode here.
    assert "deploy_commit" in body
