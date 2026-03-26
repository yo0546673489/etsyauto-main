# Cursor Prompt: Rebuild Analytics Page + Fix Hot Reload

## STEP 1 — Switch web container to development mode (do this FIRST)

This is required because the web container currently runs `next build` +
`next start` (production mode), which serves a pre-compiled bundle.
File changes on the host have NO effect until the image is rebuilt.

### 1a — Edit `apps/web/Dockerfile`

Find this line at the bottom:
```dockerfile
CMD ["npm", "start"]
```

Replace with:
```dockerfile
CMD ["npm", "run", "dev"]
```

### 1b — Edit `docker-compose.yml` (or `docker-compose.override.yml`)

Find the `web` service definition. Add a `volumes` mount so the container
reads source files directly from your host:

```yaml
  web:
    volumes:
      - ./apps/web:/app
      - /app/node_modules
      - /app/.next
    environment:
      - NODE_ENV=development
```

The `/app/node_modules` and `/app/.next` anonymous volumes prevent the
host from overwriting the container's installed packages and build cache.

### 1c — Rebuild and restart the web container

```powershell
docker compose build --no-cache web
docker compose up -d web
docker compose logs web -f
```

Wait until you see:
```
✓ Ready in Xms
```
or
```
- Local: http://localhost:3000
```

After this, ANY change to files in `apps/web/` will hot-reload in the
browser instantly — no rebuild needed ever again.

---

## STEP 2 — Rebuild analytics page

Now edit `apps/web/app/analytics/page.tsx` with the following changes.
After saving, the browser will hot-reload automatically.

---

### Remove entirely

1. **All `#region agent log` debug blocks** — every `fetch(...api/debug/log...)`
   call. There are ~5 of these scattered through the file. Remove all.

2. **Fulfillment section** — the entire JSX block rendering:
   - Avg Fulfillment Time, Delivered, In Transit KPI cards
   - Fulfillment Status card
   - Shipment Source card
   - Supplier Performance card
   All of these show 0 because ShipmentEvents are not used.

3. **Listing Jobs card** — always shows 0, not useful.

4. **Duplicate KPI cards** — currently showing `total_revenue` four times
   across 8 KPI cards. Replace with the layout below.

5. **Shop comparison panel UI** — remove `ShopComparisonPanel` component
   and related state (`comparisonData`, `showComparison`, `loadingComparison`).
   Keep `analyticsApi.getComparison` import in case needed later.

6. **Redundant state variables** — remove:
   ```typescript
   const [refreshing, setRefreshing] = useState(false);
   const [comparisonData, setComparisonData] = useState(...);
   const [showComparison, setShowComparison] = useState(false);
   const [loadingComparison, setLoadingComparison] = useState(false);
   const loadCountRef = useRef(0);
   const renderCountRef = useRef(0);
   const hasContentRef = useRef(false);
   ```

7. **`showDateRangeMenu` state and dropdown** — replace the custom dropdown
   with a plain styled `<select>` element (simpler, same functionality).

---

### Simplify `loadAnalytics`

Replace the entire function with:

```typescript
const loadAnalytics = useCallback(async (forceRefresh = false) => {
  setLoading(true);
  try {
    const [overviewData, ordersData, productsData] = await Promise.all([
      analyticsApi.getOverview(shopId, forceRefresh, shopIds, startDate, endDate),
      analyticsApi.getOrders(shopId, forceRefresh, shopIds, startDate, endDate),
      analyticsApi.getProducts(shopId, forceRefresh, shopIds, startDate, endDate),
    ]);
    setOverview(overviewData);
    setOrders(ordersData);
    setProducts(productsData);
  } catch (err: unknown) {
    const error = err as { detail?: string };
    showToast(error?.detail || t('analytics.loadFailed'), 'error');
  } finally {
    setLoading(false);
  }
}, [shopId, shopIds, startDate, endDate, showToast, t]);
```

Remove `fulfillment` state entirely since we're not displaying it.

---

### Replace date range selector

Replace the custom dropdown button/menu with:

```tsx
<select
  value={dateRange}
  onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
  className="px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] cursor-pointer"
>
  <option value="7d">{t('analytics.last7d')}</option>
  <option value="30d">{t('analytics.last30d')}</option>
  <option value="90d">{t('analytics.last90d')}</option>
  <option value="12m">{t('analytics.last12m')}</option>
  <option value="all">{t('analytics.allTime')}</option>
</select>
```

---

### New page layout

Replace the entire JSX return inside `AnalyticsContent` with:

```tsx
return (
  <div className="max-w-[1400px] mx-auto space-y-8">
    <DisconnectedShopBanner />

    {/* Header */}
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {t('analytics.title')}
        </h1>
        <p className="text-[var(--text-muted)] mt-1 text-sm">
          {selectedShop ? `Performance overview for ${selectedShop.display_name}` : 'Performance overview'}
          <span className="ml-2 text-xs">— {t('analytics.clickCardDetails')}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        {/* Date range select */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
          className="px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] cursor-pointer"
        >
          <option value="7d">{t('analytics.last7d')}</option>
          <option value="30d">{t('analytics.last30d')}</option>
          <option value="90d">{t('analytics.last90d')}</option>
          <option value="12m">{t('analytics.last12m')}</option>
          <option value="all">{t('analytics.allTime')}</option>
        </select>
        <button
          onClick={() => loadAnalytics(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--background)] transition disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          {loading ? t('analytics.refreshing') : t('analytics.refresh')}
        </button>
      </div>
    </div>

    {/* Section 1 — Revenue & Orders KPIs */}
    {overview && (
      <>
        <SectionHeader title={t('analytics.revenueOrders')} subtitle={t('analytics.keyIndicators')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title={t('analytics.totalRevenue')}
            value={formatAnalyticsRevenue(overview.total_revenue, overview.converted_total_revenue, overview.converted_currency)}
            icon={DollarSign}
            onClick={() => setDetailView({ kind: 'revenue' })}
          />
          <KpiCard
            title={t('analytics.totalOrders')}
            value={overview.total_orders}
            icon={ShoppingCart}
            onClick={() => setDetailView({ kind: 'orders' })}
          />
          <KpiCard
            title={t('analytics.avgOrderValue')}
            value={formatAnalyticsRevenue(overview.avg_order_value, overview.converted_avg_order_value, overview.converted_currency)}
            icon={BarChart3}
          />
          <KpiCard
            title={t('analytics.revenue7d')}
            value={formatAnalyticsRevenue(overview.revenue_7d, overview.converted_revenue_7d, overview.converted_currency)}
            icon={TrendingUp}
            trend={overview.revenue_7d_trend}
            trendLabel={t('analytics.vsPrev7d')}
            onClick={() => setDetailView({ kind: 'revenue' })}
          />
        </div>
      </>
    )}

    {/* Section 2 — Orders */}
    {orders && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Status */}
        <ClickableCard>
          <SectionHeader title={t('analytics.orderStatus')} subtitle={`${orderTotal} total orders`} />
          <div className="space-y-4">
            <BarItem label={t('analytics.completed')} value={orders.status_breakdown.completed} total={orderTotal} color="bg-emerald-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'completed' })} />
            <BarItem label={t('analytics.processing')} value={orders.status_breakdown.processing} total={orderTotal} color="bg-amber-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'processing' })} />
            <BarItem label={t('analytics.inTransit')} value={orders.status_breakdown.in_transit} total={orderTotal} color="bg-blue-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'in_transit' })} />
            <BarItem label={t('analytics.cancelled')} value={orders.status_breakdown.cancelled} total={orderTotal} color="bg-red-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'cancelled' })} />
            <BarItem label={t('analytics.refunded')} value={orders.status_breakdown.refunded} total={orderTotal} color="bg-orange-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'refunded' })} />
          </div>
        </ClickableCard>

        {/* Payment Status */}
        <ClickableCard>
          <SectionHeader title={t('analytics.paymentStatus')} subtitle={`${paymentTotal} total orders`} />
          <div className="grid grid-cols-2 gap-4 mb-6">
            <DonutStat label={t('analytics.paid')} value={orders.payment_breakdown.paid} total={paymentTotal} color="bg-emerald-100 text-emerald-600" icon={CheckCircle} onClick={() => setDetailView({ kind: 'payment', paymentFilter: 'paid' })} />
            <DonutStat label={t('analytics.unpaid')} value={orders.payment_breakdown.unpaid} total={paymentTotal} color="bg-amber-100 text-amber-600" icon={AlertTriangle} onClick={() => setDetailView({ kind: 'payment', paymentFilter: 'unpaid' })} />
          </div>
          {paymentTotal > 0 && (
            <div className="h-4 rounded-full overflow-hidden flex bg-[var(--background)]">
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(orders.payment_breakdown.paid / paymentTotal) * 100}%` }} />
              <div className="bg-amber-400 transition-all duration-500" style={{ width: `${(orders.payment_breakdown.unpaid / paymentTotal) * 100}%` }} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 text-xs text-[var(--text-muted)]">
            <span>{t('analytics.paid')} ({paymentTotal > 0 ? ((orders.payment_breakdown.paid / paymentTotal) * 100).toFixed(0) : 0}%)</span>
            <span>{t('analytics.unpaid')} ({paymentTotal > 0 ? ((orders.payment_breakdown.unpaid / paymentTotal) * 100).toFixed(0) : 0}%)</span>
          </div>
        </ClickableCard>
      </div>
    )}

    {/* Section 3 — Products */}
    {products && (
      <>
        <SectionHeader title={t('analytics.products')} subtitle={t('analytics.inventoryOverview')} />
        <ClickableCard onClick={() => setDetailView({ kind: 'products' })}>
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="text-center p-4 rounded-lg bg-[var(--background)]">
              <Package className="w-6 h-6 text-[var(--primary)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--text-primary)]">{products.total_products}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('analytics.total')}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-[var(--background)]">
              <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--text-primary)]">{products.published_products}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('analytics.published')}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-[var(--background)]">
              <FileText className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--text-primary)]">{products.draft_products}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('analytics.drafts')}</p>
            </div>
          </div>
          {products.total_products > 0 && (
            <>
              <div className="h-3 rounded-full overflow-hidden flex bg-[var(--background)] mb-2">
                <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${(products.published_products / products.total_products) * 100}%` }} />
                <div className="bg-amber-400 transition-all duration-700" style={{ width: `${(products.draft_products / products.total_products) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>Published ({((products.published_products / products.total_products) * 100).toFixed(0)}%)</span>
                <span>Drafts ({((products.draft_products / products.total_products) * 100).toFixed(0)}%)</span>
              </div>
            </>
          )}
        </ClickableCard>
      </>
    )}

    {/* Section 4 — Revenue Breakdown */}
    {overview && (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-6">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-5">Revenue Breakdown</h3>
        <div className="space-y-5">
          {[
            { label: 'Last 7 days', value: overview.revenue_7d, converted: overview.converted_revenue_7d, color: 'bg-blue-500' },
            { label: 'Last 30 days', value: overview.revenue_30d, converted: overview.converted_revenue_30d, color: 'bg-indigo-500' },
            { label: `Total (${dateRangeToLabel(dateRange, t)})`, value: overview.total_revenue, converted: overview.converted_total_revenue, color: 'bg-emerald-500' },
          ].map((item) => {
            const max = Math.max(overview.total_revenue, 1);
            return (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[var(--text-secondary)]">{item.label}</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatAnalyticsRevenue(item.value, item.converted, overview.converted_currency)}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--background)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                    style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* Cache timestamp */}
    {overview?.computed_at && (
      <p className="text-xs text-[var(--text-muted)] text-right">
        {t('analytics.dataCachedAt')} {new Date(overview.computed_at).toLocaleString()}
      </p>
    )}

    {/* Detail Drawer */}
    {detailView && (
      <DetailDrawer
        view={detailView}
        onClose={() => setDetailView(null)}
        overview={overview}
        orders={orders}
        products={products}
        fulfillment={null}
        shopId={shopId}
        isOwner={isOwner}
      />
    )}
  </div>
);
```

---

## Do NOT change

- `apps/web/lib/api.ts`
- Any backend files
- `DetailDrawer` component (keep as-is, just pass `fulfillment={null}`)
- `dateRangeToParams`, `formatAnalyticsRevenue`, `KpiCard`, `BarItem`,
  `DonutStat`, `ClickableCard`, `SectionHeader` helper components
- All imports that are still used

---

## Verify it works

After Step 1 (dev mode switch) and Step 2 (page rebuild):

1. Save `page.tsx`
2. Browser should hot-reload within 2-3 seconds automatically
3. Change date range selector — numbers should update
4. No Docker rebuild needed for any future frontend changes
