"""add subscriptions and payments

Revision ID: c7e2a41f9b6d
Revises: b3f1c9a2e7d4
Create Date: 2026-08-01 19:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'c7e2a41f9b6d'
down_revision = 'b3f1c9a2e7d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('plan', sa.Enum('monthly', 'annual', name='subscription_plan'), nullable=True),
        sa.Column('status', sa.Enum('trialing', 'active', 'past_due', 'cancelled', 'expired', name='subscription_status'), nullable=False),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('paystack_customer_code', sa.String(length=80), nullable=True),
        sa.Column('paystack_authorization_code', sa.String(length=80), nullable=True),
    )
    op.create_index('ix_subscriptions_user_id', 'subscriptions', ['user_id'])

    op.create_table(
        'payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plan', sa.Enum('monthly', 'annual', name='subscription_plan'), nullable=False),
        sa.Column('amount_kobo', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='NGN'),
        sa.Column('status', sa.Enum('pending', 'success', 'failed', 'abandoned', name='payment_status'), nullable=False),
        sa.Column('paystack_reference', sa.String(length=100), nullable=False, unique=True),
        sa.Column('paystack_transaction_id', sa.String(length=80), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_payments_user_id', 'payments', ['user_id'])
    op.create_index('ix_payments_paystack_reference', 'payments', ['paystack_reference'])


def downgrade() -> None:
    op.drop_index('ix_payments_paystack_reference', table_name='payments')
    op.drop_index('ix_payments_user_id', table_name='payments')
    op.drop_table('payments')
    op.drop_index('ix_subscriptions_user_id', table_name='subscriptions')
    op.drop_table('subscriptions')
    sa.Enum(name='payment_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='subscription_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='subscription_plan').drop(op.get_bind(), checkfirst=True)
