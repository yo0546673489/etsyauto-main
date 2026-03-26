"""Remove Printful and supplier assignment tables

Revision ID: 20260205_remove_printful_supplier
Revises: 20260205_add_listing_job_verifying_status
Create Date: 2026-02-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260205_remove_printful_supplier"
down_revision = "20260205_add_listing_job_verifying_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # Drop supplier assignment tables if they exist
    if "supplier_order_assignments" in tables:
        op.drop_index("idx_supplier_order_shop_user", table_name="supplier_order_assignments")
        op.drop_table("supplier_order_assignments")
    if "supplier_product_assignments" in tables:
        op.drop_index("idx_supplier_product_shop_user", table_name="supplier_product_assignments")
        op.drop_table("supplier_product_assignments")

    # Update oauth_tokens provider constraint (remove printful)
    if "oauth_tokens" in tables:
        op.execute("ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_provider_check")
        op.execute("ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_provider_check CHECK (provider IN ('etsy'))")

    # Remove supplier fields from products
    if "products" in tables:
        product_columns = {col["name"] for col in inspector.get_columns("products")}
        if "supplier_name" in product_columns:
            op.drop_column("products", "supplier_name")
        if "supplier_product_id" in product_columns:
            op.drop_column("products", "supplier_product_id")

    # Update orders: add supplier_user_id + assigned_at, remove legacy supplier fields
    if "orders" in tables:
        order_columns = {col["name"] for col in inspector.get_columns("orders")}
        if "supplier_user_id" not in order_columns:
            op.add_column("orders", sa.Column("supplier_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True))
            op.create_index("idx_orders_supplier_user", "orders", ["supplier_user_id"])
        if "supplier_assigned_at" not in order_columns:
            op.add_column("orders", sa.Column("supplier_assigned_at", sa.DateTime(timezone=True), nullable=True))
        if "supplier_order_id" in order_columns:
            op.drop_column("orders", "supplier_order_id")
        if "supplier_status" in order_columns:
            op.drop_column("orders", "supplier_status")

    # Supplier profiles table
    if "supplier_profiles" not in tables:
        op.create_table(
            "supplier_profiles",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False, unique=True),
            sa.Column("shop_id", sa.BigInteger(), sa.ForeignKey("shops.id"), nullable=True),
            sa.Column("company_name", sa.Text(), nullable=True),
            sa.Column("contact_name", sa.Text(), nullable=True),
            sa.Column("email", postgresql.CITEXT(), nullable=True),
            sa.Column("phone", sa.Text(), nullable=True),
            sa.Column("address_line1", sa.Text(), nullable=True),
            sa.Column("address_line2", sa.Text(), nullable=True),
            sa.Column("city", sa.Text(), nullable=True),
            sa.Column("state", sa.Text(), nullable=True),
            sa.Column("postal_code", sa.Text(), nullable=True),
            sa.Column("country", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("idx_supplier_profiles_tenant", "supplier_profiles", ["tenant_id"])
        op.create_index("idx_supplier_profiles_user", "supplier_profiles", ["user_id"])
        op.create_index("idx_supplier_profiles_shop", "supplier_profiles", ["shop_id"])


def downgrade() -> None:
    # Restore supplier assignment tables
    op.create_table(
        "supplier_order_assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("shop_id", sa.BigInteger(), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("order_id", sa.BigInteger(), sa.ForeignKey("orders.id"), nullable=False, unique=True),
        sa.Column("supplier_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_supplier_order_shop_user", "supplier_order_assignments", ["shop_id", "supplier_user_id"])

    op.create_table(
        "supplier_product_assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("shop_id", sa.BigInteger(), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("product_id", sa.BigInteger(), sa.ForeignKey("products.id"), nullable=False, unique=True),
        sa.Column("supplier_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_supplier_product_shop_user", "supplier_product_assignments", ["shop_id", "supplier_user_id"])

    # Restore oauth_tokens provider constraint
    op.execute("ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_provider_check")
    op.execute("ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_provider_check CHECK (provider IN ('etsy','printful'))")

    # Restore supplier fields on products
    op.add_column("products", sa.Column("supplier_name", sa.String(255), nullable=True))
    op.add_column("products", sa.Column("supplier_product_id", sa.String(255), nullable=True))

    # Restore supplier fields on orders
    op.add_column("orders", sa.Column("supplier_order_id", sa.String(255), nullable=True))
    op.add_column("orders", sa.Column("supplier_status", sa.String(50), nullable=True))
    op.drop_index("idx_orders_supplier_user", table_name="orders")
    op.drop_column("orders", "supplier_user_id")
    op.drop_column("orders", "supplier_assigned_at")

    # Drop supplier profiles
    op.drop_index("idx_supplier_profiles_shop", table_name="supplier_profiles")
    op.drop_index("idx_supplier_profiles_user", table_name="supplier_profiles")
    op.drop_index("idx_supplier_profiles_tenant", table_name="supplier_profiles")
    op.drop_table("supplier_profiles")
