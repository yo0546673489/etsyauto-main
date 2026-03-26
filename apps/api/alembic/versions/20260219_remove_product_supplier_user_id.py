"""Remove supplier_user_id from products table

Revision ID: 20260219_remove_supplier
Revises: 20260211_supplier
Create Date: 2026-02-19

Suppliers see products via shop assignment (Membership.allowed_shop_ids),
not per-product assignment.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260219_remove_supplier'
down_revision = '20260211_supplier'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index('ix_products_supplier_user_id', table_name='products')
    op.drop_constraint('fk_products_supplier_user_id', 'products', type_='foreignkey')
    op.drop_column('products', 'supplier_user_id')


def downgrade() -> None:
    op.add_column(
        'products',
        sa.Column('supplier_user_id', sa.BigInteger(), nullable=True)
    )
    op.create_foreign_key(
        'fk_products_supplier_user_id',
        'products',
        'users',
        ['supplier_user_id'],
        ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_products_supplier_user_id', 'products', ['supplier_user_id'])
