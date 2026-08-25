async def test_system_status_reports_sms_not_configured_by_default(client):
    r = await client.get("/api/v1/system/status")
    assert r.status_code == 200
    body = r.json()
    assert body["sms_primary_configured"] is False
    assert body["sms_fallback_configured"] is False
    # None here (GIT_COMMIT unset outside the built Docker image) — a real
    # value is only baked in by deploy.yml's build-arg, not something to
    # hardcode in a test.
    assert "deploy_commit" in body
