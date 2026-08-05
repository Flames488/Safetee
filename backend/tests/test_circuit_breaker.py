import time

from app.services.circuitbreaker.breaker import CircuitBreaker


def _fresh_breaker(name: str) -> CircuitBreaker:
    cb = CircuitBreaker(name, failure_threshold=3, reset_after_s=1)
    cb.record_success()  # clears any leftover state from a previous test run
    return cb


def test_circuit_allows_requests_below_threshold():
    cb = _fresh_breaker("test-below-threshold")
    cb.record_failure()
    cb.record_failure()
    assert cb.allow_request() is True


def test_circuit_opens_at_threshold():
    cb = _fresh_breaker("test-opens-at-threshold")
    cb.record_failure()
    cb.record_failure()
    cb.record_failure()
    assert cb.allow_request() is False


def test_circuit_half_opens_after_reset_window():
    cb = _fresh_breaker("test-half-open")
    for _ in range(3):
        cb.record_failure()
    assert cb.allow_request() is False
    time.sleep(1.2)
    assert cb.allow_request() is True


def test_circuit_closes_fully_on_success():
    cb = _fresh_breaker("test-closes-on-success")
    for _ in range(3):
        cb.record_failure()
    time.sleep(1.2)
    assert cb.allow_request() is True  # half-open trial
    cb.record_success()

    # should now tolerate failures below threshold again, from a clean slate
    cb.record_failure()
    cb.record_failure()
    assert cb.allow_request() is True
