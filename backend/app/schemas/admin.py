import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import AdminRole, SubscriptionStatus


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
    is_active: bool
    admin_role: AdminRole
    created_at: datetime
    subscription_status: SubscriptionStatus | None = None


class AdminRoleUpdate(BaseModel):
    role: AdminRole
    master_password: str


class AdminSuspendRequest(BaseModel):
    master_password: str
