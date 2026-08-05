from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import JourneyStatus


class Journey(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "journeys"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    destination_label: Mapped[str] = mapped_column(String(255))
    destination_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    destination_lng: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)

    expected_minutes: Mapped[int]
    grace_minutes: Mapped[int]
    expected_arrival_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    notify_contact_ids: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    status: Mapped[JourneyStatus] = mapped_column(
        Enum(JourneyStatus, name="journey_status"), default=JourneyStatus.active, index=True
    )

    user = relationship("User", back_populates="journeys")
    locations = relationship("LocationPing", back_populates="journey", cascade="all, delete-orphan")


class LocationPing(Base, UUIDMixin):
    """Append-only location trail for an active journey or SOS event."""

    __tablename__ = "location_pings"

    journey_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("journeys.id", ondelete="CASCADE"), nullable=True, index=True
    )
    sos_event_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("sos_events.id", ondelete="CASCADE"), nullable=True, index=True
    )
    lat: Mapped[float] = mapped_column(Numeric(9, 6))
    lng: Mapped[float] = mapped_column(Numeric(9, 6))
    accuracy_m: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    journey = relationship("Journey", back_populates="locations")
