import time

import redis

from app.core.config import settings

_redis = redis.from_url(settings.redis_url, decode_responses=True)


class CircuitBreaker:
    """A minimal circuit breaker shared across worker processes via Redis,
    so one Celery worker tripping the breaker protects every other worker
    from hammering a provider that's already down.

    States: closed (normal) -> open (failing, short-circuit calls)
            -> half_open (single trial call allowed) -> closed | open
    """

    def __init__(self, name: str, failure_threshold: int = 5, reset_after_s: int = 60):
        self.name = name
        self.key = f"cb:{name}"
        self.failure_threshold = failure_threshold
        self.reset_after_s = reset_after_s

    def _state(self) -> dict:
        raw = _redis.hgetall(self.key)
        return {
            "failures": int(raw.get("failures", 0)),
            "opened_at": float(raw.get("opened_at", 0)),
        }

    def allow_request(self) -> bool:
        state = self._state()
        if state["failures"] < self.failure_threshold:
            return True
        # circuit is open — check if the reset window has elapsed (half-open trial)
        if time.time() - state["opened_at"] >= self.reset_after_s:
            return True
        return False

    def record_success(self):
        _redis.delete(self.key)

    def record_failure(self):
        pipe = _redis.pipeline()
        pipe.hincrby(self.key, "failures", 1)
        state = self._state()
        if state["failures"] + 1 == self.failure_threshold:
            pipe.hset(self.key, "opened_at", time.time())
        pipe.expire(self.key, self.reset_after_s * 10)
        pipe.execute()
