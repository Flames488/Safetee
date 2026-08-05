"""add medical_info column

Revision ID: f4a8d2b6e153
Revises: e91a7c3d6f28
Create Date: 2026-08-03 10:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'f4a8d2b6e153'
down_revision = 'e91a7c3d6f28'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('medical_info', sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'medical_info')
