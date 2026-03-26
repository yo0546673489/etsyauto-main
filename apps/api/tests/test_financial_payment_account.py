"""
Tests for payment account sync and shop_financial_state.
- _normalize_etsy_money: divisor normalization
- get_payout_estimate: shop_financial_state primary, ledger fallback
- Reserve scenario: balance=1000, reserve=400 -> available_for_payout=600
- Profit aggregation unchanged after payout source change (Phase 8)
- currency_mismatch integrity guard (Phase 7)
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.worker.tasks.financial_tasks import _normalize_etsy_money, _sync_shop_payment_account
from app.services.financial_service import FinancialService
from app.models.financials import ShopFinancialState, LedgerEntry, LedgerEntryTypeRegistry
from app.models.tenancy import Shop


class TestNormalizeEtsyMoney:
    """Unit tests for _normalize_etsy_money."""

    def test_dict_with_divisor_100(self):
        """USD: amount=1000, divisor=100 -> 1000 cents ($10.00)."""
        obj = {"amount": 1000, "divisor": 100, "currency_code": "USD"}
        assert _normalize_etsy_money(obj) == 1000

    def test_dict_amount_only_default_divisor(self):
        """Default divisor 100: amount=500 -> 500 cents."""
        obj = {"amount": 500}
        assert _normalize_etsy_money(obj) == 500

    def test_dict_divisor_1000(self):
        """Non-USD: amount=10000, divisor=1000 -> 1000 cents."""
        obj = {"amount": 10000, "divisor": 1000}
        assert _normalize_etsy_money(obj) == 1000

    def test_raw_int(self):
        """Raw int (already cents) -> unchanged."""
        assert _normalize_etsy_money(1234) == 1234

    def test_none(self):
        """None -> 0."""
        assert _normalize_etsy_money(None) == 0

    def test_reserve_scenario(self):
        """balance=1000 ($10), reserve=400 ($4) -> available=600 ($6)."""
        balance = _normalize_etsy_money({"amount": 1000, "divisor": 100})
        reserve = _normalize_etsy_money({"amount": 400, "divisor": 100})
        available = balance - reserve
        assert balance == 1000
        assert reserve == 400
        assert available == 600


class TestGetPayoutEstimate:
    """Integration tests for get_payout_estimate with shop_financial_state."""

    def test_uses_shop_financial_state_when_present(self, db, tenant, shop):
        """When shop_financial_state exists, use it for balance and available_for_payout."""
        state = ShopFinancialState(
            shop_id=shop.id,
            balance=1000,
            available_for_payout=600,
            currency_code="USD",
            reserve_amount=400,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(state)
        db.commit()

        svc = FinancialService(db)
        result = svc.get_payout_estimate(tenant_id=tenant.id, shop_id=shop.id)

        assert result["current_balance"] == 1000
        assert result["available_for_payout"] == 600
        assert result["reserve_held"] == 400
        assert result["currency"] == "USD"
        assert "recent_payouts" in result

    def test_fallback_to_ledger_when_no_shop_financial_state(self, db, tenant, shop):
        """When no shop_financial_state, fallback to ledger (returns zeros if no ledger)."""
        svc = FinancialService(db)
        result = svc.get_payout_estimate(tenant_id=tenant.id, shop_id=shop.id)

        assert "current_balance" in result
        assert "available_for_payout" in result
        assert result["currency"] == "USD"

    def test_multi_currency_cad_stored_and_returned(self, db, tenant, shop):
        """Multi-currency (e.g. CAD) stored and returned correctly."""
        state = ShopFinancialState(
            shop_id=shop.id,
            balance=15000,  # 150.00 CAD in cents
            available_for_payout=12000,
            currency_code="CAD",
            reserve_amount=3000,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(state)
        db.commit()

        svc = FinancialService(db)
        result = svc.get_payout_estimate(tenant_id=tenant.id, shop_id=shop.id)

        assert result["current_balance"] == 15000
        assert result["available_for_payout"] == 12000
        assert result["currency"] == "CAD"

    def test_currency_from_shop_financial_state_when_present(self, db, tenant, shop):
        """When shop_financial_state exists, currency comes from it (not ledger)."""
        state = ShopFinancialState(
            shop_id=shop.id,
            balance=1000,
            available_for_payout=600,
            currency_code="CAD",
            reserve_amount=400,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(state)
        entry = LedgerEntry(
            tenant_id=tenant.id,
            shop_id=shop.id,
            etsy_entry_id=999001,
            etsy_ledger_id=888001,
            entry_type="sale",
            amount=500,
            balance=500,
            currency="USD",
            entry_created_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        db.commit()

        svc = FinancialService(db)
        result = svc.get_payout_estimate(tenant_id=tenant.id, shop_id=shop.id)

        assert result["currency"] == "CAD"

    def test_profit_aggregation_unchanged_by_payout_source(self, db, tenant, shop):
        """Phase 8: Profit aggregation unchanged after payout source change (ledger-only)."""
        # Ensure sale is mapped
        reg = db.query(LedgerEntryTypeRegistry).filter(
            LedgerEntryTypeRegistry.entry_type == "sale"
        ).first()
        if not reg:
            reg = LedgerEntryTypeRegistry(
                entry_type="sale",
                category="sales",
                mapped=True,
            )
            db.add(reg)
            db.commit()

        now = datetime.now(timezone.utc)
        entry = LedgerEntry(
            tenant_id=tenant.id,
            shop_id=shop.id,
            etsy_entry_id=999002,
            etsy_ledger_id=888002,
            entry_type="sale",
            amount=1000,
            balance=1000,
            currency="USD",
            entry_created_at=now,
        )
        db.add(entry)
        db.commit()

        svc = FinancialService(db)
        pnl_before = svc.get_profit_and_loss(tenant_id=tenant.id, shop_id=shop.id)

        # Add shop_financial_state (payout source change)
        state = ShopFinancialState(
            shop_id=shop.id,
            balance=5000,
            available_for_payout=4000,
            currency_code="USD",
            reserve_amount=1000,
            updated_at=now,
        )
        db.add(state)
        db.commit()

        pnl_after = svc.get_profit_and_loss(tenant_id=tenant.id, shop_id=shop.id)

        # Profit remains ledger-based; net_profit unchanged
        assert pnl_before["net_profit"] == pnl_after["net_profit"]
        assert pnl_before["total_revenue"] == pnl_after["total_revenue"]


class TestSyncPaymentAccountState:
    """Integration: Mock get_shop_payment_account; assert shop_financial_state updated."""

    @pytest.mark.asyncio
    async def test_sync_updates_shop_financial_state(self, db, tenant, shop_with_oauth):
        """Phase 8: Mock get_shop_payment_account; assert shop_financial_state updated."""
        from app.services.etsy_client import EtsyClient
        etsy_client = EtsyClient(db)

        mock_response = {
            "balance": {"amount": 1500, "divisor": 100, "currency_code": "USD"},
            "available_for_payout": {"amount": 1200, "divisor": 100, "currency_code": "USD"},
            "reserve_amount": {"amount": 300, "divisor": 100, "currency_code": "USD"},
            "currency_code": "USD",
        }

        with patch.object(
            etsy_client,
            "get_payment_account",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            await _sync_shop_payment_account(db, etsy_client, shop_with_oauth)

        state = db.query(ShopFinancialState).filter(
            ShopFinancialState.shop_id == shop_with_oauth.id
        ).first()
        assert state is not None
        assert state.balance == 1500  # cents
        assert state.available_for_payout == 1200
        assert state.reserve_amount == 300
        assert state.currency_code == "USD"


class TestPayoutEstimateAPI:
    """Phase 5: Reject tenant-wide payout when multiple shops exist."""

    def test_reject_tenant_wide_payout_when_multiple_shops(
        self, client: TestClient, db, tenant, shop, access_token
    ):
        """When tenant has multiple shops and no shop_id/shop_ids, return 400."""
        # Add second shop
        shop2 = Shop(
            tenant_id=tenant.id,
            display_name="Test Shop 2",
            etsy_shop_id="87654321",
            status="connected",
        )
        db.add(shop2)
        db.commit()

        response = client.get(
            "/api/financials/payout-estimate",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == 400
        data = response.json()
        assert "multiple shops" in data.get("detail", "").lower()
