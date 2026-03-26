"""Add cost_usd_cents to products table

Revision ID: 20260219_cost
Revises: ac3a029339c5
Create Date: 2026-02-19

Adds supplier/wholesale unit cost per product (USD cents) for COGS calculation.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260219_cost'
down_revision = 'ac3a029339c5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column('cost_usd_cents', sa.Integer(), nullable=True, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('products', 'cost_usd_cents')
