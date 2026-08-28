from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import PaymentStatus
from app.models.payment import Payment
from app.models.user import User
from app.services.admin_stats import compute_admin_stats

# Each tool returns plain JSON-safe dicts/lists (never a User/Payment ORM
# instance directly) — this is what gets serialized straight into the
# model's tool-result message, so anything not JSON-safe (datetimes,
# enums, UUIDs) is stringified here rather than leaking a serialization
# error into the conversation.


def _user_summary(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.full_name,
        "phone": user.phone,
        "email": user.email,
        "account_status": user.account_status.value,
        "is_verified": user.is_verified,
        "signed_up_at": user.created_at.isoformat(),
        "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


async def get_stats(db: AsyncSession, _args: dict) -> dict:
    stats = await compute_admin_stats(db)
    stats["revenue_this_month_naira"] = stats["revenue_this_month_kobo"] / 100
    return stats


async def find_users(db: AsyncSession, args: dict) -> dict:
    """Searches name, phone, and email by substring (case-insensitive).
    Capped at 10 results — this answers "who is X", not "list everyone";
    get_stats already covers total counts."""
    query = (args.get("query") or "").strip()
    if not query:
        return {"error": "query is required"}
    like = f"%{query}%"
    rows = (
        await db.execute(
            select(User)
            .where((User.full_name.ilike(like)) | (User.phone.ilike(like)) | (User.email.ilike(like)))
            .order_by(User.created_at.desc())
            .limit(10)
        )
    ).scalars().all()
    return {"count": len(rows), "users": [_user_summary(u) for u in rows]}


async def list_recent_payments(db: AsyncSession, args: dict) -> dict:
    limit = min(int(args.get("limit") or 10), 25)
    rows = (
        await db.execute(
            select(Payment)
            .where(Payment.status == PaymentStatus.success)
            .options(selectinload(Payment.user))
            .order_by(Payment.paid_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return {
        "count": len(rows),
        "payments": [
            {
                "user_name": p.user.full_name if p.user else None,
                "user_phone": p.user.phone if p.user else None,
                "amount_naira": p.amount_kobo / 100,
                "currency": p.currency,
                "tier": p.tier.value,
                "billing_interval": p.billing_interval.value,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            }
            for p in rows
        ],
    }


# Groq/OpenAI-format tool definitions — the model picks which of these (if
# any) to call based on this schema, never based on a hardcoded intent
# list, so new questions the user phrases differently still resolve to the
# right tool as long as it fits one of these three shapes.
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_stats",
            "description": "Overall app stats: total users, signups in the last 7 days, active trials, active/cancelled subscriptions, and revenue this month.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_users",
            "description": "Look up specific user(s) by name, phone number, or email — e.g. to answer 'when was X last active' or 'is X a real user'.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Name, phone, or email to search for"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_recent_payments",
            "description": "Recent successful payments, most recent first — who paid, how much, and when.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "description": "Max results, default 10, max 25"}},
            },
        },
    },
]

TOOL_FUNCTIONS = {
    "get_stats": get_stats,
    "find_users": find_users,
    "list_recent_payments": list_recent_payments,
}
