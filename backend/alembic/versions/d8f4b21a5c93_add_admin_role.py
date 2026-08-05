"""add admin role to users

Revision ID: d8f4b21a5c93
Revises: c7e2a41f9b6d
Create Date: 2026-08-02 14:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'd8f4b21a5c93'
down_revision = 'c7e2a41f9b6d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    admin_role_enum = sa.Enum('none', 'viewer', 'super_admin', name='admin_role')
    admin_role_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'users',
        sa.Column('admin_role', admin_role_enum, nullable=False, server_default='none'),
    )


def downgrade() -> None:
    op.drop_column('users', 'admin_role')
    sa.Enum(name='admin_role').drop(op.get_bind(), checkfirst=True)
