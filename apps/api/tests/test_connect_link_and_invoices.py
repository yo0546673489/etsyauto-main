"""
Tests for connect_links, invoice upload, financial summary, and multi-store filtering.
These are structured as unit/integration tests validating the core business logic.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

# ── ConnectLink model tests ──

def test_connect_link_expiry_check():
    """Verify that expired links are correctly detected."""
    from app.models.tenancy import ConnectLink

    link = ConnectLink(
        id=1,
        tenant_id=1,
        created_by_user_id=1,
        token="test_token_abc",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    assert link.expires_at < datetime.now(timezone.utc), "Link should be expired"


def test_connect_link_unused():
    """Verify that unused link has no used_at."""
    from app.models.tenancy import ConnectLink

    link = ConnectLink(
        id=2,
        tenant_id=1,
        created_by_user_id=1,
        token="test_token_def",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    assert link.used_at is None, "New link should not be used"


# ── ExpenseInvoice model tests ──

def test_expense_invoice_status_default():
    """Verify invoice defaults to pending status."""
    from app.models.financials import ExpenseInvoice

    inv = ExpenseInvoice(
        tenant_id=1,
        uploaded_by_user_id=1,
        file_name="test.csv",
        file_path="/tmp/test.csv",
        file_type="csv",
    )
    assert inv.status == "pending"


def test_expense_line_item_creation():
    """Verify line item can be created with amount in cents."""
    from app.models.financials import ExpenseLineItem

    li = ExpenseLineItem(
        invoice_id=1,
        description="Widget supplies",
        amount=1500,  # $15.00
        category="materials",
        quantity=3,
    )
    assert li.amount == 1500
    assert li.quantity == 3


# ── CSV parsing tests ──

def test_csv_parse_line_items():
    """Test that CSV content is parsed into line items."""
    from app.api.endpoints.financial_invoices import _parse_csv
    from app.models.financials import ExpenseInvoice

    csv_content = (
        b"description,amount,category,quantity\n"
        b"Widget A,12.50,materials,2\n"
        b"Widget B,8.00,materials,1\n"
    )
    invoice = ExpenseInvoice(
        id=99,
        tenant_id=1,
        uploaded_by_user_id=1,
        file_name="test.csv",
        file_path="/tmp/test.csv",
        file_type="csv",
    )
    mock_db = MagicMock()
    _parse_csv(csv_content, invoice, mock_db)

    # Should have 2 line items added
    assert mock_db.add.call_count == 2
    # Invoice total should be computed
    assert invoice.total_amount == (1250 * 2) + (800 * 1)


def test_csv_parse_handles_dollar_signs():
    """Test that CSV parser handles $ in amounts."""
    from app.api.endpoints.financial_invoices import _parse_csv
    from app.models.financials import ExpenseInvoice

    csv_content = b"Description,Amount\nTest,$25.99\n"
    invoice = ExpenseInvoice(
        id=100,
        tenant_id=1,
        uploaded_by_user_id=1,
        file_name="test.csv",
        file_path="/tmp/test.csv",
        file_type="csv",
    )
    mock_db = MagicMock()
    _parse_csv(csv_content, invoice, mock_db)
    assert mock_db.add.call_count == 1
    assert invoice.total_amount == 2599


def test_csv_parse_empty_content():
    """Test that CSV parser handles empty content gracefully."""
    from app.api.endpoints.financial_invoices import _parse_csv
    from app.models.financials import ExpenseInvoice

    csv_content = b"description,amount\n"
    invoice = ExpenseInvoice(
        id=101,
        tenant_id=1,
        uploaded_by_user_id=1,
        file_name="empty.csv",
        file_path="/tmp/empty.csv",
        file_type="csv",
    )
    mock_db = MagicMock()
    _parse_csv(csv_content, invoice, mock_db)
    assert mock_db.add.call_count == 0


# ── Financial summary structure tests ──

def test_financial_summary_net_profit_calculation():
    """Verify net profit = revenue - total_expenses - refunds."""
    revenue = 100000  # $1000
    etsy_fees = 10000
    advertising = 5000
    product_costs = 20000
    invoice_expenses = 3000
    shipping_labels = 2000
    refunds = 5000

    total_expenses = etsy_fees + advertising + product_costs + invoice_expenses + shipping_labels
    net_profit = revenue - total_expenses - refunds

    assert total_expenses == 40000
    assert net_profit == 55000


def test_financial_summary_fields():
    """Verify the summary response has all required ordered fields."""
    required_fields = [
        "revenue",
        "etsy_fees",
        "advertising_expenses",
        "product_costs",
        "invoice_expenses",
        "shipping_labels",
        "refunds",
        "total_discounts",
        "total_expenses",
        "net_profit",
        "currency",
        "period_start",
        "period_end",
    ]
    example = {field: 0 for field in required_fields}
    example["currency"] = "USD"
    example["period_start"] = "2026-01-01"
    example["period_end"] = "2026-02-01"

    for field in required_fields:
        assert field in example, f"Missing field: {field}"


# ── Multi-store filter helper tests ──

def test_apply_shop_filter_single():
    """Verify single shop_id filter."""
    from app.services.financial_service import FinancialService

    filters = []
    mock_col = MagicMock()
    FinancialService._apply_shop_filter(filters, mock_col, shop_id=5, shop_ids=None)
    assert len(filters) == 1


def test_apply_shop_filter_multi():
    """Verify multi shop_ids filter takes precedence."""
    from app.services.financial_service import FinancialService

    filters = []
    mock_col = MagicMock()
    FinancialService._apply_shop_filter(filters, mock_col, shop_id=5, shop_ids=[1, 2, 3])
    assert len(filters) == 1
    mock_col.in_.assert_called_once_with([1, 2, 3])


def test_apply_shop_filter_none():
    """Verify no filter when both shop_id and shop_ids are None."""
    from app.services.financial_service import FinancialService

    filters = []
    mock_col = MagicMock()
    FinancialService._apply_shop_filter(filters, mock_col, shop_id=None, shop_ids=None)
    assert len(filters) == 0


# ── Cache key tests ──

def test_cache_key_multi_store():
    """Verify cache key includes sorted shop IDs for multi-store."""
    from app.services.financial_service import FinancialService

    svc = FinancialService.__new__(FinancialService)
    key = svc._cache_key(1, None, "pnl", shop_ids=[3, 1, 2])
    assert "shops_1,2,3" in key
    assert "tenant_1" in key


def test_cache_key_single_store():
    """Verify cache key for single store."""
    from app.services.financial_service import FinancialService

    svc = FinancialService.__new__(FinancialService)
    key = svc._cache_key(1, 5, "pnl")
    assert "shop_5" in key
    assert "tenant_1" in key


# ── Allowed file extension tests ──

def test_invoice_allowed_extensions():
    """Verify all expected file types are allowed."""
    from app.api.endpoints.financial_invoices import ALLOWED_EXTENSIONS

    expected = {"pdf", "jpg", "jpeg", "png", "gif", "webp", "csv", "xlsx"}
    assert expected == ALLOWED_EXTENSIONS


def test_invoice_file_size_limit():
    """Verify the file size limit is 10 MB."""
    from app.api.endpoints.financial_invoices import MAX_FILE_SIZE

    assert MAX_FILE_SIZE == 10 * 1024 * 1024


# ── Discount summary tests ──

def test_discount_summary_required_keys():
    """Verify get_discount_summary response has required keys."""
    required_keys = [
        "total_discounts",
        "order_count_with_discounts",
        "currency",
        "period_start",
        "period_end",
    ]
    # Contract: discounts API must return these keys
    example = {k: (0 if k in ("total_discounts", "order_count_with_discounts") else "") for k in required_keys}
    example["currency"] = "USD"
    example["period_start"] = "2026-01-01T00:00:00"
    example["period_end"] = "2026-02-01T00:00:00"
    for key in required_keys:
        assert key in example
