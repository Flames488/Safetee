import logging
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.db.sync_session import SyncSessionLocal
from app.models.user import User
from app.workers.celery_app import celery_app

logger = logging.getLogger("safetee.admin")


@celery_app.task
def purge_soft_deleted_accounts():
    """Runs periodically (see app/main.py's lifespan). Admin-initiated soft
    delete (see POST /admin/users/{id}/delete) blocks login immediately but
    keeps the row around for settings.account_deletion_grace_days in case
    an admin restores it. Past that window, this hard-deletes it for
    real — cascading to contacts/journeys/sos_events/devices/subscription/
    payments/login_events the same way the user's own self-service
    DELETE /users/me does.
    """
    db = SyncSessionLocal()
    try:
        cutoff = datetime.now(UTC) - timedelta(days=settings.account_deletion_grace_days)
        overdue = (
            db.query(User)
            .filter(User.deleted_at.is_not(None), User.deleted_at < cutoff)
            .all()
        )
        for user in overdue:
            logger.info("Purging soft-deleted account %s (deleted_at=%s)", user.id, user.deleted_at)
            db.delete(user)
        db.commit()
    finally:
        db.close()
