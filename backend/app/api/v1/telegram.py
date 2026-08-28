import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.services.telegram.agent import AgentError, answer
from app.services.telegram.client import send_message
from app.services.telegram.memory import append_turns, get_history

router = APIRouter(prefix="/telegram", tags=["telegram"])
logger = logging.getLogger("safetee.telegram")


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Telegram calls this directly — never the frontend. The secret token
    header (set via setWebhook's secret_token param, see
    scripts/register_telegram_webhook.py) is Telegram's own recommended
    way to prove a call actually came from them; the admin-chat-id check
    below is the real access control, since the bot can read real user and
    payment data. Always returns 200 — Telegram retries on anything else,
    and a transient Groq/DB hiccup shouldn't turn into a retry storm."""
    if request.headers.get("x-telegram-bot-api-secret-token") != settings.telegram_webhook_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid secret token")

    update = await request.json()
    message = update.get("message") or update.get("edited_message")
    if not message or "text" not in message:
        return {"ok": True}  # non-text update (photo, sticker, join event, ...) — nothing to do

    chat_id = str(message["chat"]["id"])
    text = message["text"].strip()

    if not settings.telegram_admin_chat_id or chat_id != settings.telegram_admin_chat_id:
        # Deliberately silent — replying "not authorized" to a stranger who
        # found the bot just confirms it's live and worth probing further.
        logger.warning("Telegram message from non-admin chat %s ignored", chat_id)
        return {"ok": True}

    if text in ("/start", "/help"):
        await send_message(chat_id, "Hi — ask me about users, signups, or payments. e.g. \"how many users do we have\" or \"who paid recently\".")
        return {"ok": True}

    history = await get_history(chat_id)
    try:
        reply = await answer(db, text, history)
    except AgentError as err:
        reply = f"Couldn't get that: {err}"
    except Exception:
        logger.exception("Telegram agent failed answering: %s", text)
        reply = "Something went wrong answering that — try again in a moment."
    else:
        # Only persisted on a real answer — an error reply isn't useful
        # context for the next question, and would just waste a turn of
        # the rolling window.
        await append_turns(chat_id, [
            {"role": "user", "content": text},
            {"role": "assistant", "content": reply},
        ])

    await send_message(chat_id, reply)
    return {"ok": True}
