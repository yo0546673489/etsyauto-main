"""
Add Etsy product sync fields to products
Revision ID: add_etsy_product_fields
"""
from alembic import op
import sqlalchemy as sa


revision = "add_etsy_product_fields"
down_revision = "idempotency_constraints"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def has_table(table_name: str) -> bool:
        return bind.execute(sa.text("SELECT to_regclass(:name)"), {"name": table_name}).scalar() is not None

    def has_column(table_name: str, column_name: str) -> bool:
        if not has_table(table_name):
            return False
        return column_name in {col["name"] for col in inspector.get_columns(table_name)}

    if not has_column("products", "etsy_listing_id"):
        op.add_column("products", sa.Column("etsy_listing_id", sa.String(50), nullable=True))
        op.create_index("ix_products_etsy_listing_id", "products", ["etsy_listing_id"])

    if not has_column("products", "shop_id"):
        op.add_column("products", sa.Column("shop_id", sa.BigInteger(), nullable=True))
        op.create_index("ix_products_shop_id", "products", ["shop_id"])
        op.create_foreign_key("fk_products_shop_id", "products", "shops", ["shop_id"], ["id"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def has_table(table_name: str) -> bool:
        return bind.execute(sa.text("SELECT to_regclass(:name)"), {"name": table_name}).scalar() is not None

    def has_column(table_name: str, column_name: str) -> bool:
        if not has_table(table_name):
            return False
        return column_name in {col["name"] for col in inspector.get_columns(table_name)}

    if has_column("products", "shop_id"):
        op.drop_constraint("fk_products_shop_id", "products", type_="foreignkey")
        op.drop_index("ix_products_shop_id", table_name="products")
        op.drop_column("products", "shop_id")

    if has_column("products", "etsy_listing_id"):
        op.drop_index("ix_products_etsy_listing_id", table_name="products")
        op.drop_column("products", "etsy_listing_id")
