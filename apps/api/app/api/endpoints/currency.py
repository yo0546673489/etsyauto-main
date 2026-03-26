"""
Currency Conversion API
Provides exchange rates and conversion endpoints.
"""
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from decimal import Decimal

from app.api.dependencies import get_user_context
from app.core.database import get_db
from app.services.exchange_rate_service import (
    get_rate,
    convert_amount,
    SUPPORTED_CURRENCIES,
)

router = APIRouter()


class ConvertResponse(BaseModel):
    from_: dict = Field(..., alias="from", description="Original value and currency")
    to: dict
    rate: float
    timestamp: str
    rate_stale: bool = False


@router.get("/convert", response_model=ConvertResponse, tags=["Currency"])
def convert_currency(
    from_currency: str = Query(..., description="Source currency code"),
    to_currency: str = Query(..., description="Target currency code"),
    amount: int = Query(..., description="Amount in cents (smallest unit)"),
    date_param: str | None = Query(None, alias="date", description="Optional date (YYYY-MM-DD) for historical rate"),
    context=Depends(get_user_context),
    db: Session = Depends(get_db),
):
    """
    Convert amount from one currency to another.
    Returns original and converted values with rate metadata.
    """
    from_currency = from_currency.upper().strip()
    to_currency = to_currency.upper().strip()
    if from_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, f"Unsupported from_currency: {from_currency}")
    if to_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, f"Unsupported to_currency: {to_currency}")

    as_of = None
    if date_param:
        try:
            as_of = datetime.strptime(date_param, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")

    try:
        converted_cents, rate, retrieved, stale = convert_amount(
            amount, from_currency, to_currency, as_of, db
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    from_value_dollars = amount / 100
    to_value_dollars = converted_cents / 100

    return ConvertResponse(
        from_={"value": from_value_dollars, "currency": from_currency},
        to={"value": to_value_dollars, "currency": to_currency},
        rate=float(rate),
        timestamp=retrieved.isoformat(),
        rate_stale=stale,
    )


@router.get("/supported", tags=["Currency"])
def get_supported_currencies(
    context=Depends(get_user_context),
):
    """Return list of supported ISO 4217 currency codes."""
    return {"currencies": sorted(SUPPORTED_CURRENCIES)}
