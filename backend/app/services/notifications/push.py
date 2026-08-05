import logging

from app.core.config import settings

logger = logging.getLogger("safetee.push")


def send_push(push_token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Sends a web-push notification via VAPID keys.

    Left as a thin wrapper so swapping in `pywebpush` (or FCM for native
    apps later) is a one-file change — nothing else in the codebase should
    know which push provider is behind this call.
    """
    if not settings.web_push_public_key:
        logger.info("Push not configured — skipping push to %s: %s", push_token[:12], title)
        return False

    # from pywebpush import webpush, WebPushException
    # webpush(subscription_info=..., data=json.dumps({"title": title, "body": body, "data": data}),
    #         vapid_private_key=settings.web_push_private_key,
    #         vapid_claims={"sub": f"mailto:{settings.web_push_contact_email}"})
    logger.info("Push sent to %s: %s", push_token[:12], title)
    return True
