"""add sos_acknowledgments

Revision ID: e2a7c9f14b06
Revises: c4f8e1a936d7
Create Date: 2026-08-13 00:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'e2a7c9f14b06'
down_revision = 'c4f8e1a936d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sos_acknowledgments',
        sa.Column('sos_event_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['sos_event_id'], ['sos_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sos_event_id', 'user_id', name='uq_sos_ack_event_user'),
    )
    op.create_index(op.f('ix_sos_acknowledgments_sos_event_id'), 'sos_acknowledgments', ['sos_event_id'], unique=False)
    op.create_index(op.f('ix_sos_acknowledgments_user_id'), 'sos_acknowledgments', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sos_acknowledgments_user_id'), table_name='sos_acknowledgments')
    op.drop_index(op.f('ix_sos_acknowledgments_sos_event_id'), table_name='sos_acknowledgments')
    op.drop_table('sos_acknowledgments')
