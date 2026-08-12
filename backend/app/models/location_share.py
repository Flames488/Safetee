from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import LocationShareStatus


class LocationShare(Base, UUIDMixin, TimestampMixin):
    """A live, time-boxed location stream between two real accounts — the
    'request/share at will' feature. Deliberately not a Journey (no
    destination/check-in grace) and not an SOS (not an emergency): both
    sides are just regular trusted-contact-who's-also-a-user pairs. Never
    stores actual coordinates — only the real-time websocket
    (app/websockets/location_sharing.py) ever sees a lat/lng, and nothing
    about this table records where anyone actually was. That's a
    deliberate privacy choice: an ad-hoc "check where I am right now"
    share shouldn't leave a permanent location trail the way an active
    SOS's evidence intentionally does.
    """

    __tablename__ = "location_shares"

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    viewer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    status: Mapped[LocationShareStatus] = mapped_column(
        Enum(LocationShareStatus, name="location_share_status"), default=LocationShareStatus.pending
    )
    # True: the viewer asked the owner ("can I see your location?").
    # False: the owner started it unprompted ("share at will"). Same
    # underlying row/websocket either way — this only changes which
    # button/copy got the flow started, not what it does.
    initiated_by_viewer: Mapped[bool] = mapped_column(Boolean, default=True)

    duration_minutes: Mapped[int] = mapped_column(Integer)
    # Both null while pending (a request the owner hasn't accepted yet).
    # Set together the moment it goes active — accept, or a self-initiated
    # share, both do this at creation/acceptance time, never separately.
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
