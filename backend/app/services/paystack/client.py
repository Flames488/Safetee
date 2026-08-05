import hashlib
import hmac

import httpx

from app.core.config import settings

PAYSTACK_BASE_URL = "https://api.paystack.co"


class PaystackError(Exception):
    pass


class PaystackClient:
    """Thin wrapper over the Paystack REST API. Raises PaystackError on any
    non-2xx response, a non-JSON response body, or a body where `status` is
    false — Paystack's API returns HTTP 200 for some validation failures,
    so checking `status` in the body matters as much as checking the HTTP
    status code, and a hard outage or bad key can return a non-JSON body
    (plain text/HTML) that must never crash the caller with a raw
    JSONDecodeError instead of a catchable PaystackError."""

    def _headers(self) -> dict:
        if not settings.paystack_secret_key:
            raise PaystackError("Paystack is not configured (missing secret key)")
        return {"Authorization": f"Bearer {settings.paystack_secret_key}"}

    @staticmethod
    def _parse(response: httpx.Response) -> dict:
        try:
            body = response.json()
        except ValueError as err:
            raise PaystackError(f"Paystack returned a non-JSON response (HTTP {response.status_code})") from err
        if response.status_code >= 400 or not body.get("status"):
            raise PaystackError(body.get("message", f"Paystack request failed (HTTP {response.status_code})"))
        return body["data"]

    async def initialize_transaction(self, email: str, amount_kobo: int, reference: str, callback_url: str) -> dict:
        """Returns Paystack's `data` object, which includes `authorization_url`
        (where to send the user to pay) and `access_code`."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{PAYSTACK_BASE_URL}/transaction/initialize",
                headers=self._headers(),
                json={
                    "email": email,
                    "amount": amount_kobo,
                    "reference": reference,
                    "callback_url": callback_url,
                },
            )
        return self._parse(response)

    async def verify_transaction(self, reference: str) -> dict:
        """Returns Paystack's `data` object for this transaction — this is
        the ONLY source of truth for whether a payment actually succeeded.
        Never trust a frontend-supplied "payment succeeded" flag; always
        call this (or rely on the webhook, which does the same call
        server-side) before activating anything."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{PAYSTACK_BASE_URL}/transaction/verify/{reference}",
                headers=self._headers(),
            )
        return self._parse(response)

    @staticmethod
    def verify_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
        """Paystack signs every webhook with HMAC-SHA512 of the raw request
        body, keyed with your secret key, sent as the `x-paystack-signature`
        header. If this doesn't match, the request did not come from
        Paystack and must be discarded — this is the only thing standing
        between your billing system and anyone who finds the webhook URL."""
        if not signature or not settings.paystack_secret_key:
            return False
        expected = hmac.new(
            settings.paystack_secret_key.encode("utf-8"), raw_body, hashlib.sha512
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
