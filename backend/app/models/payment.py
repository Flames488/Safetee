from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import BillingInterval, PaymentStatus, PlanTier


class Payment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "payments"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    tier: Mapped[PlanTier] = mapped_column(Enum(PlanTier, name="plan_tier"))
    billing_interval: Mapped[BillingInterval] = mapped_column(Enum(BillingInterval, name="billing_interval"))
    extra_seats: Mapped[int] = mapped_column(Integer, default=0)

    # Kobo, not naira — Paystack's API is kobo-denominated (1 naira = 100
    # kobo) and every amount it sends back is in kobo too. Storing the same
    # unit Paystack uses avoids a conversion bug at the one place (the
    # webhook) where getting it wrong would silently under- or over-credit
    # a real payment.
    amount_kobo: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="NGN")

    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.pending)

    # Reference WE generate and hand to Paystack when initializing the
    # transaction — this is what ties the later webhook back to this row.
    paystack_reference: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    # Paystack's own transaction id, only known once they confirm it.
    paystack_transaction_id: Mapped[str | None] = mapped_column(String(80), nullable=True)

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    user = relationship("User", back_populates="payments")
