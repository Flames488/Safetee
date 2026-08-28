"""One-off: tells Telegram where to send bot updates. Run this once after
TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are set in the environment
(and again any time either changes) — Telegram doesn't know the webhook
URL on its own, and won't send anything until this has run at least once.

Usage (from the backend container/venv, with the real env loaded):
    python scripts/register_telegram_webhook.py [domain]

`domain` defaults to api.getsafetee.com — the actual deployed API domain,
not whatever URL was in the original env var list, which pointed at the
marketing domain rather than the API.
"""

import asyncio
import sys

import httpx

from app.core.config import settings


async def main() -> None:
    domain = sys.argv[1] if len(sys.argv) > 1 else "api.getsafetee.com"
    if not settings.telegram_bot_token:
        print("TELEGRAM_BOT_TOKEN is not set — nothing to register.")
        return
    if not settings.telegram_webhook_secret:
        print("TELEGRAM_WEBHOOK_SECRET is not set — refusing to register an unsecured webhook.")
        return

    webhook_url = f"https://{domain}{settings.api_v1_prefix}/telegram/webhook"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/setWebhook",
            json={"url": webhook_url, "secret_token": settings.telegram_webhook_secret},
        )
    print(response.status_code, response.json())


if __name__ == "__main__":
    asyncio.run(main())
