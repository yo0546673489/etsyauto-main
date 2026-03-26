"""add_order_status_and_supplier_assignments

Revision ID: 20260128_order_status_supplier
Revises: bfb1fbc27019
Create Date: 2026-01-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260128_order_status_supplier"
down_revision = "bfb1fbc27019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    order_columns = {col["name"] for col in inspector.get_columns("orders")}
    membership_columns = {col["name"] for col in inspector.get_columns("memberships")}

    # Extend orders table with explicit status fields
    if "lifecycle_status" not in order_columns:
        op.add_column("orders", sa.Column("lifecycle_status", sa.String(30), nullable=True))
    if "payment_status" not in order_columns:
        op.add_column("orders", sa.Column("payment_status", sa.String(20), nullable=True))
    if "fulfillment_status" not in order_columns:
        op.add_column("orders", sa.Column("fulfillment_status", sa.String(20), nullable=True))

    op.execute("""
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_lifecycle_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_lifecycle_status_check
        CHECK (lifecycle_status IN ('open','processing','completed','cancelled','refunded'));
    """)
    op.execute("""
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('paid','unpaid','refunded','failed'));
    """)
    op.execute("""
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_status_check
        CHECK (fulfillment_status IN ('unshipped','shipped','delivered'));
    """)

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("orders")}
    if "idx_orders_lifecycle_status" not in existing_indexes:
        op.create_index("idx_orders_lifecycle_status", "orders", ["lifecycle_status"])
    if "idx_orders_payment_status" not in existing_indexes:
        op.create_index("idx_orders_payment_status", "orders", ["payment_status"])
    if "idx_orders_fulfillment_status" not in existing_indexes:
        op.create_index("idx_orders_fulfillment_status", "orders", ["fulfillment_status"])

    # Expand membership role constraint to include supplier
    op.execute("""
        ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
        ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
        CHECK (role IN ('owner','admin','creator','viewer','supplier'));
    """)
    if "last_orders_viewed_at" not in membership_columns:
        op.add_column("memberships", sa.Column("last_orders_viewed_at", sa.DateTime(timezone=True), nullable=True))

    # Supplier assignments tables
    if "supplier_order_assignments" not in tables:
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
    supplier_order_indexes = set()
    if "supplier_order_assignments" in tables:
        supplier_order_indexes = {idx["name"] for idx in inspector.get_indexes("supplier_order_assignments")}
    if "idx_supplier_order_shop_user" not in supplier_order_indexes:
        op.create_index("idx_supplier_order_shop_user", "supplier_order_assignments", ["shop_id", "supplier_user_id"])

    if "supplier_product_assignments" not in tables:
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
    supplier_product_indexes = set()
    if "supplier_product_assignments" in tables:
        supplier_product_indexes = {idx["name"] for idx in inspector.get_indexes("supplier_product_assignments")}
    if "idx_supplier_product_shop_user" not in supplier_product_indexes:
        op.create_index("idx_supplier_product_shop_user", "supplier_product_assignments", ["shop_id", "supplier_user_id"])


def downgrade() -> None:
    op.drop_index("idx_supplier_product_shop_user", table_name="supplier_product_assignments")
    op.drop_table("supplier_product_assignments")
    op.drop_index("idx_supplier_order_shop_user", table_name="supplier_order_assignments")
    op.drop_table("supplier_order_assignments")

    op.drop_index("idx_orders_fulfillment_status", table_name="orders")
    op.drop_index("idx_orders_payment_status", table_name="orders")
    op.drop_index("idx_orders_lifecycle_status", table_name="orders")

    op.drop_constraint("orders_fulfillment_status_check", "orders", type_="check")
    op.drop_constraint("orders_payment_status_check", "orders", type_="check")
    op.drop_constraint("orders_lifecycle_status_check", "orders", type_="check")

    op.drop_column("orders", "fulfillment_status")
    op.drop_column("orders", "payment_status")
    op.drop_column("orders", "lifecycle_status")

    op.drop_column("memberships", "last_orders_viewed_at")

    op.execute("""
        ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
        ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
        CHECK (role IN ('owner','admin','creator','viewer'));
    """)
