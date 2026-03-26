"""
SQLAlchemy Models - Financial: Ledger, Payments, Expenses
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, Integer, DateTime,
    Boolean, ForeignKey, CheckConstraint, Index, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class LedgerEntryTypeRegistry(Base):
    """Discovery engine for ledger entry types. Manual mapping of entry_type -> category."""
    __tablename__ = "ledger_entry_type_registry"

    entry_type = Column(Text, primary_key=True)
    category = Column(Text, nullable=True)  # sales, fees, marketing, refunds, adjustments, other
    first_seen_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    mapped = Column(Boolean, default=False, nullable=False)


class LedgerEntry(Base):
    """Etsy Shop Ledger entries — raw storage, category from registry join"""
    __tablename__ = "ledger_entries"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)

    etsy_entry_id = Column(BigInteger, unique=True, nullable=False, index=True)
    etsy_ledger_id = Column(BigInteger, nullable=False)

    # Raw Etsy value (ledger_type or description); category comes from registry join
    entry_type = Column(String(255), nullable=True, index=True)
    category = Column(Text, nullable=True)  # Denormalized from registry; nullable at insert
    description = Column(Text, nullable=True)

    # All monetary values in cents (positive = credit, negative = debit)
    amount = Column(Integer, nullable=False)
    balance = Column(Integer, nullable=False)  # Running balance after this entry
    currency = Column(String(3), default="USD")

    # Link to order if this entry relates to a receipt
    etsy_receipt_id = Column(String(50), nullable=True, index=True)

    entry_created_at = Column(DateTime(timezone=True), nullable=False)
    created_timestamp = Column(BigInteger, nullable=True)  # Unix epoch for date-range queries
    raw_payload = Column(JSONB, nullable=True)  # Full Etsy API response
    synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_ledger_tenant_shop_date", "tenant_id", "shop_id", "entry_created_at"),
    )


class ShopFinancialState(Base):
    """Shop payment account state from Etsy payment-account endpoint (or derived from ledger)."""
    __tablename__ = "shop_financial_state"

    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), primary_key=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    balance = Column(Integer, nullable=False, server_default="0")  # cents
    available_for_payout = Column(Integer, nullable=False, server_default="0")  # cents
    currency_code = Column(String(3), nullable=False, server_default="USD")
    reserve_amount = Column(Integer, nullable=True)  # cents
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_shop_financial_state_updated", "updated_at"),
    )


class PaymentDetail(Base):
    """Etsy Payment breakdown per order — finalized after shipping"""
    __tablename__ = "payment_details"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=True)

    etsy_payment_id = Column(BigInteger, unique=True, nullable=False, index=True)
    etsy_receipt_id = Column(String(50), nullable=False, index=True)

    # All values in cents
    amount_gross = Column(Integer, nullable=False)      # Total buyer paid
    amount_fees = Column(Integer, nullable=False)       # Processing fees
    amount_net = Column(Integer, nullable=False)        # gross - fees
    posted_gross = Column(Integer, nullable=True)       # Value posted to ledger upon shipping
    adjusted_gross = Column(Integer, nullable=True)     # After refunds
    adjusted_fees = Column(Integer, nullable=True)      # Fees after refund adjustments
    adjusted_net = Column(Integer, nullable=True)       # Final net after all adjustments
    currency = Column(String(3), default="USD")

    posted_at = Column(DateTime(timezone=True), nullable=True)
    synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_payment_tenant_shop", "tenant_id", "shop_id"),
    )


class ExpenseInvoice(Base):
    """Uploaded expense invoices for product cost tracking"""
    __tablename__ = "expense_invoices"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="SET NULL"), nullable=True)
    uploaded_by_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    file_type = Column(String(20), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    vendor_name = Column(Text, nullable=True)
    invoice_date = Column(DateTime(timezone=True), nullable=True)
    total_amount = Column(Integer, nullable=True)  # cents
    currency = Column(String(3), default="USD")
    category = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(
        String(20),
        CheckConstraint("status IN ('pending','approved','rejected')"),
        default="pending",
        nullable=False,
    )
    parsed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    line_items = relationship("ExpenseLineItem", back_populates="invoice", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_expense_invoices_tenant_shop", "tenant_id", "shop_id"),
    )


class ExpenseLineItem(Base):
    """Parsed line items from an expense invoice"""
    __tablename__ = "expense_line_items"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    invoice_id = Column(BigInteger, ForeignKey("expense_invoices.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Integer, nullable=False)  # cents
    category = Column(String(50), nullable=True)
    quantity = Column(Integer, default=1)

    invoice = relationship("ExpenseInvoice", back_populates="line_items")

    __table_args__ = (
        Index("idx_expense_line_items_invoice", "invoice_id"),
    )


class FinancialSyncStatus(Base):
    """Tracks last sync timestamps for ledger and payment data per shop.
    Enables sync status API and 'last updated' UI without querying large tables."""
    __tablename__ = "financial_sync_status"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)

    ledger_last_sync_at = Column(DateTime(timezone=True), nullable=True)
    payment_last_sync_at = Column(DateTime(timezone=True), nullable=True)
    ledger_last_error = Column(Text, nullable=True)
    payment_last_error = Column(Text, nullable=True)
    has_auth_error = Column(Boolean, nullable=True, default=False)  # True when token refresh fails / 401

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("shop_id", name="uq_financial_sync_status_shop_id"),
        Index("idx_financial_sync_status_tenant_shop", "tenant_id", "shop_id"),
    )
