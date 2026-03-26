"""
Currency Conversion Helper
Enriches API responses with converted values when user prefers a different currency.
"""
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.services.exchange_rate_service import convert_amount, SUPPORTED_CURRENCIES


def enrich_amount(
    amount_cents: int,
    original_currency: str,
    target_currency: str,
    as_of: Optional[datetime] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    Return dict with value_cents, currency, and optional converted block.
    If target == original, no conversion. Otherwise adds converted block.
    """
    result: Dict[str, Any] = {
        "value_cents": amount_cents,
        "currency": original_currency,
    }
    if target_currency != original_currency and target_currency in SUPPORTED_CURRENCIES:
        try:
            converted_cents, rate, retrieved, stale = convert_amount(
                amount_cents, original_currency, target_currency, as_of, db
            )
            result["converted"] = {
                "value_cents": converted_cents,
                "currency": target_currency,
                "rate": float(rate),
                "rate_as_of": retrieved.isoformat(),
                "rate_stale": stale,
            }
        except (ValueError, Exception):
            pass
    return result


def enrich_financial_response(
    data: Dict[str, Any],
    target_currency: str,
    db: Optional[Session] = None,
    as_of: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Enrich a financial response dict with converted values.
    Looks for numeric amount fields and 'currency' key.
    Adds converted_* fields or converted sub-dicts where applicable.
    """
    if not target_currency or target_currency not in SUPPORTED_CURRENCIES:
        return data
    orig = data.get("currency", "USD")
    if orig == target_currency:
        return data

    result = dict(data)
    # Monetary fields (in cents) to convert
    amount_fields = [
        "total_revenue", "total_fees", "total_refunds", "refunds", "net_profit",
        "current_balance", "reserve_held", "available_for_payout",
        "revenue", "refunds", "etsy_fees", "advertising_expenses",
        "product_costs", "invoice_expenses", "total_expenses",
        "total_discounts", "shipping_labels",
        "amount_gross", "amount_fees", "amount_net",
        "total_fees",
    ]
    try:
        for key in amount_fields:
            if key in result and isinstance(result[key], (int, float)):
                val = int(result[key])
                conv_cents, rate, retrieved, stale = convert_amount(
                    val, orig, target_currency, as_of, db
                )
                result[f"converted_{key}"] = conv_cents
        if "converted_" in str(result):
            result["converted_currency"] = target_currency
            result["original_currency"] = orig
    except Exception:
        pass
    return result


def enrich_analytics_overview(
    data: Dict[str, Any],
    target_currency: str,
    db: Optional[Session] = None,
    as_of: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Enrich analytics overview (dollar amounts) with converted values.
    Analytics returns total_revenue, revenue_7d, revenue_30d, avg_order_value in dollars.
    """
    if not target_currency or target_currency not in SUPPORTED_CURRENCIES:
        return data
    orig = data.get("currency", "USD")
    if orig == target_currency:
        return data

    result = dict(data)
    # Dollar amount fields to convert
    dollar_fields = ["total_revenue", "revenue_7d", "revenue_30d", "avg_order_value"]
    try:
        for key in dollar_fields:
            if key in result and isinstance(result[key], (int, float)):
                dollars = float(result[key])
                cents = int(round(dollars * 100))
                conv_cents, _, _, _ = convert_amount(
                    cents, orig, target_currency, as_of, db
                )
                result[f"converted_{key}"] = round(conv_cents / 100, 2)
        result["converted_currency"] = target_currency
        result["original_currency"] = orig
    except Exception:
        pass
    return result
