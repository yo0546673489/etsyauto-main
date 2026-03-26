"""
Exchange Rate Model
Stores fetched exchange rates with timestamps for currency conversion.
"""
from sqlalchemy import Column, String, Numeric, DateTime, Index

from app.core.database import Base


class ExchangeRate(Base):
    """Cached exchange rates from external API"""
    __tablename__ = "exchange_rates"

    base_currency = Column(String(3), primary_key=True)
    target_currency = Column(String(3), primary_key=True)
    rate = Column(Numeric(24, 12), nullable=False)
    retrieved_at = Column(DateTime(timezone=True), primary_key=True)
    source = Column(String(50), nullable=True, server_default="api")

    __table_args__ = (
        Index("idx_exchange_rates_lookup", "base_currency", "target_currency", "retrieved_at"),
    )
