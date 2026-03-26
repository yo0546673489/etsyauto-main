"""
Allow 'etsy' in products.source check constraint

Revision ID: update_products_source_check
Revises: add_membership_shop_access
Create Date: 2026-01-25
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "update_products_source_check"
down_revision = "add_membership_shop_access"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_source_check")
    op.create_check_constraint(
        "products_source_check",
        "products",
        "source IN ('csv','json','api','manual','etsy')",
    )


def downgrade():
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_source_check")
    op.create_check_constraint(
        "products_source_check",
        "products",
        "source IN ('csv','json','api','manual')",
    )
