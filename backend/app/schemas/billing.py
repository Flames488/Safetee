import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BillingInterval, PaymentStatus, PlanTier, SubscriptionStatus


class PlanOut(BaseModel):
    id: str
    name: str
    tagline: str
    seats_included: int
    extra_seat_monthly_kobo: int | None
    extra_seat_annual_kobo: int | None
    monthly_kobo: int
    annual_kobo: int
    features: list[str]


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tier: PlanTier | None
    billing_interval: BillingInterval | None
    extra_seats: int
    status: SubscriptionStatus
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool


class CheckoutRequest(BaseModel):
    tier: PlanTier
    billing_interval: BillingInterval
    # Only meaningful for tier=organization; validated server-side against
    # the tier (see billing.py checkout) rather than trusted as-is, so a
    # client bug can't sneak extra seats onto a plan that doesn't sell them.
    extra_seats: int = Field(default=0, ge=0, le=500)


class CheckoutResponse(BaseModel):
    authorization_url: str
    reference: str


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tier: PlanTier
    billing_interval: BillingInterval
    extra_seats: int
    amount_kobo: int
    currency: str
    status: PaymentStatus
    paid_at: datetime | None
    created_at: datetime
