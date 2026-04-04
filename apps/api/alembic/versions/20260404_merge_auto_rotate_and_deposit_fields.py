"""merge auto_rotate and deposit_fields heads

Revision ID: 20260404_merge_heads
Revises: 20260404_auto_rotate, add_shop_financial_state_deposit_fields
Create Date: 2026-04-04
"""
from alembic import op

revision = '20260404_merge_heads'
down_revision = ('20260404_auto_rotate', 'add_shop_financial_state_deposit_fields')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
