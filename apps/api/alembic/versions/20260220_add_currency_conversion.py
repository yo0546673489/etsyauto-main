"""Add exchange_rates and user_preferences tables for currency conversion

Revision ID: 20260223_currency
Revises: 20260222_shop_financial
Create Date: 2026-02-23

Stores exchange rates for currency conversion and user preferred display currency.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260223_currency'
down_revision = '20260222_shop_financial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # 1. exchange_rates table
    r = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'exchange_rates'"
    )).scalar()
    if not r:
        op.create_table(
            'exchange_rates',
            sa.Column('base_currency', sa.String(3), nullable=False),
            sa.Column('target_currency', sa.String(3), nullable=False),
            sa.Column('rate', sa.Numeric(24, 12), nullable=False),
            sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('source', sa.String(50), nullable=True, server_default='api'),
            sa.PrimaryKeyConstraint('base_currency', 'target_currency', 'retrieved_at'),
        )
        op.create_index(
            'idx_exchange_rates_lookup',
            'exchange_rates',
            ['base_currency', 'target_currency', 'retrieved_at'],
        )

    # 2. user_preferences table (requires users table)
    users_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'users'"
    )).scalar()
    if users_exists:
        r2 = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences'"
        )).scalar()
        if not r2:
            op.create_table(
                'user_preferences',
                sa.Column('user_id', sa.BigInteger(), nullable=False),
                sa.Column('preferred_currency_code', sa.String(3), nullable=False, server_default='USD'),
                sa.Column('last_updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
                sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
                sa.PrimaryKeyConstraint('user_id'),
            )


def downgrade() -> None:
    conn = op.get_bind()
    r = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences'"
    )).scalar()
    if r:
        op.drop_table('user_preferences')
    r2 = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'exchange_rates'"
    )).scalar()
    if r2:
        op.drop_index('idx_exchange_rates_lookup', table_name='exchange_rates')
        op.drop_table('exchange_rates')
