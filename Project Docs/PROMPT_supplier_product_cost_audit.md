# Prompt: Critical Audit — Supplier Product Cost Feature

Use this prompt to audit the codebase and produce an implementation plan for the supplier product cost feature.

---

## Context

The system should allow **suppliers** to add a **cost per product** (in USD cents) **before** any sale. When a product is sold, the financial system uses this pre-entered cost to calculate Cost of Goods Sold (COGS) automatically — no invoice upload needed for each sale.

**Related features:**
- **Invoices → Expenses**: Users upload invoices; system updates expenses (separate flow).
- **Tracking numbers**: Order fulfillment tracking (already implemented).
- **Product cost (pre-sale)**: Supplier enters unit cost per product; when sold, COGS = quantity × unit cost.

---

## Audit Instructions

Perform a critical audit across the entire codebase. For each area below, identify:

1. **What exists** — Current implementation, if any
2. **What's missing** — Gaps, inconsistencies, or broken assumptions
3. **How to implement** — Concrete steps, file paths, and API/UI changes needed

---

## Audit Areas

### 1. Data Model & Schema

- **Product model** (`apps/api/app/models/listings.py`): Does `Product` have a `cost_usd_cents` column? If not, add it. Verify type (Integer, default 0), nullable behavior, and that it represents supplier/wholesale cost per unit (not sale price).
- **Database migration**: Is there an Alembic migration adding `cost_usd_cents` to `products`? If not, create one.
- **Product schemas** (`apps/api/app/schemas/products.py`): Do create/update/response schemas include `cost_usd_cents`? Add if missing.
- **API types** (`apps/web/lib/api.ts`): Does the `Product` interface include `cost_usd_cents?: number`?

### 2. Backend API

- **Products endpoints** (`apps/api/app/api/endpoints/products.py`):
  - Does `create_product` accept `cost_usd_cents`?
  - Does `update_product` / PATCH accept `cost_usd_cents`?
  - Does `get_product` / `list_products` return `cost_usd_cents`?
- **RBAC**: Who can set product cost? Supplier, owner, admin? Check `apps/api/app/core/rbac.py` and product endpoint permission decorators. Suppliers currently have `READ_ORDER` and `UPDATE_FULFILLMENT` only — do they need `UPDATE_PRODUCT` or a new `UPDATE_PRODUCT_COST` permission?
- **Financial service** (`apps/api/app/services/financial_service.py`): It already uses `Product.cost_usd_cents` in `_calc_product_costs`. Verify the column exists and the join logic is correct. Check `order_date` vs `etsy_created_at` for date filtering.

### 3. Supplier Access & Navigation

- **Sidebar** (`apps/web/components/layout/Sidebar.tsx`): Suppliers currently see Dashboard, Assigned Orders, Settings. Do they need a **Products** or **My Products** link? Or a dedicated **Product Costs** page? Decide and document.
- **RBAC / middleware**: Can suppliers access `/products` or a product-cost-specific route? Check `middleware.ts` and any role-based route guards.
- **Dashboard API** (`apps/api/app/api/endpoints/dashboard.py`): Does the supplier dashboard need product-related stats (e.g., "X products need cost")?

### 4. Frontend — Product List & Detail

- **Products page** (`apps/web/app/products/page.tsx`): Add a "Cost" column if suppliers/owners can see it. Respect RBAC: suppliers may see only cost (not price), or a limited view.
- **Product detail page** (`apps/web/app/products/[id]/page.tsx`): Add cost display and edit capability where permitted.
- **EditProductModal** (`apps/web/components/products/EditProductModal.tsx`): Add `cost_usd_cents` input (currency, cents or dollars — document convention). Validate non-negative, optional.
- **AddProductModal** (`apps/web/components/products/AddProductModal.tsx`): Add optional cost field on create.

### 5. Supplier-Specific UI (if applicable)

- **Supplier dashboard** (`apps/web/app/dashboard/supplier/page.tsx`): Should suppliers have a "Manage Product Costs" quick action or section? Or do they only edit costs from the Products page?
- **Supplier product view**: If suppliers see a reduced product list (only products they supply), verify the products API supports filtering by supplier. Check for `supplier_user_id` or similar on Product/Membership.

### 6. Financials Integration

- **Financials page** (`apps/web/app/financials/page.tsx`): Already shows "Product Costs" from `summary.product_costs`. Verify the backend returns this and it uses `Product.cost_usd_cents` × sold quantity.
- **Invoice expenses vs product costs**: Ensure the two are distinct in UI and backend. Invoices = uploaded expense docs; product costs = pre-entered unit cost × quantity sold.

### 7. Validation & Edge Cases

- **Cost format**: Stored in cents (integer). Frontend: accept dollars and convert, or cents with clear labeling?
- **Negative cost**: Reject or allow (e.g., credits)? Recommend reject.
- **Product without cost**: Financial service treats `cost_usd_cents = 0` or null as no cost — confirm behavior.
- **Product linked to multiple listings**: If one product maps to multiple Etsy listings, ensure `etsy_listing_id` → product cost join is correct in `_calc_product_costs`.

### 8. Translations

- **translations.ts**: Add keys for "Product Cost", "Cost per unit", "Add cost", etc. in `en` and `he` if the translation system is used for these screens.

---

## Output Format

Produce a structured report:

1. **Executive summary** — One paragraph: what's implemented, what's missing, high-level effort.
2. **Audit results** — One subsection per audit area above, with "Exists / Missing / Implementation steps."
3. **Implementation checklist** — Ordered list of tasks (migration → model → API → RBAC → frontend) with file paths and acceptance criteria.
4. **Risks & dependencies** — Breaking changes, permission model impact, data migration needs.

---

## Success Criteria

The audit is complete when:

- Every audit area has been inspected and documented.
- All missing pieces are identified with concrete implementation steps.
- The implementation checklist can be handed to a developer to execute without ambiguity.
- RBAC and supplier access are clearly defined (who can view/edit product cost, and from where).
