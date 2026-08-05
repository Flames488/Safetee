import redis
from fastapi import HTTPException, status

from app.core.config import settings

_redis = redis.from_url(settings.redis_url, decode_responses=True)


def enforce_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    """Fixed-window rate limit keyed by whatever the caller passes (usually
    a phone number plus an action name, e.g. "otp-request:+234...").
    Raises 429 once `max_attempts` is exceeded inside `window_seconds`.

    Deliberately fails open (lets the request through) if Redis itself is
    unreachable — a rate limiter that takes down the whole auth flow
    because Redis hiccupped is a worse outcome than a brief gap in
    enforcement. This trade-off is intentional, not an oversight.
    """
    try:
        count = _redis.incr(key)
        if count == 1:
            _redis.expire(key, window_seconds)
    except redis.RedisError:
        return

    if count > max_attempts:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many attempts. Please wait a while before trying again.",
        )
