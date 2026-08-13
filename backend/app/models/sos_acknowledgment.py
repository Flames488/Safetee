from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base


class SOSAcknowledgment(Base, UUIDMixin, TimestampMixin):
    """A trusted contact marking "I've seen this" on an SOS event —
    dismisses it from *their own* incoming-alerts view (Dashboard banner,
    Network page) only. Deliberately separate from SOSEvent.status: only
    the alerter can mark themselves resolved/cancelled, and one contact
    acknowledging an alert has no effect on what any other contact sees.
    """

    __tablename__ = "sos_acknowledgments"

    sos_event_id: Mapped[UUID] = mapped_column(ForeignKey("sos_events.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    __table_args__ = (UniqueConstraint("sos_event_id", "user_id", name="uq_sos_ack_event_user"),)
