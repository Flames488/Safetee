import httpx

from app.core.config import settings

TERMII_URL = "https://api.ng.termii.com/api/sms/send"


class TermiiClient:
    def send_sms(self, to: str, body: str) -> str:
        """Returns the provider message_id on success; raises on failure."""
        payload = {
            "to": to,
            "from": settings.termii_sender_id,
            "sms": body,
            "type": "plain",
            "channel": "generic",
            "api_key": settings.termii_api_key,
        }
        response = httpx.post(TERMII_URL, json=payload, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        if data.get("code") not in (None, "ok"):
            # Termii returns 200 with an error code embedded in the body sometimes
            raise RuntimeError(f"Termii rejected message: {data}")
        return str(data.get("message_id", ""))
