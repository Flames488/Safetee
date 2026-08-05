from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import BillingInterval, PlanTier, SubscriptionStatus


class Subscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "subscriptions"

    # One-to-one: a user has exactly one subscription row, updated in place
    # as they trial / subscribe / upgrade / cancel. Payment history (the
    # append-only log of individual transactions) lives in `payments`.
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)

    tier: Mapped[PlanTier | None] = mapped_column(Enum(PlanTier, name="plan_tier"), nullable=True)
    billing_interval: Mapped[BillingInterval | None] = mapped_column(
        Enum(BillingInterval, name="billing_interval"), nullable=True
    )
    # Only meaningful for tier=organization — number of seats *beyond* the
    # tier's included baseline (see app/core/plans.py TIERS[...]["seats_included"]).
    # Always 0 for individual/family, which are flat-priced.
    extra_seats: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"), default=SubscriptionStatus.trialing
    )

    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)

    # Paystack identifiers — customer_code identifies the payer across
    # transactions; authorization_code is the reusable card token Paystack
    # returns after a successful charge, used to charge renewals without
    # the user re-entering card details each cycle.
    paystack_customer_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    paystack_authorization_code: Mapped[str | None] = mapped_column(String(80), nullable=True)

    user = relationship("User", back_populates="subscription")
