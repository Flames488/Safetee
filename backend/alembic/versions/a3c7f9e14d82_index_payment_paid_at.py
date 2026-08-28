"""add index on payments.paid_at

Revision ID: a3c7f9e14d82
Revises: f1b6a3d8e047
Create Date: 2026-08-28 20:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'a3c7f9e14d82'
down_revision = 'f1b6a3d8e047'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Two existing queries both depend on this: GET /admin/stats' revenue
    # sum (WHERE paid_at >= month_start) and the Telegram bot's
    # list_recent_payments tool (ORDER BY paid_at DESC LIMIT n) — neither
    # had an index to work with, so both were a full sequential scan plus
    # sort over the entire payments table on every call, only unnoticed so
    # far because that table is still small.
    op.create_index('ix_payments_paid_at', 'payments', ['paid_at'])


def downgrade() -> None:
    op.drop_index('ix_payments_paid_at', table_name='payments')
