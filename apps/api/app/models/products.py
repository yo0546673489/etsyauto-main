"""
SQLAlchemy Models - Products
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, Integer, DateTime,
    Boolean, ForeignKey, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Product(Base):
    """Products to be listed on Etsy"""
    __tablename__ = "products"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, ForeignKey('tenants.id', ondelete="CASCADE"), nullable=False)
    shop_id = Column(BigInteger, ForeignKey('shops.id', ondelete="SET NULL"), nullable=True, index=True)
    etsy_listing_id = Column(String(50), nullable=True, index=True)

    # Raw product data
    sku = Column(String(255), nullable=True, index=True)  # Product SKU
    title_raw = Column(Text)
    description_raw = Column(Text)
    tags_raw = Column(JSONB)
    images = Column(JSONB)
    variants = Column(JSONB)

    price = Column(Integer)
    compare_at_price = Column(Integer)
    cost_usd_cents = Column(Integer, default=0)  # Supplier/wholesale unit cost (USD cents) for COGS
    quantity = Column(Integer, nullable=True)  # Available quantity

    # Etsy-specific fields
    taxonomy_id = Column(Integer, nullable=True)  # Etsy category/taxonomy ID
    materials = Column(JSONB, nullable=True)  # List of materials used
    who_made = Column(String(50), default='i_did')  # i_did, someone_else, collective
    when_made = Column(String(50), default='made_to_order')  # made_to_order, 2020_2024, etc.
    is_supply = Column(Boolean, default=False)  # Is it a craft supply?
    is_customizable = Column(Boolean, default=False)
    is_personalizable = Column(Boolean, default=False)
    personalization_instructions = Column(Text, nullable=True)

    # Dimensions and weight
    item_weight = Column(Integer, nullable=True)  # Weight value
    item_weight_unit = Column(String(10), default='oz')  # oz, lb, g, kg
    item_length = Column(Integer, nullable=True)
    item_width = Column(Integer, nullable=True)
    item_height = Column(Integer, nullable=True)
    item_dimensions_unit = Column(String(10), default='in')  # in, ft, mm, cm, m

    # Processing time
    processing_min = Column(Integer, default=1)  # Days
    processing_max = Column(Integer, default=3)  # Days

    # Import tracking
    source = Column(String(50), CheckConstraint("source IN ('csv','json','api','manual','etsy')"), default='manual')
    ingest_batch_id = Column(String(255))

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
