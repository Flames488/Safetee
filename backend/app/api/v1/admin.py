import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_admin_viewer, require_super_admin, verify_master_password
from app.db.session import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.enums import AccountStatus, AdminAction, PaymentStatus, SubscriptionStatus
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.admin import (
    AdminAuditLogOut,
    AdminOptionalReasonRequest,
    AdminReasonRequest,
    AdminRoleUpdate,
    AdminStatsOut,
    AdminTrialGrantRequest,
    AdminUserDetailOut,
    AdminUserOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


async def _get_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    return (await db.execute(select(Subscription).where(Subscription.user_id == user_id))).scalar_one_or_none()


async def _to_admin_user_out(db: AsyncSession, user: User) -> AdminUserOut:
    sub = await _get_subscription(db, user.id)
    row = AdminUserOut.model_validate(user)
    row.subscription_status = sub.status if sub else None
    row.trial_ends_at = sub.trial_ends_at if sub else None
    row.cancel_at_period_end = bool(sub and sub.cancel_at_period_end)
    return row


async def _log_admin_action(
    db: AsyncSession, admin: User, target_user_id: uuid.UUID, action: AdminAction, reason: str | None
) -> None:
    db.add(AdminAuditLog(admin_id=admin.id, target_user_id=target_user_id, action=action, reason=reason))


async def _get_target(db: AsyncSession, user_id: uuid.UUID, admin: User, action_label: str) -> User:
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can't {action_label} your own account")
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return target


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
    status_filter: AccountStatus | None = None,
    trial_expiring_within_days: int | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_viewer),
):
    limit = max(1, min(limit, 200))
    query = (
        select(User, Subscription.status, Subscription.trial_ends_at, Subscription.cancel_at_period_end)
        .outerjoin(Subscription, Subscription.user_id == User.id)
        .order_by(User.created_at.desc())
    )
    if status_filter is not None:
        query = query.where(User.account_status == status_filter)
    if trial_expiring_within_days is not None:
        cutoff = datetime.now(UTC) + timedelta(days=trial_expiring_within_days)
        query = query.where(
            Subscription.status == SubscriptionStatus.trialing,
            Subscription.trial_ends_at.is_not(None),
            Subscription.trial_ends_at <= cutoff,
        )
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    out = []
    for user, sub_status, trial_ends_at, cancel_at_period_end in result.all():
        row = AdminUserOut.model_validate(user)
        row.subscription_status = sub_status
        row.trial_ends_at = trial_ends_at
        row.cancel_at_period_end = bool(cancel_at_period_end)
        out.append(row)
    return out


@router.get("/users/{user_id}", response_model=AdminUserDetailOut)
async def get_user_detail(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_viewer),
):
    user = await db.get(User, user_id, options=[selectinload(User.login_events)])
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    sub = await _get_subscription(db, user.id)
    row = AdminUserDetailOut.model_validate(user)
    row.subscription_status = sub.status if sub else None
    row.trial_ends_at = sub.trial_ends_at if sub else None
    row.login_history = sorted(user.login_events, key=lambda e: e.created_at, reverse=True)[:20]
    return row


@router.post("/users/{user_id}/role", response_model=AdminUserOut)
async def update_user_role(
    user_id: uuid.UUID,
    payload: AdminRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    target = await _get_target(db, user_id, admin, "change the admin role of")

    target.admin_role = payload.role
    await _log_admin_action(db, admin, target.id, AdminAction.role_change, f"role -> {payload.role.value}")
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user(
    user_id: uuid.UUID,
    payload: AdminReasonRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    target = await _get_target(db, user_id, admin, "suspend")

    target.account_status = AccountStatus.suspended
    await _log_admin_action(db, admin, target.id, AdminAction.suspend, payload.reason)
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
async def ban_user(
    user_id: uuid.UUID,
    payload: AdminReasonRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    target = await _get_target(db, user_id, admin, "ban")

    target.account_status = AccountStatus.banned
    await _log_admin_action(db, admin, target.id, AdminAction.ban, payload.reason)
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/reinstate", response_model=AdminUserOut)
async def reinstate_user(
    user_id: uuid.UUID,
    payload: AdminOptionalReasonRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Clears suspended *or* banned back to active — see AccountStatus's
    docstring for why both resolve the same way here."""
    verify_master_password(payload.master_password)
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    target.account_status = AccountStatus.active
    await _log_admin_action(db, admin, target.id, AdminAction.reinstate, payload.reason)
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/force-logout", response_model=AdminUserOut)
async def force_logout_user(
    user_id: uuid.UUID,
    payload: AdminOptionalReasonRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Invalidates every token already issued to this account — see
    sessions_invalidated_at's docstring on the User model. Doesn't touch
    account_status at all; the account can still log back in immediately,
    it just has to actually log back in."""
    verify_master_password(payload.master_password)
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    target.sessions_invalidated_at = datetime.now(UTC)
    await _log_admin_action(db, admin, target.id, AdminAction.force_logout, payload.reason)
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/trial", response_model=AdminUserOut)
async def grant_trial(
    user_id: uuid.UUID,
    payload: AdminTrialGrantRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    now = datetime.now(UTC)
    sub = await _get_subscription(db, target.id)
    if sub is None:
        sub = Subscription(user_id=target.id)
        db.add(sub)

    # Extends from whichever is later — see AdminTrialGrantRequest.days'
    # docstring — so this is always "+N days from here," never a shortening.
    base = sub.trial_ends_at if sub.trial_ends_at and sub.trial_ends_at > now else now
    sub.trial_ends_at = base + timedelta(days=payload.days)
    sub.status = SubscriptionStatus.trialing

    await _log_admin_action(db, admin, target.id, AdminAction.grant_trial, f"+{payload.days}d")
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/delete", response_model=AdminUserOut)
async def soft_delete_user(
    user_id: uuid.UUID,
    payload: AdminReasonRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Admin-initiated — distinct from the user's own password-confirmed
    DELETE /users/me, which is an immediate hard delete. This blocks login
    right away but keeps the row (and everything cascaded from it) around
    for a grace period — see purge_soft_deleted_accounts — in case it
    needs reversing via POST .../restore."""
    verify_master_password(payload.master_password)
    target = await _get_target(db, user_id, admin, "delete")

    target.deleted_at = datetime.now(UTC)
    await _log_admin_action(db, admin, target.id, AdminAction.soft_delete, payload.reason)
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.post("/users/{user_id}/restore", response_model=AdminUserOut)
async def restore_user(
    user_id: uuid.UUID,
    payload: AdminOptionalReasonRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    verify_master_password(payload.master_password)
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.deleted_at is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account isn't deleted")

    target.deleted_at = None
    await _log_admin_action(db, admin, target.id, AdminAction.restore, payload.reason)
    await db.commit()
    await db.refresh(target)
    return await _to_admin_user_out(db, target)


@router.get("/audit-log", response_model=list[AdminAuditLogOut])
async def list_audit_log(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_viewer),
):
    limit = max(1, min(limit, 200))
    result = await db.execute(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit).offset(offset)
    )
    entries = result.scalars().all()
    if not entries:
        return []

    # Batch-fetch both admin and target names in one query each rather
    # than N+1 — a target may no longer exist (see AdminAuditLog's
    # docstring on target_user_id), which is exactly why this is a
    # separate lookup instead of a join/relationship.
    user_ids = {e.admin_id for e in entries if e.admin_id} | {e.target_user_id for e in entries}
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))).all())

    return [
        AdminAuditLogOut(
            id=e.id,
            created_at=e.created_at,
            admin_id=e.admin_id,
            admin_name=names.get(e.admin_id) if e.admin_id else None,
            target_user_id=e.target_user_id,
            target_user_name=names.get(e.target_user_id, "(deleted account)"),
            action=e.action,
            reason=e.reason,
        )
        for e in entries
    ]
