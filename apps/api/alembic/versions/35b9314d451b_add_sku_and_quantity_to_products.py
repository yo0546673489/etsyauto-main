"""add_sku_and_quantity_to_products

Revision ID: 35b9314d451b
Revises: 20251209164119
Create Date: 2025-12-09 18:01:11.991667

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '35b9314d451b'
down_revision = '20251209164119'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add sku column (nullable, with index for lookups)
    op.add_column('products', sa.Column('sku', sa.String(255), nullable=True))
    op.create_index('ix_products_sku', 'products', ['sku'])
    
    # Add quantity column (nullable integer)
    op.add_column('products', sa.Column('quantity', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove index and columns
    op.drop_index('ix_products_sku', table_name='products')
    op.drop_column('products', 'quantity')
    op.drop_column('products', 'sku')
