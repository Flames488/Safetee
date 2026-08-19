from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import AccountStatus, AdminRole
from app.services.storage.supabase_storage import supabase_storage


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))

    # hidden-trigger config — stored, never logged in plaintext responses
    fake_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # No hardware power-button press is reachable from a web API on any
    # platform (see shakeDetector.js's file comment) — this was replaced by
    # gesture_trigger_enabled and is no longer settable via the API or read
    # by anything (see TriggerUpdate/UserOut). Left mapped rather than
    # dropped via migration purely so existing rows keep inserting cleanly;
    # always False for every account now.
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

    # Storage path within the public `avatars` bucket, not a URL — see
    # avatar_url below. A profile picture isn't sensitive the way SOS
    # evidence is, so unlike evidence it's a public-read bucket: no signed
    # URL to mint (and re-mint on every expiry) just to render an avatar.
    avatar_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 'none' for every normal user. Never set directly from a request body —
    # only ever changed via POST /admin/users/{id}/role, which itself
    # requires an existing super_admin plus the separate master password.
    admin_role: Mapped[AdminRole] = mapped_column(Enum(AdminRole, name="admin_role"), default=AdminRole.none)

    # Replaces the old plain is_active boolean — see AccountStatus. Kept as
    # a single column (not is_active + is_banned) so there's exactly one
    # source of truth for "can this account currently authenticate."
    # get_current_user, login, and /auth/refresh all gate on this.
    account_status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus, name="account_status"), default=AccountStatus.active, index=True
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Admin-initiated soft delete (distinct from the user's own DELETE
    # /users/me, which is an immediate hard delete they explicitly
    # confirmed with their password). A blocked-login state like
    # suspended/banned, but additionally purged for good by
    # purge_soft_deleted_accounts after the grace period — see
    # app/workers/tasks/admin_tasks.py.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Every login/refresh issues a token stamped with the moment it was
    # created (see create_access_token/create_refresh_token's `iat`).
    # Setting this to "now" instantly invalidates every token already
    # issued — including ones a client still holds and could otherwise
    # keep refreshing forever — without needing a revocation-list table.
    sessions_invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Broader than last_login_at — touched on any authenticated request,
    # not just login (see get_current_user). Throttled to roughly once per
    # 15 minutes there rather than on every single request, which would
    # otherwise add a DB write to every authenticated call in the app.
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contacts = relationship("TrustedContact", back_populates="user", cascade="all, delete-orphan")
    journeys = relationship("Journey", back_populates="user", cascade="all, delete-orphan")
    sos_events = relationship("SOSEvent", back_populates="user", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    login_events = relationship("LoginEvent", back_populates="user", cascade="all, delete-orphan")

    @property
    def has_fake_pin(self) -> bool:
        """UserOut reads this instead of fake_pin_hash — the hash itself is
        never serialized into an API response."""
        return self.fake_pin_hash is not None

    @property
    def avatar_url(self) -> str | None:
        """Public bucket, so this is a plain string build — no network call,
        unlike evidence's signed URLs which have to be re-minted per
        request. None until a picture's actually been uploaded and
        confirmed (see POST /users/me/avatar/confirm)."""
        if self.avatar_path is None:
            return None
        return supabase_storage.public_url(settings.supabase_avatar_bucket, self.avatar_path)
