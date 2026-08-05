from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base


class Device(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "devices"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    push_token: Mapped[str] = mapped_column(String(500))
    platform: Mapped[str] = mapped_column(String(20), default="web")  # web | ios | android

    user = relationship("User", back_populates="devices")
