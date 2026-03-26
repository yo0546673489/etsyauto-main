"""Add connect_links and expense_invoices tables

Revision ID: e6f0a3b5c7d9
Revises: d5e9f2a3b4c8
Create Date: 2026-02-14

New tables:
1. connect_links — One-time expiring store connection links
2. expense_invoices — Uploaded expense invoices
3. expense_line_items — Parsed line items from invoices
"""
from alembic import op
import sqlalchemy as sa

revision = 'e6f0a3b5c7d9'
down_revision = 'd5e9f2a3b4c8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── connect_links ──
    op.create_table(
        'connect_links',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('created_by_user_id', sa.BigInteger(), nullable=False),
        sa.Column('token', sa.String(128), nullable=False),
        sa.Column('shop_name', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_connect_links_token', 'connect_links', ['token'], unique=True)

    # ── expense_invoices ──
    op.create_table(
        'expense_invoices',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('shop_id', sa.BigInteger(), nullable=True),
        sa.Column('uploaded_by_user_id', sa.BigInteger(), nullable=False),
        sa.Column('file_name', sa.Text(), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=False),
        sa.Column('file_type', sa.String(20), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('vendor_name', sa.Text(), nullable=True),
        sa.Column('invoice_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_amount', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(3), server_default='USD', nullable=True),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('parsed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_expense_invoices_tenant_shop', 'expense_invoices', ['tenant_id', 'shop_id'])

    # ── expense_line_items ──
    op.create_table(
        'expense_line_items',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('invoice_id', sa.BigInteger(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('quantity', sa.Integer(), server_default='1', nullable=True),
        sa.ForeignKeyConstraint(['invoice_id'], ['expense_invoices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_expense_line_items_invoice', 'expense_line_items', ['invoice_id'])


def downgrade() -> None:
    op.drop_table('expense_line_items')
    op.drop_table('expense_invoices')
    op.drop_table('connect_links')
