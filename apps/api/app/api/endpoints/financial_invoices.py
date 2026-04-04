"""
Invoice Upload & Management API
Upload expense invoices (PDF, images, CSV, XLSX) for inclusion in financial summaries.
"""

import csv
import io
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.api.dependencies import get_user_context, UserContext, require_revenue_access
from app.core.database import get_db
from app.core.query_helpers import ensure_shop_access
from app.models.financials import ExpenseInvoice, ExpenseLineItem

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_EXTENSIONS = {
    "pdf", "jpg", "jpeg", "png", "gif", "webp", "csv", "xlsx",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
UPLOAD_DIR = "uploads/invoices"


class InvoiceUpdateRequest(BaseModel):
    vendor_name: Optional[str] = None
    invoice_date: Optional[str] = None
    total_amount: Optional[int] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    shop_id: Optional[int] = None
    status: Optional[str] = None


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _serialize_invoice(inv: ExpenseInvoice) -> dict:
    return {
        "id": inv.id,
        "tenant_id": inv.tenant_id,
        "shop_id": inv.shop_id,
        "uploaded_by_user_id": inv.uploaded_by_user_id,
        "file_name": inv.file_name,
        "file_type": inv.file_type,
        "file_size_bytes": inv.file_size_bytes,
        "vendor_name": inv.vendor_name,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "total_amount": inv.total_amount,
        "currency": inv.currency,
        "category": inv.category,
        "notes": inv.notes,
        "status": inv.status,
        "parsed_at": inv.parsed_at.isoformat() if inv.parsed_at else None,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "line_items": [
            {
                "id": li.id,
                "description": li.description,
                "amount": li.amount,
                "category": li.category,
                "quantity": li.quantity,
            }
            for li in (inv.line_items or [])
        ],
    }


# ── Upload ──

@router.post("/upload", tags=["Invoices"])
async def upload_invoice(
    file: UploadFile = File(...),
    shop_id: Optional[int] = Form(None),
    vendor_name: Optional[str] = Form(None),
    invoice_date: Optional[str] = Form(None),
    total_amount: Optional[int] = Form(None),
    currency: Optional[str] = Form("USD"),
    category: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """Upload an expense invoice file and create an invoice record."""
    if context.role.lower() not in ("owner", "admin", "employee"):
        raise HTTPException(status_code=403, detail="Only owners and admins can upload invoices.")

    if shop_id:
        ensure_shop_access(shop_id, context, db)

    ext = _ext(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type .{ext} not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    # Save to disk
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(content)

    # Parse date
    parsed_date = None
    if invoice_date:
        try:
            parsed_date = datetime.fromisoformat(invoice_date)
            if parsed_date.tzinfo is None:
                parsed_date = parsed_date.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    invoice = ExpenseInvoice(
        tenant_id=context.tenant_id,
        shop_id=shop_id,
        uploaded_by_user_id=context.user_id,
        file_name=file.filename or "unknown",
        file_path=file_path,
        file_type=ext,
        file_size_bytes=len(content),
        vendor_name=vendor_name,
        invoice_date=parsed_date,
        total_amount=total_amount,
        currency=currency or "USD",
        category=category,
        notes=notes,
        status="pending",
    )
    db.add(invoice)
    db.flush()

    # Auto-parse CSV/XLSX for line items
    if ext == "csv":
        _parse_csv(content, invoice, db)
    elif ext == "xlsx":
        _parse_xlsx(content, invoice, db)

    db.commit()
    db.refresh(invoice)

    return {"message": "Invoice uploaded", "invoice": _serialize_invoice(invoice)}


def _parse_csv(content: bytes, invoice: ExpenseInvoice, db: Session):
    """Parse CSV for line items with amount/description/category columns."""
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        total = 0
        for row in reader:
            raw_amount = row.get("amount") or row.get("Amount") or row.get("AMOUNT")
            if not raw_amount:
                continue
            try:
                amount_cents = int(float(str(raw_amount).replace(",", "").replace("$", "")) * 100)
            except (ValueError, TypeError):
                continue
            desc = row.get("description") or row.get("Description") or row.get("item") or ""
            cat = row.get("category") or row.get("Category") or invoice.category
            qty = 1
            raw_qty = row.get("quantity") or row.get("Quantity") or row.get("qty")
            if raw_qty:
                try:
                    qty = int(raw_qty)
                except ValueError:
                    qty = 1

            li = ExpenseLineItem(
                invoice_id=invoice.id,
                description=str(desc)[:500],
                amount=amount_cents,
                category=str(cat)[:50] if cat else None,
                quantity=qty,
            )
            db.add(li)
            total += amount_cents * qty

        if total > 0 and not invoice.total_amount:
            invoice.total_amount = total
        invoice.parsed_at = datetime.now(timezone.utc)
    except Exception as _e:
        logger.error(f"[financial_invoices] CSV parse failed for invoice {invoice.id}: {_e!r}")


def _parse_xlsx(content: bytes, invoice: ExpenseInvoice, db: Session):
    """Parse XLSX for line items. Falls back gracefully if openpyxl is unavailable."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        if not ws:
            return
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            return

        # Find column indices from header
        header = [str(c).lower().strip() if c else "" for c in rows[0]]
        amt_idx = next((i for i, h in enumerate(header) if h in ("amount", "total", "cost")), None)
        desc_idx = next((i for i, h in enumerate(header) if h in ("description", "item", "name")), None)
        cat_idx = next((i for i, h in enumerate(header) if h in ("category", "type")), None)
        qty_idx = next((i for i, h in enumerate(header) if h in ("quantity", "qty")), None)

        if amt_idx is None:
            return

        total = 0
        for row in rows[1:]:
            try:
                raw = row[amt_idx]
                amount_cents = int(float(str(raw).replace(",", "").replace("$", "")) * 100)
            except (ValueError, TypeError, IndexError):
                continue
            desc = str(row[desc_idx])[:500] if desc_idx is not None and row[desc_idx] else ""
            cat = str(row[cat_idx])[:50] if cat_idx is not None and row[cat_idx] else None
            qty = 1
            if qty_idx is not None and row[qty_idx]:
                try:
                    qty = int(row[qty_idx])
                except (ValueError, TypeError):
                    qty = 1

            li = ExpenseLineItem(
                invoice_id=invoice.id,
                description=desc,
                amount=amount_cents,
                category=cat,
                quantity=qty,
            )
            db.add(li)
            total += amount_cents * qty

        if total > 0 and not invoice.total_amount:
            invoice.total_amount = total
        invoice.parsed_at = datetime.now(timezone.utc)
    except ImportError:
        logger.warning("openpyxl not installed — XLSX parsing skipped")
    except Exception as _e:
        logger.error(f"[financial_invoices] XLSX parse failed for invoice {invoice.id}: {_e!r}")


# ── List ──

@router.get("/", tags=["Invoices"])
async def list_invoices(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    invoice_status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """List expense invoices for the tenant, optionally filtered by shop/status."""
    filters = [ExpenseInvoice.tenant_id == context.tenant_id]

    if shop_ids:
        try:
            ids = [int(s.strip()) for s in shop_ids.split(",") if s.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid shop_ids")
        for sid in ids:
            ensure_shop_access(sid, context, db)
        filters.append(ExpenseInvoice.shop_id.in_(ids))
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        filters.append(ExpenseInvoice.shop_id == shop_id)

    if invoice_status:
        filters.append(ExpenseInvoice.status == invoice_status)

    total = db.query(ExpenseInvoice).filter(and_(*filters)).count()
    invoices = (
        db.query(ExpenseInvoice)
        .filter(and_(*filters))
        .order_by(ExpenseInvoice.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "invoices": [_serialize_invoice(inv) for inv in invoices],
        "total_count": total,
        "limit": limit,
        "offset": offset,
    }


# ── Update (approve/reject/edit metadata) ──

@router.patch("/{invoice_id}", tags=["Invoices"])
async def update_invoice(
    invoice_id: int,
    request: InvoiceUpdateRequest,
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """Update invoice metadata or status (approve/reject)."""
    if context.role.lower() not in ("owner", "admin", "employee"):
        raise HTTPException(status_code=403, detail="Only owners and admins can update invoices.")

    inv = db.query(ExpenseInvoice).filter(
        ExpenseInvoice.id == invoice_id,
        ExpenseInvoice.tenant_id == context.tenant_id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if request.shop_id is not None:
        ensure_shop_access(request.shop_id, context, db)
        inv.shop_id = request.shop_id
    if request.vendor_name is not None:
        inv.vendor_name = request.vendor_name
    if request.invoice_date is not None:
        try:
            dt = datetime.fromisoformat(request.invoice_date)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            inv.invoice_date = dt
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    if request.total_amount is not None:
        inv.total_amount = request.total_amount
    if request.currency is not None:
        inv.currency = request.currency
    if request.category is not None:
        inv.category = request.category
    if request.notes is not None:
        inv.notes = request.notes
    if request.status is not None:
        if request.status not in ("pending", "approved", "rejected"):
            raise HTTPException(status_code=400, detail="Status must be pending, approved, or rejected")
        inv.status = request.status

    inv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inv)

    return {"message": "Invoice updated", "invoice": _serialize_invoice(inv)}


# ── Delete ──

@router.delete("/{invoice_id}", tags=["Invoices"])
async def delete_invoice(
    invoice_id: int,
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """Delete an invoice and its file."""
    if context.role.lower() not in ("owner", "admin", "employee"):
        raise HTTPException(status_code=403, detail="Only owners and admins can delete invoices.")

    inv = db.query(ExpenseInvoice).filter(
        ExpenseInvoice.id == invoice_id,
        ExpenseInvoice.tenant_id == context.tenant_id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    # Remove file
    if inv.file_path and os.path.exists(inv.file_path):
        try:
            os.remove(inv.file_path)
        except Exception as _e:
            logger.warning(f"[financial_invoices] failed to delete file {inv.file_path}: {_e!r}")

    db.delete(inv)
    db.commit()

    return {"message": "Invoice deleted"}
