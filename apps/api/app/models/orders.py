"""
SQLAlchemy Models - Orders, Shipments, Usage Costs
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, Integer, DateTime,
    Boolean, ForeignKey, CheckConstraint, Index, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Order(Base):
    """Orders from Etsy"""
    __tablename__ = "orders"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, ForeignKey('tenants.id', ondelete="CASCADE"), nullable=False)
    shop_id = Column(BigInteger, ForeignKey('shops.id', ondelete="CASCADE"), nullable=False)

    etsy_receipt_id = Column(String(50), unique=True, nullable=False, index=True)

    # Order status
    status = Column(
        String(30),
        CheckConstraint("status IN ('pending','processing','shipped','delivered','cancelled','refunded')"),
        default='pending'
    )
    etsy_status = Column(String(50), nullable=True)  # Original Etsy status
    lifecycle_status = Column(
        String(30),
        CheckConstraint("lifecycle_status IN ('processing','in_transit','completed','cancelled','refunded')"),
        nullable=True
    )
    payment_status = Column(
        String(20),
        CheckConstraint("payment_status IN ('paid','unpaid')"),
        nullable=True
    )
    fulfillment_status = Column(
        String(20),
        CheckConstraint("fulfillment_status IN ('unshipped','shipped','delivered')"),
        nullable=True
    )

    # Buyer information
    buyer_user_id = Column(String(50), nullable=True)  # Etsy buyer user ID
    buyer_email = Column(String(255), nullable=True)
    buyer_name = Column(String(255), nullable=True)

    # Shipping address
    shipping_name = Column(String(255), nullable=True)
    shipping_first_line = Column(String(500), nullable=True)
    shipping_second_line = Column(String(500), nullable=True)
    shipping_city = Column(String(255), nullable=True)
    shipping_state = Column(String(255), nullable=True)
    shipping_zip = Column(String(50), nullable=True)
    shipping_country = Column(String(100), nullable=True)
    shipping_country_iso = Column(String(2), nullable=True)

    # Order financials (all in cents)
    subtotal = Column(Integer, nullable=True)  # Subtotal before tax/shipping
    total_price = Column(Integer, nullable=True)  # Grand total
    total_shipping_cost = Column(Integer, nullable=True)
    total_tax_cost = Column(Integer, nullable=True)
    discount_amt = Column(Integer, default=0)  # Total discount amount
    gift_wrap_price = Column(Integer, default=0)
    currency = Column(String(3), default='USD')

    # Transaction fees (if available)
    transaction_fee = Column(Integer, nullable=True)
    listing_fee = Column(Integer, nullable=True)

    # Line items (stored as JSONB array)
    line_items = Column(JSONB, nullable=True)  # Array of order items

    # Shipping/tracking (supports multiple shipments)
    shipments = Column(JSONB, nullable=True)  # Array of shipment objects

    # Supplier assignment (manual tracking)
    supplier_user_id = Column(BigInteger, ForeignKey('users.id', ondelete="SET NULL"), nullable=True, index=True)
    supplier_assigned_at = Column(DateTime(timezone=True), nullable=True)

    # Message to seller
    message_from_buyer = Column(Text, nullable=True)

    # Gift options
    is_gift = Column(Boolean, default=False)
    gift_message = Column(Text, nullable=True)

    # Timestamps
    etsy_created_at = Column(DateTime(timezone=True), nullable=True)  # Order creation on Etsy
    etsy_updated_at = Column(DateTime(timezone=True), nullable=True)  # Last update on Etsy
    synced_at = Column(DateTime(timezone=True), nullable=True)  # Last sync from Etsy

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_orders_status_shop', 'shop_id', 'status'),
        Index('idx_orders_etsy_status', 'etsy_status'),
        Index('idx_orders_lifecycle_status', 'lifecycle_status'),
        Index('idx_orders_payment_status', 'payment_status'),
        Index('idx_orders_fulfillment_status', 'fulfillment_status'),
        Index('idx_orders_synced_at', 'synced_at'),
        Index('idx_orders_supplier_user', 'supplier_user_id'),
    )


class ShipmentEvent(Base):
    """
    Shipment event history for analytics and tracking lineage
    Records all shipment state transitions with full context
    """
    __tablename__ = "shipment_events"

    id = Column(BigInteger, primary_key=True, index=True)
    order_id = Column(BigInteger, ForeignKey('orders.id', ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(BigInteger, ForeignKey('tenants.id', ondelete="CASCADE"), nullable=False, index=True)
    shop_id = Column(BigInteger, ForeignKey('shops.id', ondelete="CASCADE"), nullable=False)

    # Canonical shipment state
    state = Column(
        String(20),
        CheckConstraint("state IN ('processing','shipped','in_transit','delivered','delayed','cancelled')"),
        nullable=False,
        index=True
    )
    previous_state = Column(String(20), nullable=True)  # For state transition tracking

    # Tracking details
    tracking_code = Column(String(255), nullable=True, index=True)
    carrier_name = Column(String(100), nullable=True)
    tracking_url = Column(String(500), nullable=True)

    # Event context
    source = Column(
        String(20),
        CheckConstraint("source IN ('manual','etsy_sync','auto')"),
        nullable=False,
        index=True
    )
    actor_user_id = Column(BigInteger, ForeignKey('users.id', ondelete="SET NULL"), nullable=True, index=True)
    actor_role = Column(String(20), nullable=True)

    # Timestamps
    event_timestamp = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)  # When shipment started
    delivered_at = Column(DateTime(timezone=True), nullable=True)  # When delivered

    # Additional metadata
    notes = Column(Text, nullable=True)
    event_metadata = Column(JSONB, nullable=True)  # Extra event data

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index('idx_shipment_events_order_state', 'order_id', 'state'),
        Index('idx_shipment_events_tenant_timestamp', 'tenant_id', 'event_timestamp'),
        Index('idx_shipment_events_state_timestamp', 'state', 'event_timestamp'),
    )


class UsageCost(Base):
    """Daily usage and cost tracking"""
    __tablename__ = "usage_costs"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, ForeignKey('tenants.id', ondelete="CASCADE"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)

    ai_tokens = Column(Integer, default=0)
    ai_cost_usd_cents = Column(Integer, default=0)
    api_calls = Column(JSONB)
    storage_bytes = Column(BigInteger, default=0)

    __table_args__ = (
        UniqueConstraint('tenant_id', 'date', name='uq_tenant_date'),
    )
