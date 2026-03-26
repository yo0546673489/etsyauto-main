"""update_order_status_enums

Revision ID: 20260202_order_status_enums
Revises: 20260128_order_status_supplier
Create Date: 2026-02-02 00:00:00.000000
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "20260202_order_status_enums"
down_revision = "20260128_order_status_supplier"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_lifecycle_status_check;")
    op.execute("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;")

    op.execute(
        """
        UPDATE orders
        SET payment_status = CASE
            WHEN lower(coalesce(etsy_status, '')) IN ('paid','completed') THEN 'paid'
            ELSE 'unpaid'
        END
        WHERE payment_status IS NULL OR payment_status NOT IN ('paid','unpaid');
        """
    )

    op.execute(
        """
        UPDATE orders
        SET lifecycle_status = CASE
            WHEN lower(coalesce(etsy_status, '')) IN ('refunded','fully refunded') THEN 'refunded'
            WHEN lower(coalesce(etsy_status, '')) IN ('canceled','cancelled') THEN 'cancelled'
            WHEN fulfillment_status = 'delivered' OR lower(coalesce(etsy_status, '')) = 'completed' THEN 'completed'
            WHEN fulfillment_status = 'shipped' THEN 'in_transit'
            ELSE 'processing'
        END;
        """
    )

    op.execute(
        """
        UPDATE orders
        SET status = CASE
            WHEN lifecycle_status = 'cancelled' THEN 'cancelled'
            WHEN lifecycle_status = 'refunded' THEN 'refunded'
            WHEN lifecycle_status = 'completed' THEN CASE
                WHEN fulfillment_status = 'delivered' THEN 'delivered'
                ELSE 'shipped'
            END
            WHEN lifecycle_status = 'in_transit' THEN 'shipped'
            ELSE 'processing'
        END;
        """
    )

    op.execute(
        """
        ALTER TABLE orders ADD CONSTRAINT orders_lifecycle_status_check
        CHECK (lifecycle_status IN ('processing','in_transit','completed','cancelled','refunded'));
        """
    )
    op.execute(
        """
        ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('paid','unpaid'));
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_lifecycle_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_lifecycle_status_check
        CHECK (lifecycle_status IN ('open','processing','completed','cancelled','refunded'));
        """
    )
    op.execute(
        """
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('paid','unpaid','refunded','failed'));
        """
    )
