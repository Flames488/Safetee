from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base


class BackupCode(Base, UUIDMixin, TimestampMixin):
    """Account-recovery codes for when a phone is lost *and* the password
    is forgotten — phone number is otherwise the only identifier and the
    only channel forgot-password can use, so losing the phone locks the
    account out permanently with no other path back in. Hashed the same
    way a password is (see hash_password); the plaintext is shown to the
    user exactly once, at generation time, never stored or logged.

    Generating a fresh batch (POST /users/me/backup-codes) deletes every
    row for this user first — old codes from before a regeneration must
    never keep working, standard practice for this kind of code."""

    __tablename__ = "backup_codes"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="backup_codes")
