from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import AlertChannel, AlertStatus, SOSStatus, SOSTrigger


class SOSEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sos_events"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    journey_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("journeys.id", ondelete="SET NULL"), nullable=True
    )

    trigger: Mapped[SOSTrigger] = mapped_column(Enum(SOSTrigger, name="sos_trigger"))
    status: Mapped[SOSStatus] = mapped_column(
        Enum(SOSStatus, name="sos_status"), default=SOSStatus.pending, index=True
    )

    origin_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    origin_lng: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)

    # Evidence is captured as a stream of independently-uploaded chunks
    # (each chunk survives even if the device is destroyed mid-recording),
    # so each of these is an ordered list of Supabase object paths, not a
    # single URL — a single overwritable column would silently keep only
    # the last ~20 seconds of a recording. Never a public URL: the bucket
    # is private, paths are resolved to short-lived signed URLs on read.
    audio_segment_paths: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    video_segment_paths: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    photo_paths: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # Set on the first successful evidence confirm for this event, so the
    # contact-notify task fires exactly once per event rather than once
    # per chunk (chunks land every 15-30s throughout an active SOS).
    evidence_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cancel_window_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sos_events")
    alerts = relationship("SOSAlertDelivery", back_populates="event", cascade="all, delete-orphan")


class SOSAlertDelivery(Base, UUIDMixin, TimestampMixin):
    """One row per (contact, channel) attempt — this is what the
    'Location sent / Contact notified' checklist on the SOS screen reads from,
    and what the fallback worker retries against."""

    __tablename__ = "sos_alert_deliveries"

    sos_event_id: Mapped[UUID] = mapped_column(
        ForeignKey("sos_events.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[UUID] = mapped_column(ForeignKey("trusted_contacts.id"))

    channel: Mapped[AlertChannel] = mapped_column(Enum(AlertChannel, name="alert_channel"))
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus, name="alert_status"), default=AlertStatus.queued
    )
    attempt_count: Mapped[int] = mapped_column(default=0)
    provider_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    event = relationship("SOSEvent", back_populates="alerts")
