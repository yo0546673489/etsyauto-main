# Cursor Prompt 2 — Fix Order Tracking / Fulfillment Flow

## Context
EtsyAuto platform. Stack: FastAPI backend, Next.js frontend.
This prompt fixes 6 bugs in the order fulfillment and tracking submission flow.

---

## Bug 1 — `ship_date` never sent from UI (HIGH)

**File:** `apps/web/app/orders/[id]/page.tsx` (or the orders fulfillment page)

The ship date field is a display-only `<p>` tag. Replace it with a real controlled input:

1. Add a `shipDate` state variable initialized to today's date:
```javascript
const [shipDate, setShipDate] = useState(new Date().toISOString().split('T')[0]);
```

2. Replace the `<p>` display element with:
```jsx
<input
  type="date"
  value={shipDate}
  onChange={(e) => setShipDate(e.target.value)}
  className="..."
/>
```

3. Include it in the payload:
```javascript
const payload = {
  tracking_code: trackingCode.trim(),
  carrier_name: carrierName.trim() || undefined,
  note: note.trim() || undefined,
  ship_date: shipDate,
};
```

---

## Bug 2 — No error handling around Etsy API call (HIGH)

**File:** `apps/api/app/api/endpoints/orders.py`

Wrap the `etsy_client.create_receipt_shipment()` call in a try/except block:

```python
try:
    etsy_response = await etsy_client.create_receipt_shipment(
        shop_id=order.shop_id,
        etsy_shop_id=shop.etsy_shop_id,
        receipt_id=str(order.etsy_receipt_id),
        tracking_code=request.tracking_code,
        carrier_name=request.carrier_name,
        ship_date=ship_date_ts,
    )
except EtsyRateLimitError as e:
    raise HTTPException(status_code=429, detail="Etsy rate limit hit — please try again shortly.")
except EtsyAPIError as e:
    status = e.status_code or 500
    if status == 401:
        raise HTTPException(status_code=502, detail="Etsy shop connection expired — please reconnect your shop.")
    if status == 404:
        raise HTTPException(status_code=404, detail="Etsy receipt not found — order may have been cancelled.")
    raise HTTPException(status_code=502, detail=f"Etsy error: {str(e)}")
```

Make sure `EtsyAPIError` and `EtsyRateLimitError` are imported at the top of the file.

---

## Bug 3 — No guard for null `etsy_receipt_id` (MEDIUM)

**File:** `apps/api/app/api/endpoints/orders.py`

In both `fulfill_order` and `record_manual_tracking`, add this guard before any Etsy
API call:

```python
if not order.etsy_receipt_id:
    raise HTTPException(
        status_code=400,
        detail="Order has no Etsy receipt ID — cannot sync tracking to Etsy."
    )
```

---

## Bug 4 — `shipments` not type-normalized in write path (MEDIUM)

**File:** `apps/api/app/api/endpoints/orders.py`

At the top of both `fulfill_order` and `record_manual_tracking`, normalize
`order.shipments` to always be a list before iterating:

```python
existing_shipments = order.shipments or []
if isinstance(existing_shipments, str):
    try:
        existing_shipments = json.loads(existing_shipments)
    except Exception:
        existing_shipments = []
if not isinstance(existing_shipments, list):
    existing_shipments = []
```

---

## Bug 5 — `ShipmentEvent.shipped_at` uses inconsistent date parse (LOW)

**File:** `apps/api/app/api/endpoints/orders.py`

Replace the second `datetime.fromisoformat(...)` parse for `shipped_at` with the
already-parsed and timezone-normalized `ship_date_ts`:

```python
shipped_at=ship_date_ts or datetime.now(timezone.utc),
```

This ensures the same normalization logic is used throughout and avoids naive datetime issues.

---

## Bug 6 — Duplicate tracking guard case-sensitivity (LOW)

**File:** `apps/api/app/api/endpoints/orders.py`

In the duplicate shipment check, normalize carrier name to lowercase before comparing:

```python
if (
    shipment.get("tracking_code") == request.tracking_code
    and (shipment.get("carrier_name") or "").lower() == (request.carrier_name or "").lower()
):
    return {"message": "Tracking already submitted", "status": "already_synced"}
```
