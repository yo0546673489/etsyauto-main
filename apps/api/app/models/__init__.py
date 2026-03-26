"""
SQLAlchemy Models Package
Import all models to ensure they're registered with Base.metadata
"""
# Import all models to ensure SQLAlchemy relationships can be resolved
from app.models.tenancy import Tenant, User, Membership, SupplierProfile, Shop, OAuthToken
from app.models.user_preferences import UserPreference
from app.models.exchange_rates import ExchangeRate
from app.models.products import Product
from app.models.orders import Order, ShipmentEvent, UsageCost
from app.models.financials import (
    LedgerEntryTypeRegistry, LedgerEntry, ShopFinancialState,
    PaymentDetail, ExpenseInvoice, ExpenseLineItem, FinancialSyncStatus,
)
from app.models.audit import AuditLog
from app.models.webhooks import WebhookEvent
from app.models.notifications import Notification, NotificationType
from app.models.ingestion import IngestionBatch
from app.models.messaging_access_token import MessagingAccessToken

# Make models available at package level
__all__ = [
    # Tenancy models
    "Tenant",
    "User",
    "UserPreference",
    "ExchangeRate",
    "Membership",
    "SupplierProfile",
    "Shop",
    "OAuthToken",
    # Product models
    "Product",
    # Order models
    "Order",
    "ShipmentEvent",
    "UsageCost",
    # Financial models
    "LedgerEntryTypeRegistry",
    "LedgerEntry",
    "ShopFinancialState",
    "PaymentDetail",
    "ExpenseInvoice",
    "ExpenseLineItem",
    "FinancialSyncStatus",
    # Audit models
    "AuditLog",
    # Webhook models
    "WebhookEvent",
    # Notification models
    "Notification",
    "NotificationType",
    # Ingestion models
    "IngestionBatch",
    "MessagingAccessToken",
]
