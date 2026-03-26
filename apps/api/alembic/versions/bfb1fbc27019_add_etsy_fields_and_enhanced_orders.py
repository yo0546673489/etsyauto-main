"""add_etsy_fields_and_enhanced_orders

Revision ID: bfb1fbc27019
Revises: idempotency_constraints
Create Date: 2025-12-16 23:54:43.174914

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'bfb1fbc27019'
down_revision = 'idempotency_constraints'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ===== Extend Products table with Etsy-specific fields =====
    op.add_column('products', sa.Column('taxonomy_id', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('materials', postgresql.JSONB(), nullable=True))
    op.add_column('products', sa.Column('who_made', sa.String(50), nullable=True, server_default='i_did'))
    op.add_column('products', sa.Column('when_made', sa.String(50), nullable=True, server_default='made_to_order'))
    op.add_column('products', sa.Column('is_supply', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('products', sa.Column('is_customizable', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('products', sa.Column('is_personalizable', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('products', sa.Column('personalization_instructions', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('item_weight', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('item_weight_unit', sa.String(10), nullable=True, server_default='oz'))
    op.add_column('products', sa.Column('item_length', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('item_width', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('item_height', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('item_dimensions_unit', sa.String(10), nullable=True, server_default='in'))
    op.add_column('products', sa.Column('processing_min', sa.Integer(), nullable=True, server_default='1'))
    op.add_column('products', sa.Column('processing_max', sa.Integer(), nullable=True, server_default='3'))
    
    # ===== Extend Shops table with Etsy configuration =====
    op.add_column('shops', sa.Column('default_shipping_profile_id', sa.BigInteger(), nullable=True))
    op.add_column('shops', sa.Column('default_return_policy_id', sa.BigInteger(), nullable=True))
    op.add_column('shops', sa.Column('shop_section_id', sa.BigInteger(), nullable=True))
    op.add_column('shops', sa.Column('shop_data', postgresql.JSONB(), nullable=True))
    
    # ===== Enhance Orders table with full details =====
    # Add new status values
    op.execute("""
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_status_check 
        CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded'));
    """)
    
    op.add_column('orders', sa.Column('etsy_status', sa.String(50), nullable=True))
    op.add_column('orders', sa.Column('buyer_user_id', sa.String(50), nullable=True))
    op.add_column('orders', sa.Column('buyer_name', sa.String(255), nullable=True))
    
    # Rename/update buyer fields
    op.alter_column('orders', 'customer_email', new_column_name='buyer_email', nullable=True)
    op.alter_column('orders', 'customer_name', existing_type=sa.String(255), nullable=True)
    
    # Shipping address fields
    op.add_column('orders', sa.Column('shipping_name', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('shipping_first_line', sa.String(500), nullable=True))
    op.add_column('orders', sa.Column('shipping_second_line', sa.String(500), nullable=True))
    op.add_column('orders', sa.Column('shipping_city', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('shipping_state', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('shipping_zip', sa.String(50), nullable=True))
    op.add_column('orders', sa.Column('shipping_country', sa.String(100), nullable=True))
    op.add_column('orders', sa.Column('shipping_country_iso', sa.String(2), nullable=True))
    
    # Financial fields (in cents)
    op.add_column('orders', sa.Column('subtotal', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('total_shipping_cost', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('total_tax_cost', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('discount_amt', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('orders', sa.Column('gift_wrap_price', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('orders', sa.Column('currency', sa.String(3), nullable=True, server_default='USD'))
    op.add_column('orders', sa.Column('transaction_fee', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('listing_fee', sa.Integer(), nullable=True))
    
    # Rename total_price column if needed
    op.alter_column('orders', 'order_data', new_column_name='total_price', 
                    existing_type=postgresql.JSONB(), 
                    type_=sa.Integer(),
                    postgresql_using='(order_data->>\'total\')::integer',
                    nullable=True)
    
    # Line items and shipments
    op.add_column('orders', sa.Column('line_items', postgresql.JSONB(), nullable=True))
    op.add_column('orders', sa.Column('shipments', postgresql.JSONB(), nullable=True))
    
    # Drop old tracking column, use shipments instead
    op.drop_column('orders', 'tracking')
    
    # Supplier and gift fields
    op.add_column('orders', sa.Column('supplier_status', sa.String(50), nullable=True))
    op.add_column('orders', sa.Column('message_from_buyer', sa.Text(), nullable=True))
    op.add_column('orders', sa.Column('is_gift', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('orders', sa.Column('gift_message', sa.Text(), nullable=True))
    
    # Timestamps
    op.add_column('orders', sa.Column('etsy_created_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('etsy_updated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True))
    
    # Add indexes for orders
    op.create_index('idx_orders_status_shop', 'orders', ['shop_id', 'status'])
    op.create_index('idx_orders_etsy_status', 'orders', ['etsy_status'])
    op.create_index('idx_orders_synced_at', 'orders', ['synced_at'])
    
    # Make etsy_receipt_id not nullable and indexed
    op.alter_column('orders', 'etsy_receipt_id', nullable=False)
    op.create_index('idx_orders_etsy_receipt_id', 'orders', ['etsy_receipt_id'])


def downgrade() -> None:
    # Remove product Etsy fields
    op.drop_column('products', 'taxonomy_id')
    op.drop_column('products', 'materials')
    op.drop_column('products', 'who_made')
    op.drop_column('products', 'when_made')
    op.drop_column('products', 'is_supply')
    op.drop_column('products', 'is_customizable')
    op.drop_column('products', 'is_personalizable')
    op.drop_column('products', 'personalization_instructions')
    op.drop_column('products', 'item_weight')
    op.drop_column('products', 'item_weight_unit')
    op.drop_column('products', 'item_length')
    op.drop_column('products', 'item_width')
    op.drop_column('products', 'item_height')
    op.drop_column('products', 'item_dimensions_unit')
    op.drop_column('products', 'processing_min')
    op.drop_column('products', 'processing_max')
    
    # Remove shop Etsy configuration
    op.drop_column('shops', 'default_shipping_profile_id')
    op.drop_column('shops', 'default_return_policy_id')
    op.drop_column('shops', 'shop_section_id')
    op.drop_column('shops', 'shop_data')
    
    # Remove order enhancements
    op.drop_index('idx_orders_synced_at', 'orders')
    op.drop_index('idx_orders_etsy_status', 'orders')
    op.drop_index('idx_orders_status_shop', 'orders')
    op.drop_index('idx_orders_etsy_receipt_id', 'orders')
    
    op.drop_column('orders', 'synced_at')
    op.drop_column('orders', 'etsy_updated_at')
    op.drop_column('orders', 'etsy_created_at')
    op.drop_column('orders', 'gift_message')
    op.drop_column('orders', 'is_gift')
    op.drop_column('orders', 'message_from_buyer')
    op.drop_column('orders', 'supplier_status')
    op.drop_column('orders', 'shipments')
    op.drop_column('orders', 'line_items')
    op.drop_column('orders', 'listing_fee')
    op.drop_column('orders', 'transaction_fee')
    op.drop_column('orders', 'currency')
    op.drop_column('orders', 'gift_wrap_price')
    op.drop_column('orders', 'discount_amt')
    op.drop_column('orders', 'total_tax_cost')
    op.drop_column('orders', 'total_shipping_cost')
    op.drop_column('orders', 'subtotal')
    op.drop_column('orders', 'shipping_country_iso')
    op.drop_column('orders', 'shipping_country')
    op.drop_column('orders', 'shipping_zip')
    op.drop_column('orders', 'shipping_state')
    op.drop_column('orders', 'shipping_city')
    op.drop_column('orders', 'shipping_second_line')
    op.drop_column('orders', 'shipping_first_line')
    op.drop_column('orders', 'shipping_name')
    op.drop_column('orders', 'buyer_name')
    op.drop_column('orders', 'buyer_user_id')
    op.drop_column('orders', 'etsy_status')
    
    # Restore old columns
    op.add_column('orders', sa.Column('tracking', postgresql.JSONB(), nullable=True))
    op.alter_column('orders', 'buyer_email', new_column_name='customer_email')
    
    # Restore old status constraint
    op.execute("""
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_status_check 
        CHECK (status IN ('new','submitted_to_supplier','fulfilled','failed'));
    """)
