import httpx
from fastapi import HTTPException, status

from app.core.config import settings

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None) -> None:
    """Rejects the request unless Cloudflare confirms `token` as a real,
    unexpired widget solve. Async httpx client — this runs directly in the
    request path (signup/login/forgot-password), so a blocking call here
    would stall every other in-flight request on this worker, same
    reasoning as enforce_rate_limit's async redis client.

    Fails open (skips verification) when no secret key is configured, or
    when Cloudflare itself is unreachable — matches this app's existing
    dev-mode pattern for optional third-party integrations and
    enforce_rate_limit's own fail-open trade-off for its backing service
    being down.
    """
    if not settings.turnstile_secret_key:
        return

    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification required. Please try again.")

    payload = {"secret": settings.turnstile_secret_key, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(_VERIFY_URL, data=payload)
        result = response.json()
    except (httpx.HTTPError, ValueError):
        # ValueError covers response.json() on a non-JSON body — an error/
        # rate-limit page from Cloudflare or something in front of it,
        # which httpx.HTTPError alone doesn't catch. Previously propagated
        # as an unhandled 500 on signup/login/forgot-password/recover
        # instead of the fail-open behavior this function promises.
        return

    if not result.get("success"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification failed. Please try again.")
