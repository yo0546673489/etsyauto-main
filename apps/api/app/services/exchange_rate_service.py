"""
Exchange Rate Service
Fetches, caches, and provides exchange rates for currency conversion.
Uses Frankfurter API (free, no key required) with Redis and DB fallback.
"""
import json
import logging
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict, Any, Tuple

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.config import settings
from app.core.redis import get_redis_client
from app.models.exchange_rates import ExchangeRate

logger = logging.getLogger(__name__)

# Supported ISO 4217 currencies (common + Etsy-supported)
SUPPORTED_CURRENCIES = frozenset([
    "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "MXN",
    "BRL", "KRW", "ILS", "ZAR", "PLN", "SEK", "NOK", "DKK", "HKD", "SGD",
    "NZD", "THB", "IDR", "MYR", "PHP", "CZK", "HUF", "RON", "BGN", "TRY",
    "RUB", "AED", "SAR", "CLP", "COP", "PEN", "EGP", "UAH",
])

CACHE_TTL_LATEST = 86400  # 24 hours
CACHE_TTL_HISTORICAL = 604800  # 7 days
CACHE_PREFIX = "exchange_rate"


def _cache_key(base: str, target: str, as_of: Optional[date]) -> str:
    """Generate Redis cache key."""
    date_str = as_of.isoformat() if as_of else "latest"
    return f"{CACHE_PREFIX}:{base}:{target}:{date_str}"


def _validate_currency(code: str) -> None:
    """Validate currency code is supported."""
    if code not in SUPPORTED_CURRENCIES:
        raise ValueError(f"Unsupported currency: {code}. Supported: {sorted(SUPPORTED_CURRENCIES)}")


def fetch_latest_rates(base: str = "USD") -> Dict[str, float]:
    """
    Fetch latest exchange rates from Frankfurter API.
    Returns dict of target_currency -> rate (base -> target).
    """
    _validate_currency(base)
    url = f"{settings.EXCHANGE_RATE_API_URL}/latest"
    params = {"base": base}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        rates = data.get("rates", {})
        logger.info("Fetched %d rates for base %s from Frankfurter API", len(rates), base)
        return {k: float(v) for k, v in rates.items()}
    except Exception as e:
        logger.warning("Exchange rate fetch failed for base %s: %s", base, e)
        raise


def fetch_historical_rate(base: str, target: str, as_of: date) -> Optional[Decimal]:
    """
    Fetch historical exchange rate from Frankfurter API.
    Returns rate (base -> target) or None if not available.
    """
    _validate_currency(base)
    _validate_currency(target)
    if base == target:
        return Decimal("1")
    url = f"{settings.EXCHANGE_RATE_API_URL}/{as_of.isoformat()}"
    params = {"base": base, "symbols": target}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        rates = data.get("rates", {})
        if target in rates:
            return Decimal(str(rates[target]))
        return None
    except Exception as e:
        logger.warning("Historical rate fetch failed for %s->%s on %s: %s", base, target, as_of, e)
        return None


def get_rate(
    base: str,
    target: str,
    as_of: Optional[datetime] = None,
    db: Optional[Session] = None,
) -> Tuple[Decimal, datetime, bool]:
    """
    Get exchange rate for base->target. Uses Redis cache, then DB, then API.
    Returns (rate, rate_timestamp, rate_stale).
    rate_stale=True if we fell back to last known rate.
    """
    if base == target:
        return Decimal("1"), datetime.now(timezone.utc), False
    _validate_currency(base)
    _validate_currency(target)

    as_of_date = as_of.date() if as_of else None
    redis_key = _cache_key(base, target, as_of_date)

    # 1. Try Redis cache
    try:
        redis_client = get_redis_client()
        cached = redis_client.get(redis_key)
        if cached:
            data = json.loads(cached)
            return (
                Decimal(str(data["rate"])),
                datetime.fromisoformat(data["retrieved_at"].replace("Z", "+00:00")),
                False,
            )
    except Exception as e:
        logger.debug("Redis cache read failed: %s", e)

    # 2. Try DB
    if db:
        try:
            query = (
                db.query(ExchangeRate)
                .filter(
                    ExchangeRate.base_currency == base,
                    ExchangeRate.target_currency == target,
                )
                .order_by(desc(ExchangeRate.retrieved_at))
            )
            if as_of_date:
                query = query.filter(ExchangeRate.retrieved_at <= datetime.combine(as_of_date, datetime.max.time(), tzinfo=timezone.utc))
            row = query.first()
            if row:
                rate = Decimal(str(row.rate))
                retrieved = row.retrieved_at
                # Cache in Redis
                try:
                    redis_client = get_redis_client()
                    ttl = CACHE_TTL_HISTORICAL if as_of_date else CACHE_TTL_LATEST
                    redis_client.setex(
                        redis_key,
                        ttl,
                        json.dumps({"rate": str(rate), "retrieved_at": retrieved.isoformat()}),
                    )
                except Exception:
                    pass
                return rate, retrieved, False
        except Exception as e:
            logger.debug("DB rate lookup failed: %s", e)

    # 3. Fetch from API
    try:
        if as_of_date:
            rate = fetch_historical_rate(base, target, as_of_date)
            if rate is None:
                # Fallback: try latest
                rates = fetch_latest_rates(base)
                if target in rates:
                    rate = Decimal(str(rates[target]))
                    retrieved = datetime.now(timezone.utc)
                    return rate, retrieved, True
                raise ValueError(f"No rate for {base}->{target}")
            retrieved = datetime.combine(as_of_date, datetime.min.time(), tzinfo=timezone.utc)
        else:
            rates = fetch_latest_rates(base)
            if target not in rates:
                raise ValueError(f"No rate for {base}->{target}")
            rate = Decimal(str(rates[target]))
            retrieved = datetime.now(timezone.utc)

        # Store in DB
        if db:
            try:
                er = ExchangeRate(
                    base_currency=base,
                    target_currency=target,
                    rate=rate,
                    retrieved_at=retrieved,
                    source="frankfurter",
                )
                db.add(er)
                db.commit()
            except Exception as e:
                logger.debug("Failed to store rate in DB: %s", e)
                if db:
                    db.rollback()

        # Cache in Redis
        try:
            redis_client = get_redis_client()
            ttl = CACHE_TTL_HISTORICAL if as_of_date else CACHE_TTL_LATEST
            redis_client.setex(
                redis_key,
                ttl,
                json.dumps({"rate": str(rate), "retrieved_at": retrieved.isoformat()}),
            )
        except Exception:
            pass

        return rate, retrieved, False
    except Exception as e:
        # 4. Last resort: try DB for any rate (fallback)
        if db:
            try:
                row = (
                    db.query(ExchangeRate)
                    .filter(
                        ExchangeRate.base_currency == base,
                        ExchangeRate.target_currency == target,
                    )
                    .order_by(desc(ExchangeRate.retrieved_at))
                    .first()
                )
                if row:
                    logger.warning(
                        "Using last known rate for %s->%s (API failed). Rate: %s, as_of: %s",
                        base, target, row.rate, row.retrieved_at,
                    )
                    return Decimal(str(row.rate)), row.retrieved_at, True
            except Exception:
                pass
        raise ValueError(f"Could not get exchange rate for {base}->{target}")


def convert_amount(
    amount_cents: int,
    from_currency: str,
    to_currency: str,
    as_of: Optional[datetime] = None,
    db: Optional[Session] = None,
) -> Tuple[int, Decimal, datetime, bool]:
    """
    Convert amount from one currency to another.
    amount_cents: value in smallest unit (cents)
    Returns (converted_cents, rate, rate_timestamp, rate_stale).
    """
    if from_currency == to_currency:
        return amount_cents, Decimal("1"), datetime.now(timezone.utc), False
    rate, retrieved, stale = get_rate(from_currency, to_currency, as_of, db)
    # amount_cents / 100 * rate -> convert to target currency
    # Use Decimal for precision
    amount_decimal = Decimal(amount_cents) / 100 * rate
    converted_cents = int((amount_decimal * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return converted_cents, rate, retrieved, stale
