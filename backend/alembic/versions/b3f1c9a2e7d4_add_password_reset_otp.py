"""add password reset otp columns

Revision ID: b3f1c9a2e7d4
Revises: 95a6929f83a4
Create Date: 2026-08-01 18:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'b3f1c9a2e7d4'
down_revision = '95a6929f83a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('password_reset_otp_hash', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('password_reset_otp_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'password_reset_otp_expires_at')
    op.drop_column('users', 'password_reset_otp_hash')
