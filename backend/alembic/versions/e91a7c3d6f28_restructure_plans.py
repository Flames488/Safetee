"""restructure plans into tier + billing interval + seats

Revision ID: e91a7c3d6f28
Revises: d8f4b21a5c93
Create Date: 2026-08-02 20:00:00.000000

Replaces the flat monthly/annual `plan` concept with three independent
tiers (individual/family/organization) crossed with a billing interval
(monthly/annual), plus a seat count that only applies to organizations.
This is a clean break, not an additive change — safe because no real
payments exist against the old `subscription_plan` values yet (pricing
was still a placeholder). If this is ever run against a database with
real payment history, back it up first; this migration does not attempt
to map old plan values onto the new tier/interval pair.
"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'e91a7c3d6f28'
down_revision = 'd8f4b21a5c93'
branch_labels = None
depends_on = None


def upgrade() -> None:
    plan_tier = sa.Enum('individual', 'family', 'organization', name='plan_tier')
    billing_interval = sa.Enum('monthly', 'annual', name='billing_interval')
    plan_tier.create(op.get_bind(), checkfirst=True)
    billing_interval.create(op.get_bind(), checkfirst=True)

    op.add_column('subscriptions', sa.Column('tier', plan_tier, nullable=True))
    op.add_column('subscriptions', sa.Column('billing_interval', billing_interval, nullable=True))
    op.add_column('subscriptions', sa.Column('extra_seats', sa.Integer(), nullable=False, server_default='0'))
    op.drop_column('subscriptions', 'plan')

    op.add_column(
        'payments',
        sa.Column('tier', plan_tier, nullable=False, server_default='individual'),
    )
    op.add_column(
        'payments',
        sa.Column('billing_interval', billing_interval, nullable=False, server_default='monthly'),
    )
    op.add_column('payments', sa.Column('extra_seats', sa.Integer(), nullable=False, server_default='0'))
    op.drop_column('payments', 'plan')

    sa.Enum(name='subscription_plan').drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    subscription_plan = sa.Enum('monthly', 'annual', name='subscription_plan')
    subscription_plan.create(op.get_bind(), checkfirst=True)

    op.add_column('subscriptions', sa.Column('plan', subscription_plan, nullable=True))
    op.drop_column('subscriptions', 'extra_seats')
    op.drop_column('subscriptions', 'billing_interval')
    op.drop_column('subscriptions', 'tier')

    op.add_column('payments', sa.Column('plan', subscription_plan, nullable=True))
    op.drop_column('payments', 'extra_seats')
    op.drop_column('payments', 'billing_interval')
    op.drop_column('payments', 'tier')

    sa.Enum(name='billing_interval').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='plan_tier').drop(op.get_bind(), checkfirst=True)
