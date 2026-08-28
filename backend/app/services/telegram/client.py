import httpx

from app.core.config import settings

_BASE_URL = "https://api.telegram.org"


async def send_message(chat_id: str, text: str) -> None:
    """Fire-and-forget notification/reply. Silently no-ops when the bot
    isn't configured (blank token) — same fail-open pattern as the other
    optional integrations in this app (Turnstile, web push) — and swallows
    delivery failures rather than raising, since a Telegram outage should
    never break the signup/payment flow that triggered the notification.
    Markdown-lite formatting (`*bold*`) via parse_mode, so callers can
    write readable messages without hand-escaping HTML entities."""
    if not settings.telegram_bot_token:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{_BASE_URL}/bot{settings.telegram_bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            )
    except httpx.HTTPError:
        pass


async def notify_admin(text: str) -> None:
    """Sends only to the configured admin chat — the one place this app
    pushes proactive notifications (new signup, payment) rather than
    replying to an inbound message."""
    if not settings.telegram_admin_chat_id:
        return
    await send_message(settings.telegram_admin_chat_id, text)
