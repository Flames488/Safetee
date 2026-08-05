import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin_viewer, require_super_admin, verify_master_password
from app.db.session import get_db
from app.models.enums import PaymentStatus, SubscriptionStatus
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.admin import AdminRoleUpdate, AdminStatsOut, AdminSuspendRequest, AdminUserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
async def get_stats(db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin_viewer)):
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

    return AdminStatsOut(
        total_users=total_users,
        signups_last_7_days=signups_last_7_days,
        active_trials=active_trials,
        active_subscriptions=active_subscriptions,
        cancelled_subscriptions=cancelled_subscriptions,
        revenue_this_month_kobo=revenue_this_month_kobo,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_viewer),
):
    limit = max(1, min(limit, 200))
    result = await db.execute(
        select(User, Subscription.status)
        .outerjoin(Subscription, Subscription.user_id == User.id)
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    out = []
    for user, sub_status in result.all():
        row = AdminUserOut.model_validate(user)
        row.subscription_status = sub_status
        out.append(row)
    return out


@router.post("/users/{user_id}/role", response_model=AdminUserOut)
async def update_user_role(
    user_id: uuid.UUID,
    payload: AdminRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't change your own admin role")

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    target.admin_role = payload.role
    await db.commit()
    await db.refresh(target)

    result = await db.execute(select(Subscription.status).where(Subscription.user_id == target.id))
    row = AdminUserOut.model_validate(target)
    row.subscription_status = result.scalar_one_or_none()
    return row


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def toggle_suspend(
    user_id: uuid.UUID,
    payload: AdminSuspendRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't suspend your own account")

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    target.is_active = not target.is_active
    await db.commit()
    await db.refresh(target)

    result = await db.execute(select(Subscription.status).where(Subscription.user_id == target.id))
    row = AdminUserOut.model_validate(target)
    row.subscription_status = result.scalar_one_or_none()
    return row
