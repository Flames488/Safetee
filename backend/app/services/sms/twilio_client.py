from twilio.rest import Client

from app.core.config import settings


class TwilioClient:
    """Lazily builds the underlying Twilio client on first use rather than at
    import time — importing this module (e.g. transitively, at API startup)
    must not crash just because TWILIO_ACCOUNT_SID isn't set yet in a given
    environment."""

    def __init__(self):
        self._client = None

    def _get_client(self) -> Client:
        if self._client is None:
            if not settings.twilio_account_sid or not settings.twilio_auth_token:
                raise RuntimeError("Twilio is not configured (missing account SID/auth token)")
            self._client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        return self._client

    def send_sms(self, to: str, body: str) -> str:
        """Returns the provider message SID on success; raises on failure."""
        message = self._get_client().messages.create(
            to=to, from_=settings.twilio_from_number, body=body
        )
        return message.sid
