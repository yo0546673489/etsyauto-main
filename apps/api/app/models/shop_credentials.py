"""
ShopCredential — private list of shop details managed by the tenant.
Stores raw credentials, proxies, bank info, etc. Independent of the Etsy
OAuth-connected Shop model (does not require an Etsy connection).
"""
from datetime import datetime
from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    String,
    Text,
    DateTime,
    Index,
)
from sqlalchemy.sql import func

from app.core.database import Base


class ShopCredential(Base):
    __tablename__ = "shop_credentials"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, nullable=False, index=True)
    shop_number = Column(Integer, nullable=True)

    # Identity
    name = Column(String(255), nullable=True)              # שם בעלים
    email = Column(String(255), nullable=True)             # מייל
    former_email = Column(String(255), nullable=True)      # מייל לשעבר

    # Passwords
    password = Column(String(255), nullable=True)          # סיסמה כללית
    etsy_password = Column(String(255), nullable=True)     # סיסמה באטסי

    # Contact
    phone = Column(String(50), nullable=True)              # טלפון מחובר

    # Financial
    credit_card = Column(String(100), nullable=True)       # מס' אשראי
    bank = Column(String(100), nullable=True)              # בנק

    # Network
    proxy = Column(String(100), nullable=True)             # פרוקסי / IP

    # Other
    ebay = Column(String(100), nullable=True)              # איביי
    notes = Column(Text, nullable=True)                    # הערות

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_shop_credentials_tenant_shop_number", "tenant_id", "shop_number"),
    )
