"""Map DEPOSIT_FEE ledger entry type to fees category

Revision ID: 20260221_deposit_fee
Revises: 20260220_registry
Create Date: 2026-02-21

Fixes "Unmapped financial types detected" warning for DEPOSIT_FEE.
Etsy charges this fee when available funds fall below threshold in certain countries.
"""
from alembic import op

revision = '20260221_deposit_fee'
down_revision = '20260220_registry'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO ledger_entry_type_registry (entry_type, category, first_seen_at, last_seen_at, mapped)
        VALUES ('DEPOSIT_FEE', 'fees', NOW(), NOW(), true)
        ON CONFLICT (entry_type) DO UPDATE SET
            category = 'fees',
            mapped = true,
            last_seen_at = NOW()
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE ledger_entry_type_registry
        SET category = NULL, mapped = false
        WHERE entry_type = 'DEPOSIT_FEE'
    """)
