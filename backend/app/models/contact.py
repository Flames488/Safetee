from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base


class TrustedContact(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "trusted_contacts"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(120))
    relationship_label: Mapped[str | None] = mapped_column(String(60), nullable=True)
    phone: Mapped[str] = mapped_column(String(20))

    # lower = notified first; enforced unique-per-user in a migration constraint
    priority: Mapped[int] = mapped_column(Integer, default=100)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    user = relationship("User", back_populates="contacts")
