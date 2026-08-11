"""index trusted_contact phone

Revision ID: 9b3d7f2e5a41
Revises: 7f1c4e9a2b83
Create Date: 2026-08-11 00:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '9b3d7f2e5a41'
down_revision = '7f1c4e9a2b83'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(op.f('ix_trusted_contacts_phone'), 'trusted_contacts', ['phone'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_trusted_contacts_phone'), table_name='trusted_contacts')
