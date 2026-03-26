"""Add shop_financial_state table and payment_account_last_sync_at

Revision ID: 20260222_shop_financial
Revises: 20260221_deposit_fee
Create Date: 2026-02-22

Stores balance, available_for_payout, currency from Etsy payment-account endpoint.
Enables payout data source separation from ledger-based profit logic.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260222_shop_financial'
down_revision = '20260221_deposit_fee'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # 1. Add payment_account_last_sync_at first (no FK dependency)
    fss_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'financial_sync_status'"
    )).scalar()
    if fss_exists:
        r2 = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'financial_sync_status' AND column_name = 'payment_account_last_sync_at'"
        )).scalar()
        if not r2:
            op.add_column(
                'financial_sync_status',
                sa.Column('payment_account_last_sync_at', sa.DateTime(timezone=True), nullable=True),
            )

    # 2. Create shop_financial_state only if shops exists (e.g. migrations ran)
    r = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_financial_state'"
    )).scalar()
    if r:
        return
    shops_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'shops'"
    )).scalar()
    if not shops_exists:
        return
    op.create_table(
        'shop_financial_state',
        sa.Column('shop_id', sa.BigInteger(), nullable=False),
        sa.Column('balance', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('available_for_payout', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency_code', sa.String(3), nullable=False, server_default='USD'),
        sa.Column('reserve_amount', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('shop_id'),
    )
    op.create_index('idx_shop_financial_state_updated', 'shop_financial_state', ['updated_at'])


def downgrade() -> None:
    conn = op.get_bind()
    r = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'financial_sync_status' AND column_name = 'payment_account_last_sync_at'"
    )).scalar()
    if r:
        op.drop_column('financial_sync_status', 'payment_account_last_sync_at')
    r2 = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_financial_state'"
    )).scalar()
    if r2:
        op.drop_index('idx_shop_financial_state_updated', table_name='shop_financial_state')
        op.drop_table('shop_financial_state')
