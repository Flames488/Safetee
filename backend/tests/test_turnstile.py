from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.turnstile import verify_turnstile


def _mock_client(json_result=None, side_effect=None):
    mock_client = AsyncMock()
    if side_effect is not None:
        mock_client.post.side_effect = side_effect
    else:
        response = MagicMock()
        response.json.return_value = json_result
        mock_client.post.return_value = response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    return mock_client


async def test_skips_verification_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "turnstile_secret_key", "")
    # No token, no HTTP call at all — just returns.
    await verify_turnstile("", "1.2.3.4")


async def test_rejects_missing_token_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    with pytest.raises(HTTPException) as exc:
        await verify_turnstile("", "1.2.3.4")
    assert exc.value.status_code == 400


async def test_accepts_valid_token(monkeypatch):
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    with patch("app.core.turnstile.httpx.AsyncClient", return_value=_mock_client({"success": True})):
        await verify_turnstile("good-token", "1.2.3.4")


async def test_rejects_invalid_token(monkeypatch):
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    mock_client = _mock_client({"success": False, "error-codes": ["invalid-input-response"]})
    with patch("app.core.turnstile.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(HTTPException) as exc:
            await verify_turnstile("bad-token", "1.2.3.4")
    assert exc.value.status_code == 400


async def test_fails_open_when_cloudflare_unreachable(monkeypatch):
    # A network hiccup calling Cloudflare shouldn't be indistinguishable
    # from a real bot failing the check, but it also shouldn't take down
    # signup/login entirely — same trade-off as enforce_rate_limit.
    monkeypatch.setattr(settings, "turnstile_secret_key", "test-secret")
    mock_client = _mock_client(side_effect=httpx.ConnectError("boom"))
    with patch("app.core.turnstile.httpx.AsyncClient", return_value=mock_client):
        await verify_turnstile("some-token", "1.2.3.4")
