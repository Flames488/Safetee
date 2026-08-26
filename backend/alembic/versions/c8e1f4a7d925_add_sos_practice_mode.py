"""add SOS practice/rehearsal mode

Revision ID: c8e1f4a7d925
Revises: a3f7c9e2b418
Create Date: 2026-08-26 01:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'c8e1f4a7d925'
down_revision = 'a3f7c9e2b418'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'sos_events',
        sa.Column('is_practice', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'users',
        sa.Column('practice_armed_until', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'practice_armed_until')
    op.drop_column('sos_events', 'is_practice')
