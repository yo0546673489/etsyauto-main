# Cursor Prompt: Fix Analytics Date Range Filter

## Problem

The Analytics page has a date range selector (Last 7d, 30d, 90d, 12m, All)
but changing it has no effect on the displayed data. Two root causes:

### Root Cause 1 — Frontend KPI cards use hardcoded 30d fields

In `apps/web/app/analytics/page.tsx`, the main KPI cards display:
- `overview.revenue_30d` instead of `overview.total_revenue`
- `overview.orders_30d` instead of `overview.total_orders`
- `overview.avg_order_value` (this one is correct)

`total_revenue` and `total_orders` ARE filtered by the selected date range
on the backend. `revenue_30d` and `orders_30d` are always the last 30 days
regardless of the selector.

### Root Cause 2 — Orders/Products/Fulfillment APIs ignore date range

In `apps/web/lib/api.ts`:
- `getOrders` has no `startDate`/`endDate` parameters
- `getProducts` has no `startDate`/`endDate` parameters  
- `getFulfillment` has no `startDate`/`endDate` parameters

In `apps/web/app/analytics/page.tsx`, `loadAnalytics` only passes
`startDate`/`endDate` to `getOverview`, not to the other three calls.

In `apps/api/app/api/endpoints/analytics.py`, the `/orders`, `/products`,
and `/fulfillment` endpoints don't accept `start_date`/`end_date` params.

In `apps/api/app/services/analytics_service.py`, `get_order_analytics`,
`get_product_analytics`, and `get_fulfillment_analytics` don't accept
`start_date`/`end_date` parameters.

---

## Fixes Required

### Fix 1 — `apps/web/app/analytics/page.tsx`

#### 1a — Fix KPI cards to use date-range-aware fields

Find all occurrences of `overview.revenue_30d` used as the PRIMARY display
value in KPI cards (not in sub-sections or trend comparisons) and replace
with `overview.total_revenue`.

Find all occurrences of `overview.orders_30d` used as the PRIMARY display
value in KPI cards and replace with `overview.total_orders`.

The `revenue_30d`, `orders_30d`, `revenue_7d`, `orders_7d` fields should
only be used inside detail/comparison sub-sections, NOT as the main card value.

#### 1b — Pass startDate/endDate to all API calls

Find this block in `loadAnalytics`:

```typescript
const [overviewData, ordersData, productsData, fulfillmentData] = await Promise.all([
  analyticsApi.getOverview(shopId, forceRefresh, shopIds, startDate, endDate),
  analyticsApi.getOrders(shopId, forceRefresh, shopIds),
  analyticsApi.getProducts(shopId, forceRefresh, shopIds),
  analyticsApi.getFulfillment(shopId, forceRefresh, shopIds),
]);
```

Replace with:

```typescript
const [overviewData, ordersData, productsData, fulfillmentData] = await Promise.all([
  analyticsApi.getOverview(shopId, forceRefresh, shopIds, startDate, endDate),
  analyticsApi.getOrders(shopId, forceRefresh, shopIds, startDate, endDate),
  analyticsApi.getProducts(shopId, forceRefresh, shopIds, startDate, endDate),
  analyticsApi.getFulfillment(shopId, forceRefresh, shopIds, startDate, endDate),
]);
```

---

### Fix 2 — `apps/web/lib/api.ts`

Update `getOrders`, `getProducts`, and `getFulfillment` to accept and pass
date parameters:

```typescript
// FIND:
getOrders: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[]): Promise<OrderAnalytics> => {
  return apiRequest<OrderAnalytics>(`/api/analytics/orders?${_analyticsParams(shopId, forceRefresh, shopIds).toString()}`);
},
getProducts: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[]): Promise<ProductAnalytics> => {
  return apiRequest<ProductAnalytics>(`/api/analytics/products?${_analyticsParams(shopId, forceRefresh, shopIds).toString()}`);
},
getFulfillment: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[]): Promise<FulfillmentAnalytics> => {
  return apiRequest<FulfillmentAnalytics>(`/api/analytics/fulfillment?${_analyticsParams(shopId, forceRefresh, shopIds).toString()}`);
},

// REPLACE WITH:
getOrders: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[], startDate?: string, endDate?: string): Promise<OrderAnalytics> => {
  return apiRequest<OrderAnalytics>(`/api/analytics/orders?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`);
},
getProducts: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[], startDate?: string, endDate?: string): Promise<ProductAnalytics> => {
  return apiRequest<ProductAnalytics>(`/api/analytics/products?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`);
},
getFulfillment: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[], startDate?: string, endDate?: string): Promise<FulfillmentAnalytics> => {
  return apiRequest<FulfillmentAnalytics>(`/api/analytics/fulfillment?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`);
},
```

---

### Fix 3 — `apps/api/app/api/endpoints/analytics.py`

Add `start_date` and `end_date` query parameters to the `/orders`,
`/products`, and `/fulfillment` endpoint functions.

For each of the three endpoints, add these two parameters to the function
signature (same pattern as the overview endpoint):

```python
start_date: Optional[str] = Query(None, description="ISO start date for date range filter"),
end_date: Optional[str] = Query(None, description="ISO end date for date range filter"),
```

And parse them using `_parse_date` (already defined in the file):

```python
start_dt = _parse_date(start_date)
end_dt = _parse_date(end_date)
```

Then pass them to the service call:

```python
# For orders endpoint:
result = analytics.get_order_analytics(
    ...,
    start_date=start_dt,
    end_date=end_dt,
)

# For products endpoint:
result = analytics.get_product_analytics(
    ...,
    start_date=start_dt,
    end_date=end_dt,
)

# For fulfillment endpoint:
result = analytics.get_fulfillment_analytics(
    ...,
    start_date=start_dt,
    end_date=end_dt,
)
```

---

### Fix 4 — `apps/api/app/services/analytics_service.py`

Add `start_date` and `end_date` parameters to `get_order_analytics`,
`get_product_analytics`, and `get_fulfillment_analytics` methods.

For each method, follow the same pattern already used in
`get_overview_analytics`:

```python
def get_order_analytics(
    self,
    tenant_id: int,
    shop_id: Optional[int] = None,
    force_refresh: bool = False,
    shop_ids: Optional[List[int]] = None,
    start_date: Optional[datetime] = None,  # ← ADD
    end_date: Optional[datetime] = None,    # ← ADD
) -> Dict[str, Any]:
```

Inside each method, apply date filters to the base query when provided:

```python
now = datetime.now(timezone.utc)
if start_date and end_date:
    date_filter = [Order.created_at >= start_date, Order.created_at <= end_date]
    date_suffix = f":{start_date.date()}:{end_date.date()}"
else:
    date_filter = []
    date_suffix = ""

cache_key = self._cache_key(tenant_id, shop_id, f"orders{date_suffix}", shop_ids)
```

Then add `*date_filter` to all relevant queries inside the method.

Apply the same pattern to `get_product_analytics` and
`get_fulfillment_analytics`.

---

## Do NOT change the structure of the response objects — only add date
filtering to existing queries. The frontend already knows how to display
the data; it just needs the backend to filter it correctly.

## After changes:

```powershell
docker compose restart api
docker compose exec redis redis-cli FLUSHDB
```

Then change the date range on the analytics page and verify the numbers
change accordingly.
