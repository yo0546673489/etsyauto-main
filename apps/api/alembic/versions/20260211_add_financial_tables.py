"""Add ledger_entries and payment_details tables for financial analytics

Revision ID: d5e9f2a3b4c8
Revises: c4f8a1d2e3b7
Create Date: 2026-02-11

New tables:
1. ledger_entries — Etsy shop ledger (debits, credits, running balance)
2. payment_details — Per-order payment breakdown (gross, fees, net, adjustments)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd5e9f2a3b4c8'
down_revision = 'c4f8a1d2e3b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ledger_entries ──
    op.create_table(
        'ledger_entries',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('shop_id', sa.BigInteger(), nullable=False),
        sa.Column('etsy_entry_id', sa.BigInteger(), nullable=False),
        sa.Column('etsy_ledger_id', sa.BigInteger(), nullable=False),
        sa.Column('entry_type', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('balance', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(3), server_default='USD', nullable=True),
        sa.Column('etsy_receipt_id', sa.String(50), nullable=True),
        sa.Column('entry_created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ledger_entries_etsy_entry_id', 'ledger_entries', ['etsy_entry_id'], unique=True)
    op.create_index('ix_ledger_entries_entry_type', 'ledger_entries', ['entry_type'])
    op.create_index('ix_ledger_entries_etsy_receipt_id', 'ledger_entries', ['etsy_receipt_id'])
    op.create_index('idx_ledger_tenant_shop_date', 'ledger_entries', ['tenant_id', 'shop_id', 'entry_created_at'])

    # ── payment_details ──
    op.create_table(
        'payment_details',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('shop_id', sa.BigInteger(), nullable=False),
        sa.Column('order_id', sa.BigInteger(), nullable=True),
        sa.Column('etsy_payment_id', sa.BigInteger(), nullable=False),
        sa.Column('etsy_receipt_id', sa.String(50), nullable=False),
        sa.Column('amount_gross', sa.Integer(), nullable=False),
        sa.Column('amount_fees', sa.Integer(), nullable=False),
        sa.Column('amount_net', sa.Integer(), nullable=False),
        sa.Column('posted_gross', sa.Integer(), nullable=True),
        sa.Column('adjusted_gross', sa.Integer(), nullable=True),
        sa.Column('adjusted_fees', sa.Integer(), nullable=True),
        sa.Column('adjusted_net', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(3), server_default='USD', nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_payment_details_etsy_payment_id', 'payment_details', ['etsy_payment_id'], unique=True)
    op.create_index('ix_payment_details_etsy_receipt_id', 'payment_details', ['etsy_receipt_id'])
    op.create_index('idx_payment_tenant_shop', 'payment_details', ['tenant_id', 'shop_id'])


def downgrade() -> None:
    op.drop_table('payment_details')
    op.drop_table('ledger_entries')
