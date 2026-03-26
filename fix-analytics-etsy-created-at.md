# Cursor Prompt: Fix Analytics Date Filter — Use etsy_created_at

## Root Cause

In `apps/api/app/services/analytics_service.py`, all date range filters
use `Order.created_at` which is the database insertion timestamp (all
orders show 2026-02-23, the sync date).

The correct field is `Order.etsy_created_at` which contains the actual
Etsy transaction date (spanning Sep 2025 → Jan 2026).

## Fix — `apps/api/app/services/analytics_service.py`

### In `get_overview_analytics`

Find ALL occurrences of date filters using `Order.created_at` and replace
with `Order.etsy_created_at`. There are several:

```python
# FIND → REPLACE (do all of these):
Order.created_at >= start_date    →  Order.etsy_created_at >= start_date
Order.created_at <= end_date      →  Order.etsy_created_at <= end_date
Order.created_at >= last_7_days   →  Order.etsy_created_at >= last_7_days
Order.created_at >= last_30_days  →  Order.etsy_created_at >= last_30_days
Order.created_at >= prev_7_days   →  Order.etsy_created_at >= prev_7_days
Order.created_at < last_7_days    →  Order.etsy_created_at < last_7_days
Order.created_at >= prev_30_days  →  Order.etsy_created_at >= prev_30_days
Order.created_at < last_30_days   →  Order.etsy_created_at < last_30_days
```

Also update the default date ranges (when no start_date/end_date provided)
to use `etsy_created_at` as the baseline. The `now` variable stays the same.

### In `get_order_analytics`

Same replacement — find all `Order.created_at` date filter usages and
replace with `Order.etsy_created_at`:

```python
date_filter = [Order.etsy_created_at >= start_date, Order.etsy_created_at <= end_date]
```

### In `get_fulfillment_analytics` — avg fulfillment time join

Find this line:
```python
func.extract('epoch', ShipmentEvent.shipped_at - Order.created_at)
```

Replace with:
```python
func.extract('epoch', ShipmentEvent.shipped_at - Order.etsy_created_at)
```

### Do NOT change

- `Order.created_at` usages that are NOT date range filters (e.g. selecting
  the field for display, or ordering results)
- Any other model's `created_at` (Product, ListingJob, ShipmentEvent)
- Product and ListingJob date filters — those correctly use their own
  `created_at` since they don't have an `etsy_created_at` field

---

## After the fix

```powershell
docker compose restart api
docker compose exec redis redis-cli FLUSHDB
```

Then test:
- Last 7 days → should return 0 orders (no orders in last 7 days)
- Last 90 days → should return ~4 orders (Dec 2025 + Jan 2026)
- Last 12 months → should return all 15 orders (Sep 2025 → Jan 2026)
- All time → should return all 15 orders
