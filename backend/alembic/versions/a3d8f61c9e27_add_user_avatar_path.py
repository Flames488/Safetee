"""add user avatar path

Revision ID: a3d8f61c9e27
Revises: e2a7c9f14b06
Create Date: 2026-08-18 00:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'a3d8f61c9e27'
down_revision = 'e2a7c9f14b06'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_path', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_path')
