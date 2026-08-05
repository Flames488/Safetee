import logging

from app.services.circuitbreaker.breaker import CircuitBreaker
from app.services.sms.termii_client import TermiiClient
from app.services.sms.twilio_client import TwilioClient

logger = logging.getLogger("safetee.sms")

twilio_breaker = CircuitBreaker("twilio", failure_threshold=5, reset_after_s=60)
termii_breaker = CircuitBreaker("termii", failure_threshold=5, reset_after_s=60)

_twilio = TwilioClient()
_termii = TermiiClient()


class SMSDeliveryFailed(Exception):
    pass


def send_with_fallback(to: str, body: str) -> tuple[str, str]:
    """Try Twilio first, then Termii. Returns (channel_name, provider_ref).

    Both providers are checked against their own circuit breaker so a
    prolonged Twilio outage doesn't cost every SOS alert a multi-second
    timeout before falling back — after 5 consecutive failures the breaker
    trips and Termii is tried immediately for the next minute.
    """
    errors = []

    if twilio_breaker.allow_request():
        try:
            ref = _twilio.send_sms(to, body)
            twilio_breaker.record_success()
            return "sms_twilio", ref
        except Exception as exc:  # noqa: BLE001 — provider errors are opaque, must not crash fanout
            twilio_breaker.record_failure()
            errors.append(f"twilio: {exc}")
            logger.warning("Twilio SMS failed for %s: %s", to, exc)
    else:
        errors.append("twilio: circuit open")

    if termii_breaker.allow_request():
        try:
            ref = _termii.send_sms(to, body)
            termii_breaker.record_success()
            return "sms_termii", ref
        except Exception as exc:  # noqa: BLE001
            termii_breaker.record_failure()
            errors.append(f"termii: {exc}")
            logger.warning("Termii SMS failed for %s: %s", to, exc)
    else:
        errors.append("termii: circuit open")

    raise SMSDeliveryFailed("; ".join(errors))
