from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PaymentStatus, SubscriptionStatus
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User


async def compute_admin_stats(db: AsyncSession) -> dict:
    """Shared by GET /admin/stats and the Telegram bot's get_stats tool —
    one query set, so the bot's answers can never drift from what the
    admin dashboard itself shows."""
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    signups_last_7_days = (
        await db.execute(select(func.count()).select_from(User).where(User.created_at >= week_ago))
    ).scalar_one()
    active_trials = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.trialing)
        )
    ).scalar_one()
    active_subscriptions = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.active)
        )
    ).scalar_one()
    cancelled_subscriptions = (
        await db.execute(
            select(func.count())
            .select_from(Subscription)
            .where(Subscription.status == SubscriptionStatus.active, Subscription.cancel_at_period_end.is_(True))
        )
    ).scalar_one()
    revenue_this_month_kobo = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount_kobo), 0)).where(
                Payment.status == PaymentStatus.success, Payment.paid_at >= month_start
            )
        )
    ).scalar_one()

    return {
        "total_users": total_users,
        "signups_last_7_days": signups_last_7_days,
        "active_trials": active_trials,
        "active_subscriptions": active_subscriptions,
        "cancelled_subscriptions": cancelled_subscriptions,
        "revenue_this_month_kobo": revenue_this_month_kobo,
    }
