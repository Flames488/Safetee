import json
import logging

from pywebpush import WebPushException, webpush

from app.core.config import settings

logger = logging.getLogger("safetee.push")


def send_push(push_token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Sends a Web Push notification via VAPID. `push_token` is the
    serialized PushSubscription JSON the browser handed back from
    `pushManager.subscribe()` (see POST /devices) — Web Push has no single
    opaque token the way FCM does; the whole {endpoint, keys} object is the
    credential.
    """
    if not settings.web_push_public_key or not settings.web_push_private_key:
        logger.info("Push not configured — skipping push: %s", title)
        return False

    try:
        subscription_info = json.loads(push_token)
    except ValueError:
        logger.error("Stored push subscription is not valid JSON — dropping")
        return False

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({"title": title, "body": body, "data": data or {}}),
            vapid_private_key=settings.web_push_private_key,
            vapid_claims={"sub": f"mailto:{settings.web_push_contact_email}"},
        )
        return True
    except WebPushException as exc:
        # 404/410 means the subscription itself is gone (uninstalled,
        # expired, revoked by the browser) — routine, not an error. Every
        # other failure (network, malformed payload, bad VAPID claim) is
        # worth logging loudly since it likely affects every push, not
        # just this one subscription.
        status_code = getattr(exc.response, "status_code", None)
        if status_code in (404, 410):
            logger.info("Push subscription expired/gone (HTTP %s)", status_code)
        else:
            logger.error("Push send failed: %s", exc)
        return False
