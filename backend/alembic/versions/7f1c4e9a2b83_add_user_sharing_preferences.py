"""add user sharing preferences

Revision ID: 7f1c4e9a2b83
Revises: 38803bdcead9
Create Date: 2026-08-11 00:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = '7f1c4e9a2b83'
down_revision = '38803bdcead9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('share_location_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('users', sa.Column('evidence_audio_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('users', sa.Column('evidence_video_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('users', sa.Column('evidence_photo_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('users', 'evidence_photo_enabled')
    op.drop_column('users', 'evidence_video_enabled')
    op.drop_column('users', 'evidence_audio_enabled')
    op.drop_column('users', 'share_location_enabled')
