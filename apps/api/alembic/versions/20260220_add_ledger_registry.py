"""Add ledger_entry_type_registry and extend ledger_entries for raw storage

Revision ID: 20260220_registry
Revises: 20260220_sync_status
Create Date: 2026-02-20

- ledger_entry_type_registry: discovery engine for entry types
- ledger_entries: add category, raw_payload, created_timestamp
- Seed registry with known Etsy types
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '20260220_registry'
down_revision = '20260220_sync_status'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ledger_entry_type_registry ──
    op.create_table(
        'ledger_entry_type_registry',
        sa.Column('entry_type', sa.Text(), nullable=False),
        sa.Column('category', sa.Text(), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('mapped', sa.Boolean(), server_default='false', nullable=False),
        sa.PrimaryKeyConstraint('entry_type'),
    )

    # ── ledger_entries: add columns ──
    op.add_column('ledger_entries', sa.Column('category', sa.Text(), nullable=True))
    op.add_column('ledger_entries', sa.Column('raw_payload', JSONB, nullable=True))
    op.add_column('ledger_entries', sa.Column('created_timestamp', sa.BigInteger(), nullable=True))

    # Backfill created_timestamp from entry_created_at
    op.execute("""
        UPDATE ledger_entries
        SET created_timestamp = EXTRACT(EPOCH FROM entry_created_at)::BIGINT
        WHERE created_timestamp IS NULL AND entry_created_at IS NOT NULL
    """)

    # ── Seed registry with known Etsy types (from GitHub/docs + current _TYPE_KEYWORDS) ──
    op.execute("""
        INSERT INTO ledger_entry_type_registry (entry_type, category, first_seen_at, last_seen_at, mapped)
        VALUES
            ('transaction', 'sales', NOW(), NOW(), true),
            ('shipping_transaction', 'sales', NOW(), NOW(), true),
            ('transaction_fee', 'fees', NOW(), NOW(), true),
            ('processing_fee', 'fees', NOW(), NOW(), true),
            ('listing', 'fees', NOW(), NOW(), true),
            ('gift_wrap_fees', 'fees', NOW(), NOW(), true),
            ('offsite_ads_fee', 'marketing', NOW(), NOW(), true),
            ('refund', 'refunds', NOW(), NOW(), true),
            ('REFUND', 'refunds', NOW(), NOW(), true),
            ('sales_tax', 'adjustments', NOW(), NOW(), true),
            ('DISBURSE2', 'adjustments', NOW(), NOW(), true),
            ('shipping_labels', 'marketing', NOW(), NOW(), true),
            ('sale', 'sales', NOW(), NOW(), true),
            ('reserve', 'adjustments', NOW(), NOW(), true),
            ('payout', 'adjustments', NOW(), NOW(), true),
            ('listing_renewal', 'fees', NOW(), NOW(), true),
            ('advertising', 'marketing', NOW(), NOW(), true),
            ('shipping_label', 'marketing', NOW(), NOW(), true),
            ('subscription', 'fees', NOW(), NOW(), true),
            ('tax', 'adjustments', NOW(), NOW(), true),
            ('other', 'other', NOW(), NOW(), true)
        ON CONFLICT (entry_type) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table('ledger_entry_type_registry')
    op.drop_column('ledger_entries', 'created_timestamp')
    op.drop_column('ledger_entries', 'raw_payload')
    op.drop_column('ledger_entries', 'category')
