"""
Tests for currency conversion and exchange rate service.
"""
import pytest
from decimal import Decimal
from unittest.mock import patch

from app.services.exchange_rate_service import (
    convert_amount,
    SUPPORTED_CURRENCIES,
    _validate_currency,
)


class TestValidateCurrency:
    def test_valid_currency(self):
        _validate_currency("USD")
        _validate_currency("EUR")
        _validate_currency("ILS")

    def test_invalid_currency_raises(self):
        with pytest.raises(ValueError, match="Unsupported currency"):
            _validate_currency("XXX")
        with pytest.raises(ValueError, match="Unsupported currency"):
            _validate_currency("ZZZ")


class TestConvertAmount:
    def test_same_currency_returns_unchanged(self):
        converted, rate, _, stale = convert_amount(1000, "USD", "USD", db=None)
        assert converted == 1000
        assert rate == Decimal("1")
        assert stale is False

    @patch("app.services.exchange_rate_service.get_redis_client")
    @patch("app.services.exchange_rate_service.fetch_latest_rates")
    def test_conversion_usd_to_eur(self, mock_fetch, mock_redis):
        mock_redis.return_value.get.return_value = None  # Cache miss
        mock_fetch.return_value = {"EUR": 0.92}
        converted, rate, _, stale = convert_amount(
            1000, "USD", "EUR", db=None
        )
        assert converted == 920  # 10 USD * 0.92 = 9.20 EUR = 920 cents
        assert rate == Decimal("0.92")
        assert stale is False

    @patch("app.services.exchange_rate_service.get_redis_client")
    @patch("app.services.exchange_rate_service.fetch_latest_rates")
    def test_conversion_rounding(self, mock_fetch, mock_redis):
        mock_redis.return_value.get.return_value = None
        mock_fetch.return_value = {"EUR": 0.923456}
        converted, _, _, _ = convert_amount(1000, "USD", "EUR", db=None)
        assert converted == 923  # ROUND_HALF_UP
