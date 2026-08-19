"""add admin account management (status, sessions, login/audit history)

Revision ID: d4c8a2e7f931
Revises: b7e2c94f1a58
Create Date: 2026-08-19 00:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'd4c8a2e7f931'
down_revision = 'b7e2c94f1a58'
branch_labels = None
depends_on = None


def upgrade() -> None:
    account_status_enum = sa.Enum('active', 'suspended', 'banned', name='account_status')
    account_status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'users',
        sa.Column('account_status', account_status_enum, nullable=False, server_default='active'),
    )
    # Backfill from the column this replaces, before dropping it.
    op.execute("UPDATE users SET account_status = 'suspended' WHERE is_active = false")
    op.drop_column('users', 'is_active')
    op.create_index(op.f('ix_users_account_status'), 'users', ['account_status'], unique=False)

    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('sessions_invalidated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'login_events',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('ip_address', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_login_events_user_id'), 'login_events', ['user_id'], unique=False)

    admin_action_enum = sa.Enum(
        'role_change', 'suspend', 'ban', 'reinstate', 'grant_trial', 'soft_delete', 'restore', 'force_logout',
        name='admin_action',
    )
    # No separate .create() call here (unlike account_status above) —
    # op.create_table() auto-creates an Enum type referenced in its own
    # column list; calling .create() first collides with that and fails
    # with "type already exists" (confirmed the hard way against a real
    # database, not just reasoned about).
    op.create_table(
        'admin_audit_logs',
        # admin_id nullable + SET NULL (not CASCADE): if the admin's own
        # account is later deleted, the audit row survives — losing the
        # record of *what happened* would be worse than losing the record
        # of *who specifically* did it.
        sa.Column('admin_id', postgresql.UUID(as_uuid=True), nullable=True),
        # target_user_id is deliberately not a foreign key at all — see
        # the model docstring, the audit trail has to survive the target
        # account being hard-deleted too.
        sa.Column('target_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', admin_action_enum, nullable=False),
        sa.Column('reason', sa.String(length=1000), nullable=True),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_admin_audit_logs_admin_id'), 'admin_audit_logs', ['admin_id'], unique=False)
    op.create_index(op.f('ix_admin_audit_logs_target_user_id'), 'admin_audit_logs', ['target_user_id'], unique=False)
    op.create_index(op.f('ix_admin_audit_logs_action'), 'admin_audit_logs', ['action'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_admin_audit_logs_action'), table_name='admin_audit_logs')
    op.drop_index(op.f('ix_admin_audit_logs_target_user_id'), table_name='admin_audit_logs')
    op.drop_index(op.f('ix_admin_audit_logs_admin_id'), table_name='admin_audit_logs')
    op.drop_table('admin_audit_logs')
    sa.Enum(name='admin_action').drop(op.get_bind(), checkfirst=True)

    op.drop_index(op.f('ix_login_events_user_id'), table_name='login_events')
    op.drop_table('login_events')

    op.drop_column('users', 'last_active_at')
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'sessions_invalidated_at')
    op.drop_column('users', 'deleted_at')

    op.drop_index(op.f('ix_users_account_status'), table_name='users')
    op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE users SET is_active = false WHERE account_status != 'active'")
    op.drop_column('users', 'account_status')
    sa.Enum(name='account_status').drop(op.get_bind(), checkfirst=True)
