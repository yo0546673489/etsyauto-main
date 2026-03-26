"""
Celery Tasks for Exchange Rate Fetching
Fetches daily exchange rates and stores in DB for currency conversion.
"""
import logging
from datetime import datetime, timezone

from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.exchange_rate_service import fetch_latest_rates, SUPPORTED_CURRENCIES
from app.models.exchange_rates import ExchangeRate

logger = logging.getLogger(__name__)

# Currencies to pre-fetch (most common for Etsy sellers)
PRIMARY_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "ILS", "JPY", "MXN", "BRL"]


@celery_app.task(name="app.worker.tasks.exchange_rate_tasks.fetch_daily_exchange_rates")
def fetch_daily_exchange_rates() -> dict:
    """
    Fetch latest exchange rates for primary currencies and store in DB.
    Runs daily via Celery Beat. Uses USD as base (Etsy default).
    """
    db = SessionLocal()
    try:
        results = {"fetched": 0, "errors": []}
        now = datetime.now(timezone.utc)

        for base in ["USD"]:  # USD as primary base
            try:
                rates = fetch_latest_rates(base)
                for target, rate_val in rates.items():
                    if target not in SUPPORTED_CURRENCIES:
                        continue
                    try:
                        er = ExchangeRate(
                            base_currency=base,
                            target_currency=target,
                            rate=rate_val,
                            retrieved_at=now,
                            source="frankfurter",
                        )
                        db.add(er)
                        results["fetched"] += 1
                    except Exception as e:
                        results["errors"].append(f"{base}->{target}: {e}")
                db.commit()
            except Exception as e:
                logger.exception("Failed to fetch rates for base %s", base)
                results["errors"].append(f"base {base}: {e}")
                db.rollback()

        logger.info("Exchange rate fetch complete: %d rates stored", results["fetched"])
        return results
    finally:
        db.close()
