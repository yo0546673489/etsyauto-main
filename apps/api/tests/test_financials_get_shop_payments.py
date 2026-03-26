"""
Tests for get_shop_payments integration and _sync_shop_payments_bulk.

Verifies that:
- get_shop_payments is called with correct params (limit 25, date range)
- _sync_shop_payments_bulk upserts PaymentDetail by etsy_payment_id
- Pagination works correctly
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

# Import the sync logic (module-level for patching)
from app.worker.tasks.financial_tasks import (
    _sync_shop_payments_bulk,
    _upsert_payment_from_raw,
)


@pytest.fixture
def mock_db():
    """Mock database session."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None  # No existing payment
    db.query.return_value.filter.return_value.all.return_value = []
    return db


@pytest.fixture
def mock_shop():
    """Mock Shop with required attributes."""
    shop = MagicMock()
    shop.id = 1
    shop.tenant_id = 1
    shop.etsy_shop_id = "12345"
    return shop


@pytest.fixture
def mock_etsy_client():
    """Mock EtsyClient with get_shop_payments."""
    client = MagicMock()
    client.get_shop_payments = AsyncMock(
        return_value={
            "count": 2,
            "results": [
                {
                    "payment_id": 1001,
                    "receipt_id": "r1",
                    "amount_gross": {"amount": 2500, "divisor": 100},
                    "amount_fees": {"amount": 150, "divisor": 100},
                    "amount_net": {"amount": 2350, "divisor": 100},
                    "currency": "USD",
                    "create_timestamp": 1700000000,
                },
                {
                    "payment_id": 1002,
                    "receipt_id": "r2",
                    "amount_gross": {"amount": 3000, "divisor": 100},
                    "amount_fees": {"amount": 180, "divisor": 100},
                    "amount_net": {"amount": 2820, "divisor": 100},
                    "currency": "USD",
                    "create_timestamp": 1700000100,
                },
            ],
        }
    )
    return client


class TestUpsertPaymentFromRaw:
    """Tests for _upsert_payment_from_raw."""

    def test_creates_payment_when_not_exists(self, mock_db, mock_shop):
        """PaymentDetail is created when etsy_payment_id not in DB."""
        mock_db.query.return_value.filter.return_value.first.return_value = None
        raw = {
            "payment_id": 1001,
            "receipt_id": "r1",
            "amount_gross": {"amount": 2500, "divisor": 100},
            "amount_fees": {"amount": 150, "divisor": 100},
            "amount_net": {"amount": 2350, "divisor": 100},
            "currency": "USD",
        }
        result = _upsert_payment_from_raw(mock_db, mock_shop, raw)
        assert result is True
        mock_db.add.assert_called_once()

    def test_skips_when_payment_exists(self, mock_db, mock_shop):
        """No create when etsy_payment_id already exists."""
        mock_db.query.return_value.filter.return_value.first.return_value = (1,)
        raw = {"payment_id": 1001, "receipt_id": "r1"}
        result = _upsert_payment_from_raw(mock_db, mock_shop, raw)
        assert result is False
        mock_db.add.assert_not_called()

    def test_accepts_id_as_payment_id_fallback(self, mock_db, mock_shop):
        """Raw with 'id' instead of 'payment_id' is accepted."""
        mock_db.query.return_value.filter.return_value.first.return_value = None
        raw = {
            "id": 1001,
            "receipt_id": "r1",
            "amount_gross": 2500,
            "amount_fees": 150,
            "amount_net": 2350,
            "currency": "USD",
        }
        result = _upsert_payment_from_raw(mock_db, mock_shop, raw)
        assert result is True
        mock_db.add.assert_called_once()

    def test_skips_when_no_receipt_id(self, mock_db, mock_shop):
        """Skips when receipt_id is missing."""
        mock_db.query.return_value.filter.return_value.first.return_value = None
        raw = {"payment_id": 1001, "amount_gross": 2500}
        result = _upsert_payment_from_raw(mock_db, mock_shop, raw)
        assert result is False
        mock_db.add.assert_not_called()


@pytest.mark.asyncio
class TestSyncShopPaymentsBulk:
    """Tests for _sync_shop_payments_bulk."""

    async def test_calls_get_shop_payments_with_date_range(
        self, mock_db, mock_shop, mock_etsy_client
    ):
        """get_shop_payments is called with min_created, max_created, limit 25."""
        mock_etsy_client.get_shop_payments.return_value = {"count": 0, "results": []}
        await _sync_shop_payments_bulk(mock_db, mock_etsy_client, mock_shop)
        call = mock_etsy_client.get_shop_payments.call_args
        assert call.kwargs["limit"] == 25
        assert "min_created" in call.kwargs
        assert "max_created" in call.kwargs
        assert call.kwargs["shop_id"] == 1
        assert call.kwargs["etsy_shop_id"] == "12345"

    async def test_upserts_payments_from_results(
        self, mock_db, mock_shop, mock_etsy_client
    ):
        """PaymentDetail records are created from getPayments results."""
        created = await _sync_shop_payments_bulk(mock_db, mock_etsy_client, mock_shop)
        assert created == 2
        assert mock_db.commit.call_count >= 1

    async def test_pagination_stops_when_empty_page(
        self, mock_db, mock_shop, mock_etsy_client
    ):
        """Stops pagination when results are empty."""
        mock_etsy_client.get_shop_payments.return_value = {"count": 0, "results": []}
        created = await _sync_shop_payments_bulk(mock_db, mock_etsy_client, mock_shop)
        assert created == 0
        assert mock_etsy_client.get_shop_payments.call_count >= 1
