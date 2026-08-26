"""sos_alert_deliveries.contact_id: SET NULL instead of default NO ACTION

Revision ID: a3f7c9e2b418
Revises: d4c8a2e7f931
Create Date: 2026-08-26 00:00:00.000000

Deleting a trusted contact who was ever alerted (i.e. any contact after any
real/test SOS) raised an unhandled IntegrityError, since the original FK had
no ondelete and Postgres defaults to NO ACTION. A delivery row is the
historical record that an alert really was sent — SET NULL preserves that
record (same reasoning as AdminAuditLog.admin_id) instead of either blocking
the delete or CASCADE-deleting evidence of what happened during a real
emergency.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'a3f7c9e2b418'
down_revision = 'd4c8a2e7f931'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('sos_alert_deliveries', 'contact_id', nullable=True)
    op.drop_constraint('sos_alert_deliveries_contact_id_fkey', 'sos_alert_deliveries', type_='foreignkey')
    op.create_foreign_key(
        'sos_alert_deliveries_contact_id_fkey',
        'sos_alert_deliveries', 'trusted_contacts',
        ['contact_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('sos_alert_deliveries_contact_id_fkey', 'sos_alert_deliveries', type_='foreignkey')
    op.create_foreign_key(
        'sos_alert_deliveries_contact_id_fkey',
        'sos_alert_deliveries', 'trusted_contacts',
        ['contact_id'], ['id'],
    )
    op.alter_column('sos_alert_deliveries', 'contact_id', nullable=False)
