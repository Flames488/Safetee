"""add location_shares

Revision ID: c4f8e1a936d7
Revises: 9b3d7f2e5a41
Create Date: 2026-08-12 00:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'c4f8e1a936d7'
down_revision = '9b3d7f2e5a41'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'location_shares',
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('viewer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.Enum('pending', 'active', 'declined', 'stopped', name='location_share_status'), nullable=False),
        sa.Column('initiated_by_viewer', sa.Boolean(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['viewer_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_location_shares_owner_id'), 'location_shares', ['owner_id'], unique=False)
    op.create_index(op.f('ix_location_shares_viewer_id'), 'location_shares', ['viewer_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_location_shares_viewer_id'), table_name='location_shares')
    op.drop_index(op.f('ix_location_shares_owner_id'), table_name='location_shares')
    op.drop_table('location_shares')
