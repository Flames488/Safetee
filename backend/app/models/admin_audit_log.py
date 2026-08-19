from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mixins import TimestampMixin, UUIDMixin
from app.db.session import Base
from app.models.enums import AdminAction


class AdminAuditLog(Base, UUIDMixin, TimestampMixin):
    """One row per mutating admin action against a user account — suspend,
    ban, reinstate, grant_trial, soft_delete, restore, force_logout,
    role_change. Append-only, never updated or deleted; created_at is the
    action's own timestamp. target_user_id has no FK constraint (not
    ondelete="CASCADE" to some other table, and deliberately not a foreign
    key at all) so the audit trail survives even after the target account
    is later hard-deleted (by the user themselves, or by
    purge_soft_deleted_accounts) — the whole point of an audit log is that
    it outlives the thing it's about.
    """

    __tablename__ = "admin_audit_logs"

    admin_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    target_user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), index=True)
    action: Mapped[AdminAction] = mapped_column(Enum(AdminAction, name="admin_action"), index=True)
    reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    admin = relationship("User", foreign_keys=[admin_id])
