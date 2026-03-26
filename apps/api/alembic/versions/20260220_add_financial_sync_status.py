"""Add financial_sync_status table for tracking ledger/payment sync state

Revision ID: 20260220_sync_status
Revises: 20260219_remove_supplier
Create Date: 2026-02-20

Enables sync status API and 'last updated' UI without querying large ledger/payment tables.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260220_sync_status'
down_revision = '20260219_remove_supplier'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'financial_sync_status',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('shop_id', sa.BigInteger(), nullable=False),
        sa.Column('ledger_last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('payment_last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ledger_last_error', sa.Text(), nullable=True),
        sa.Column('payment_last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_financial_sync_status_tenant_shop', 'financial_sync_status', ['tenant_id', 'shop_id'])
    op.create_unique_constraint('uq_financial_sync_status_shop_id', 'financial_sync_status', ['shop_id'])


def downgrade() -> None:
    op.drop_constraint('uq_financial_sync_status_shop_id', 'financial_sync_status', type_='unique')
    op.drop_index('idx_financial_sync_status_tenant_shop', table_name='financial_sync_status')
    op.drop_table('financial_sync_status')
