from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import AdminRole


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))

    # hidden-trigger config — stored, never logged in plaintext responses
    fake_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    power_button_trigger_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    gesture_trigger_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # What gets shared/captured during an actual emergency — default True
    # (matches the app's core safety promise) but genuinely user-controlled.
    # Enforced server-side at the point of use (trigger_sos, journey checkin,
    # evidence upload-url), not just hidden in the frontend — see the
    # comments there for why.
    share_location_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    evidence_audio_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    evidence_video_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    evidence_photo_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # forgot-password OTP — short-lived, hashed the same way a password is;
    # the plaintext code is never stored, only ever sent once by SMS
    password_reset_otp_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_reset_otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Free-text: allergies, conditions, medications, blood type — whatever
    # the user wants a first responder to know. Never included in SOS SMS
    # bodies (those go to trusted contacts, not medical staff) — surfaced
    # only via GET /users/me, for the user's own reference and for reading
    # aloud/showing to someone in person during an emergency.
    medical_info: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # 'none' for every normal user. Never set directly from a request body —
    # only ever changed via POST /admin/users/{id}/role, which itself
    # requires an existing super_admin plus the separate master password.
    admin_role: Mapped[AdminRole] = mapped_column(Enum(AdminRole, name="admin_role"), default=AdminRole.none)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    contacts = relationship("TrustedContact", back_populates="user", cascade="all, delete-orphan")
    journeys = relationship("Journey", back_populates="user", cascade="all, delete-orphan")
    sos_events = relationship("SOSEvent", back_populates="user", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")

    @property
    def has_fake_pin(self) -> bool:
        """UserOut reads this instead of fake_pin_hash — the hash itself is
        never serialized into an API response."""
        return self.fake_pin_hash is not None
