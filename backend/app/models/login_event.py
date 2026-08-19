from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base


class LoginEvent(Base, UUIDMixin, TimestampMixin):
    """One row per successful login — created_at (from TimestampMixin) is
    the login timestamp itself. Append-only, never updated; see admin.py's
    login-history endpoint for how this is surfaced."""

    __tablename__ = "login_events"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Raw User-Agent string — good enough for "Chrome on iPhone"-style
    # display without pulling in a UA-parsing dependency for something
    # that's only ever shown to an admin, not branched on logically.
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user = relationship("User", back_populates="login_events")
