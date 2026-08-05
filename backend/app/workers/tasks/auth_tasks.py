import logging

from app.core.config import settings
from app.services.sms.fallback import SMSDeliveryFailed, send_with_fallback
from app.workers.celery_app import celery_app

logger = logging.getLogger("safetee.auth")


@celery_app.task(bind=True, max_retries=2, default_retry_delay=5)
def send_password_reset_sms(self, phone: str, otp: str, ttl_minutes: int):
    """Dispatched from POST /auth/forgot-password instead of calling
    send_with_fallback inline. That endpoint is async and shares an event
    loop with every other request the server is handling — including SOS
    triggers. send_with_fallback is a synchronous, network-bound call
    (Twilio/Termii, each with real timeouts); running it inline blocked
    the whole process for that duration. Here, it runs in a worker
    process instead, so a slow SMS provider costs this task time, not
    the server's ability to respond to anyone else.
    """
    try:
        send_with_fallback(phone, f"Your Safetee password reset code is {otp}. It expires in {ttl_minutes} minutes.")
    except SMSDeliveryFailed:
        if settings.env == "development":
            # Dev-only visibility so the flow is testable without paying
            # for SMS credits — never reachable outside ENV=development.
            logger.warning("[DEV ONLY] Password reset code for %s: %s", phone, otp)
        else:
            logger.error("Password reset SMS failed for %s after both providers", phone)
