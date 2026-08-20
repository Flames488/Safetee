import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AccountStatus, AdminAction, AdminRole, SubscriptionStatus


class AdminStatsOut(BaseModel):
    total_users: int
    signups_last_7_days: int
    active_trials: int
    active_subscriptions: int
    cancelled_subscriptions: int
    revenue_this_month_kobo: int


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str
    email: str | None
    account_status: AccountStatus
    admin_role: AdminRole
    created_at: datetime
    last_login_at: datetime | None = None
    last_active_at: datetime | None = None
    deleted_at: datetime | None = None
    subscription_status: SubscriptionStatus | None = None
    trial_ends_at: datetime | None = None
    cancel_at_period_end: bool = False


class LoginEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    ip_address: str | None
    user_agent: str | None


class AdminUserDetailOut(AdminUserOut):
    login_history: list[LoginEventOut] = []


class AdminAuditLogOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    admin_id: uuid.UUID | None
    admin_name: str | None
    target_user_id: uuid.UUID
    target_user_name: str | None
    action: AdminAction
    reason: str | None


class AdminRoleUpdate(BaseModel):
    role: AdminRole
    master_password: str


class AdminReasonRequest(BaseModel):
    """For actions where an admin has to say why — suspend, ban, soft
    delete. A blank/whitespace-only reason is rejected the same as a
    missing one; this is meant to actually be read later, not rubber-stamped."""
    master_password: str
    reason: str = Field(min_length=3, max_length=1000)


class AdminOptionalReasonRequest(BaseModel):
    """For actions where a reason is good practice but not load-bearing —
    reinstate, force-logout. Recorded in the audit log when given."""
    master_password: str
    reason: str | None = Field(default=None, max_length=1000)


class AdminTrialGrantRequest(BaseModel):
    master_password: str
    # Extends from whichever is later — "now" or the current trial_ends_at
    # — so granting +7 days to someone mid-trial adds to what's left
    # rather than potentially *shortening* it if their existing trial end
    # date was already further out than now + days.
    days: int = Field(gt=0, le=365)
