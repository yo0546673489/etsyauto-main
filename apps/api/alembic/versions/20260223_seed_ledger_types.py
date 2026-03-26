"""Seed additional Etsy ledger entry types for financial categorization

Revision ID: 20260223_ledger_seed
Revises: 20260222_shop_financial
Create Date: 2026-02-23

Adds common Etsy ledger_type variations (Payment, Deposit, Reserve, Fee, etc.)
to improve P&L and payout accuracy.
"""
from alembic import op

revision = '20260223_ledger_seed'
down_revision = '20260222_shop_financial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO ledger_entry_type_registry (entry_type, category, first_seen_at, last_seen_at, mapped)
        VALUES
            ('Payment', 'other', NOW(), NOW(), true),
            ('Deposit', 'other', NOW(), NOW(), true),
            ('Reserve', 'adjustments', NOW(), NOW(), true),
            ('Fee', 'fees', NOW(), NOW(), true),
            ('FEE', 'fees', NOW(), NOW(), true),
            ('Sale', 'sales', NOW(), NOW(), true),
            ('SALE', 'sales', NOW(), NOW(), true),
            ('Transaction', 'sales', NOW(), NOW(), true),
            ('Refund', 'refunds', NOW(), NOW(), true),
            ('Marketing', 'marketing', NOW(), NOW(), true),
            ('OffsiteAds', 'marketing', NOW(), NOW(), true),
            ('EtsyAds', 'marketing', NOW(), NOW(), true),
            ('ShippingLabel', 'marketing', NOW(), NOW(), true),
            ('Tax', 'adjustments', NOW(), NOW(), true),
            ('Adjustment', 'adjustments', NOW(), NOW(), true),
            ('DISBURSE', 'adjustments', NOW(), NOW(), true)
        ON CONFLICT (entry_type) DO UPDATE SET
            category = EXCLUDED.category,
            mapped = true,
            last_seen_at = NOW()
    """)


def downgrade() -> None:
    # Remove only the types we added (keep originals from 20260220)
    op.execute("""
        DELETE FROM ledger_entry_type_registry
        WHERE entry_type IN (
            'Payment', 'Deposit', 'Reserve', 'Fee', 'FEE',
            'Sale', 'SALE', 'Transaction', 'Refund', 'Marketing',
            'OffsiteAds', 'EtsyAds', 'ShippingLabel', 'Tax',
            'Adjustment', 'DISBURSE'
        )
    """)
