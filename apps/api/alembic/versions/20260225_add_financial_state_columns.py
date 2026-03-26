"""Add tenant_id and reserve_amount to shop_financial_state

Revision ID: 20260225_financial_state_cols
Revises: 20260220_membership_created
Create Date: 2026-02-25
"""
from alembic import op
import sqlalchemy as sa

revision = '20260225_financial_state_cols'
down_revision = '20260220_membership_created'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tenant_id column (NOT NULL with default 1 for existing rows)
    op.execute("""
        ALTER TABLE shop_financial_state
        ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 1
    """)

    # Add reserve_amount column (nullable integer, cents)
    op.execute("""
        ALTER TABLE shop_financial_state
        ADD COLUMN IF NOT EXISTS reserve_amount INTEGER NULL
    """)

    # Add updated_at column if missing
    op.execute("""
        ALTER TABLE shop_financial_state
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NULL
    """)

    # Backfill tenant_id from shops table for any existing rows
    op.execute("""
        UPDATE shop_financial_state sfs
        SET tenant_id = s.tenant_id
        FROM shops s
        WHERE s.id = sfs.shop_id
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE shop_financial_state DROP COLUMN IF EXISTS tenant_id")
    op.execute("ALTER TABLE shop_financial_state DROP COLUMN IF EXISTS reserve_amount")
    op.execute("ALTER TABLE shop_financial_state DROP COLUMN IF EXISTS updated_at")
