"""add backup_codes for account recovery

Revision ID: f1b6a3d8e047
Revises: c8e1f4a7d925
Create Date: 2026-08-26 02:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'f1b6a3d8e047'
down_revision = 'c8e1f4a7d925'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'backup_codes',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_backup_codes_user_id'), 'backup_codes', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_backup_codes_user_id'), table_name='backup_codes')
    op.drop_table('backup_codes')
