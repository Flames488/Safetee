import json

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.telegram.tools import TOOL_FUNCTIONS, TOOL_SCHEMAS

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

_SYSTEM_PROMPT = (
    "You are the admin assistant for Safetee, a personal safety app: one-touch SOS, "
    "live location sharing, journey monitoring, and trusted contacts. Live at "
    "https://www.getsafetee.com — development started around July 27, 2026 (the "
    "repository's first commit; say 'around' rather than stating it as an exact "
    "founding date, since that's a proxy, not an official record). You answer "
    "the app owner's questions about the product, users, signups, and payments. "
    "For product facts like this, answer directly from what you know. For anything "
    "about actual users/signups/payments/activity, always call a tool — never "
    "guess or make up a number. Money is in Naira. Keep answers short and direct, "
    "like a text message reply, not a report. No markdown headers or bullet lists "
    "unless genuinely listing several items."
)

# Bounded, not unbounded — a real tool-calling loop needs a hard stop so a
# model stuck alternating tool calls (e.g. never settling on a final answer)
# can't turn one Telegram message into an unbounded number of DB queries.
_MAX_TOOL_ROUNDS = 4


class AgentError(Exception):
    pass


async def answer(db: AsyncSession, question: str, history: list[dict] | None = None) -> str:
    """`history` is the last few real user/assistant turns (see
    memory.py) — not the tool-call plumbing from earlier questions, just
    what was actually said, so a follow-up like "what about last week"
    resolves against the previous answer without every prior tool
    round-trip re-entering the prompt (and its token cost) on every
    single message."""
    if not settings.groq_api_key:
        raise AgentError("The AI isn't configured yet (missing GROQ_API_KEY).")

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *(history or []),
        {"role": "user", "content": question},
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        for _ in range(_MAX_TOOL_ROUNDS):
            response = await client.post(
                _GROQ_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json={
                    "model": settings.groq_model,
                    "messages": messages,
                    "tools": TOOL_SCHEMAS,
                },
            )
            if response.status_code >= 400:
                raise AgentError(f"Groq request failed (HTTP {response.status_code}): {response.text[:200]}")
            body = response.json()
            choice = body["choices"][0]
            message = choice["message"]
            tool_calls = message.get("tool_calls")

            if not tool_calls:
                return message.get("content") or "I don't have an answer for that."

            # The assistant's own tool-call message must be replayed back
            # verbatim before the tool results — Groq/OpenAI's chat format
            # requires that pairing to make sense of which result answers
            # which call.
            messages.append(message)
            for call in tool_calls:
                name = call["function"]["name"]
                try:
                    args = json.loads(call["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                fn = TOOL_FUNCTIONS.get(name)
                result = await fn(db, args) if fn else {"error": f"Unknown tool: {name}"}
                messages.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": json.dumps(result, default=str),
                })

    raise AgentError("Took too many steps to answer that — try asking something more specific.")
