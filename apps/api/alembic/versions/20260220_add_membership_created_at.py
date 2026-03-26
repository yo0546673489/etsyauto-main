"""Add created_at to memberships

Revision ID: 20260220_membership_created
Revises: 20260222_shop_financial
Create Date: 2026-02-20

Adds created_at column to memberships for Google OAuth membership creation.
"""
from alembic import op
import sqlalchemy as sa


revision = '20260220_membership_created'
down_revision = '20260222_shop_financial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'memberships',
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_column('memberships', 'created_at')
