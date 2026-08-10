"""add sos evidence columns

Revision ID: 38803bdcead9
Revises: f4a8d2b6e153
Create Date: 2026-08-08 00:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = '38803bdcead9'
down_revision = 'f4a8d2b6e153'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # audio_recording_url was added in the initial schema but never written
    # to by any code path — replaced with segment-path arrays below, since
    # a single overwritable column can't hold a chunked recording.
    op.drop_column('sos_events', 'audio_recording_url')

    op.add_column(
        'sos_events',
        sa.Column('audio_segment_paths', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
    )
    op.add_column(
        'sos_events',
        sa.Column('video_segment_paths', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
    )
    op.add_column(
        'sos_events',
        sa.Column('photo_paths', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
    )
    op.add_column(
        'sos_events',
        sa.Column('evidence_notified_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('sos_events', 'evidence_notified_at')
    op.drop_column('sos_events', 'photo_paths')
    op.drop_column('sos_events', 'video_segment_paths')
    op.drop_column('sos_events', 'audio_segment_paths')
    op.add_column('sos_events', sa.Column('audio_recording_url', sa.String(length=500), nullable=True))
