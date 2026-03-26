# PRD

## 🎯 Project Overview

**Goal:**  
Build an AI-assisted, policy-compliant automation platform for Etsy sellers — helping solo creators and small shops bulk-create listings, generate compliant AI titles/descriptions/tags, and safely publish at scale with strict rate limits and traceable audit logs.

**Mission Statement:**  
Empower Etsy sellers to scale their creativity, not their workload — automating repetitive publishing tasks while staying 100% compliant with Etsy and print-on-demand supplier policies.

**Target Beta Date:** January 31, 2026  
**Team Size:** 2–3 engineers  
**Infra Budget:** $300–$500/month

## 👥 Target Users

| Segment | Profile | Pain Points | Value |
| --- | --- | --- | --- |
| Solo Sellers | Single Etsy account, handmade products, limited time | Manual upload fatigue, repetitive SEO edits, fear of policy strikes | Bulk listing generation & one-click scheduling |
| Small Teams | 2–5 members, multiple listings daily | Coordination overhead, token refresh issues, inconsistent copy | Team dashboard, RBAC, AI-assisted copy compliance |
| External Fulfillment Sellers | Work with third-party suppliers | Manual tracking overhead, stock mismatches | Supplier profiles & manual tracking updates |

## 💡 Problem Statement

Sellers struggle to:
- Publish listings in bulk without hitting Etsy rate limits (HTTP 429).
- Track audit trails and supplier syncs.

The platform closes this gap by combining structured product ingestion, policy compliance checks, and rate-limited publishing pipelines.

## 🌟 Product Vision

“Your Etsy assistant that safely automates what you already know how to do — listings, schedules, and syncs — faster and 100% compliant.”

Core principles:
1. Compliance-first automation — never risk an account ban.
2. Transparency & control — every action logged, auditable, and idempotent.
3. AI with guardrails — creativity, not chaos.
4. Low-ops reliability — simple to run, simple to debug.

## 🚀 Core Features (MVP v1)

| Category | Feature | Description |
| --- | --- | --- |
| Multi-Tenant Dashboard | Orgs → Shops | Manage multiple Etsy shops within one org. RBAC (Owner/Admin/Creator/Viewer). |
| Shop Management | Connect, name, rename | Owners can name shops during connect and rename later; multi-shop list view. |
| Per-Shop Access | Creator/Viewer scope | Restrict team members to specific shops within a tenant. |
| Product Ingestion | CSV/JSON + images | Bulk upload structured product data. |
| Product Sync | Etsy ↔ platform | Pull listings into catalog and publish from platform to Etsy. |
| AI Generation | Titles/Descriptions/Tags | Model-agnostic text generation with policy filters. |
| Listing Publish Engine | Rate-limited jobs | Token-bucket enforcement per shop, idempotent publish/update. |
| Schedules | Quotas & cron | Auto-publish N listings daily/weekly per shop. |
| Order Sync & Tracking | Etsy-backed sync | Pull orders from Etsy and record manual tracking updates. |
| Usage & Cost Tracking | Token & API metering | Daily AI token and $ rollups per tenant. |
| Audit & Compliance | Full traceability | Every change logged with request ID and idempotency key. |
| Notifications | Event-driven | Notify users on order sync, publish results, and schedule issues. |
| Localization | i18n + RTL | Language toggle with full UI translations and RTL support. |

## 🧩 Non-Goals (Deferred Post-Beta)

- Trend detection and pricing optimization  
- Cross-marketplace expansion (eBay, Shopify)  
- Multi-supplier routing and automation  
- Deep analytics and revenue insights

## ⚙️ Constraints

- **Safe vs. Fast:** Rate-limit compliance takes precedence over throughput.  
- **Infra simplicity:** Single VM + managed DB + Redis; no Kubernetes.  
- **Data minimization:** No long-term buyer PII; GDPR-friendly deletions.  
- **Cost control:** Under $500 monthly during closed beta

---

## 🎯 Success Metrics

- 95%+ publish success rate per shop/day.
- p95 draft→live latency ≤ 10 minutes (schedules included).
- AI policy pass rate ≥ 90% on first attempt for seed dataset.
- < 2% daily task failure rate with auto-recovery ≥ 90%.
- 10–15 beta shops onboarded with 2+ weeks stable SLOs.

## 🧭 User Journeys (Happy Path)

1. **Connect shop** → OAuth → name shop → team access set.
2. **Ingest products** → CSV/JSON + images/variants.
3. **Generate AI copy** → policy flags shown → user approves.
4. **Publish or schedule** → rate-limited job → verify.
5. **Sync updates** → Etsy listings pulled into catalog.
6. **Orders** → sync → supplier tracking update.
7. **Review** → notifications + audit log.

## ✅ Acceptance Criteria (MVP)

- Etsy OAuth connect/refresh works for multiple shops.
- Product sync pulls all listing states and upserts catalog.
- Publish pipeline creates draft → publish → verify with idempotency.
- Schedules honor daily quotas and retry on failures.
- Notifications are created for publish, order sync, schedule errors.
- RBAC and per-shop access enforced for Creator/Viewer roles.
- Localization toggle translates UI text and supports RTL.

## ⚠️ Risks & Mitigations

- **Rate-limit saturation:** adaptive token buckets + queue backpressure.
- **OAuth expiry/revocation:** preemptive refresh, single-flight, user alerts.
- **AI compliance drift:** regression set + block/allow lists + auto-rewrite.
- **Data leakage:** strict PII minimization + retention controls.

## 🔒 Compliance & Policy Notes

- Etsy API Terms adhered to; scopes minimized to required actions.
- No resale of Etsy data; data visible only to shop owners/teams.
- Buyer PII minimized and deletable; retention windows enforced.
- Clear attribution/branding per Etsy requirements.

## 📌 Assumptions & Dependencies

- Etsy API access approved and stable for commercial use.
- Supplier tracking input available for fulfillment.
- OAuth apps and production credentials provisioned.

## 📣 Go‑To‑Market (Beta)

- Closed beta with 10–15 shops.
- Onboarding checklist + support channel.
- Weekly feedback loop to adjust UX and policy filters.

## 📊 Scope Progress (Current Build)

| Area | Status | Notes |
| --- | --- | --- |
| Multi-tenant + RBAC | ✅ Done | Owner/Admin/Creator/Viewer roles, tenant boundaries enforced. |
| Shop management | ✅ Done | Connect, name, rename, multi‑shop list, shop selection. |
| Per-shop access | ✅ Done | Creator/Viewer scoped access by shop. |
| Product ingestion | 🟡 In progress | Core import path exists; UX polishing pending. |
| Product sync (Etsy ↔ platform) | ✅ Done | Pull listings and publish to Etsy. |
| Listing publish engine | ✅ Done | Idempotent jobs with rate limiting. |
| Schedules | ✅ Done | Cron + daily quota support. |
| Order status tracking | ✅ Done | Separate payment vs lifecycle states, Etsy‑backed mapping. |
| Order sync & tracking | 🟡 In progress | Manual tracking flow being finalized. |
| Usage & cost tracking | 🟡 In progress | Data model ready, UI rollups pending. |
| Audit & compliance | ✅ Done | Audit logging + tracing in place. |
| Notifications | ✅ Done | Events wired; UI center polishing pending. |
| Localization | ✅ Done | i18n + RTL with expanded coverage. |

## ✅ What’s Done (Current Build)

- **Etsy OAuth + multi-shop support** with shop naming/renaming and multi-shop list view.
- **Per-shop access control** for Creator/Viewer roles.
- **Product sync (Etsy → platform)** with listing states pulled and upserted.
- **Publish flow (platform → Etsy)** wired via listing jobs and task pipeline.
- **Schedules** with daily quotas and cron support.
- **Order status tracking** with separate payment vs lifecycle states and Etsy-backed mapping.
- **Notifications** for order sync, listing publish outcomes, and schedule errors.
- **Improved login error handling** (backend-driven messages, sanitized in UI).
- **Translation system** with RTL support and expanded coverage across UI.
- **Production hardening** (logging cleanup, docs consolidation, deployment guidance).

## 🧭 Planned / Next

Short-term (pre‑beta):
- **Policy compliance UX** (visible flags + guided fixes) for AI-generated copy.
- **CSV/JSON ingestion UX** (validation, schema mapping, error report).
- **Usage & cost rollups** (daily per-tenant metrics in UI).
- **Order sync + manual tracking** workflow.
- **Audit log viewer** (filterable timeline per tenant/shop).
- **Notification center UX** (read/unread, filters, severity).
- **Localization coverage audit** (ensure 100% translated strings).

Post‑beta (deferred):
- Trend detection and pricing optimization.  
- Cross‑marketplace expansion (eBay, Shopify).  
- Multi‑supplier routing and automation.  
- Deep analytics and revenue insights.

## 🛠️ Engineering Notes (Non‑Product Scope)

- **Auth bypass feature flag** for dev/testing (reversible via env vars).
- **Migration alignment checks** (Alembic heads/current verified; documented recovery path).

