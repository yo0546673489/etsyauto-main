# System Requirements Specification (SRS)

## 1) Scope & Objectives

**Purpose:** Define the technical blueprint to deliver the Etsy Automation Platform to closed beta by Jan 31, 2026, for 2–3 engineers on $300–$500/mo infra.

**Primary Objectives**
- Multi-tenant web app with RBAC (Owner/Admin/Creator/Viewer).
- Shop management (connect, name/rename, multi-shop list).
- Per-shop access control for Creator/Viewer roles.
- Product ingestion (CSV/JSON + images/variants).
- Two-way product flow: sync from Etsy and publish to Etsy.
- AI copy generation (titles/descriptions/tags) with policy guardrails.
- Safe, rate-limited draft/publish/update to Etsy (idempotent).
- Schedules: enqueue N listings per shop/day.
- Order sync + manual tracking (happy path).
- Usage/cost metering and audit logs.
- Notifications for key events (orders, publish, schedules).
- Localization (i18n + RTL) for UI.

**Non-Goals (V1):** Trend detection, advanced routing, multi-marketplaces.

## 2) Architecture Overview

**Stack**
- Frontend: Next.js (App Router) + Tailwind, Auth.js (Postgres adapter).
- Backend: FastAPI (Python 3.11, Pydantic v2), Uvicorn/Gunicorn.
- Storage: PostgreSQL 16 (managed or VM), S3/R2 for optional images.
- Async: Celery + Redis 7 (broker), result persisted in Postgres via domain rows (no Redis result backend).
- Observability: Prometheus node/app exporters + Grafana; Sentry for errors.

**Deployment**
- Docker Compose on a single VM (8 vCPU/16GB) + Managed Postgres + small Redis.

**High-Level Flow**
1. User logs into Next.js; Auth.js session cookie is set (HttpOnly, SameSite=Lax).
2. Frontend calls `POST /api/auth/token` → FastAPI mints 5‑min RS256 JWT (aud=api).
3. User manages Tenants/Shops; connects Etsy via OAuth.
4. CSV/JSON ingestion writes products and assets to S3/R2 (optional).
5. User runs AI copy generation → policy checker stores `policy_flags` + costs.
6. Product sync pulls Etsy listings into the platform catalog.
7. User or Scheduler enqueues `listing_jobs`; Celery workers perform draft → publish → verify using per-shop token bucket in Redis.
8. Order sync cron pulls Etsy orders; suppliers record manual tracking.
9. Notifications are created on key outcomes and visible in UI.
10. Everything is audited; SLOs visible in Grafana.

**Service-to-Service Auth**
- Workers use M2M JWT (separate issuer/audience, minimal claims).
- Internal traffic on private Docker network.

## 2.1) Requirements Overview

**Functional Requirements**
- Connect Etsy shops via OAuth; store encrypted tokens.
- Ingest products (CSV/JSON) with images and variants.
- Sync Etsy listings into local catalog (all listing states).
- Generate AI copy with policy flags and cost tracking.
- Publish listings with idempotency and rate limiting.
- Schedule batch publishing with per-shop quotas.
- Sync orders and record manual tracking (happy path).
- Send user notifications for key events.
- Enforce RBAC + per-shop access control.

**Non-Functional Requirements**
- Availability: 99% uptime target for beta.
- Performance: p95 draft→live ≤ 10 minutes.
- Security: encrypted secrets, short‑lived JWTs, least privilege.
- Compliance: data minimization and auditable actions.
- Operability: logs + metrics + alerts with runbooks.

## 3) Tenancy & AuthN/AuthZ

**Tenancy**
- A Tenant (org) owns Shops (Etsy connections).
- Users belong to tenants through Memberships.

**RBAC**
- Owner: billing, members, delete.
- Admin: all but billing delete.
- Creator: import/generate/enqueue/publish.
- Viewer: read-only.

**JWT Claims (RS256, 5 min)**
```json
{
  "iss": "api",
  "aud": "api",
  "sub": "<user_id>",
  "tenant_id": "<tenant_id>",
  "role": "creator",
  "shop_ids": [1, 2, 3],
  "iat": 1730970000,
  "exp": 1730970300
}
```

**JWT Mint (FastAPI)**
```python
def mint_jwt(user, tenant, shops, private_key_pem: str) -> str:
    now = int(time.time())
    payload = {
        "iss": "api", "aud": "api", "sub": str(user.id),
        "tenant_id": str(tenant.id), "role": user.role,
        "shop_ids": [s.id for s in shops], "iat": now, "exp": now + 300
    }
    return jwt.encode(payload, private_key_pem, algorithm="RS256")
```

## 4) Data Model (DDL Excerpts)

Conventions: `id BIGSERIAL PK`, `created_at/updated_at TIMESTAMPTZ DEFAULT now()`, soft delete via `deleted_at`.

```sql
-- Tenancy
CREATE TABLE tenants(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  billing_tier TEXT CHECK (billing_tier IN ('starter','pro','enterprise')) DEFAULT 'starter',
  status TEXT CHECK (status IN ('active','suspended')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users(
  id BIGSERIAL PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT, -- nullable if SSO
  name TEXT,
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE memberships(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  tenant_id BIGINT REFERENCES tenants(id),
  role TEXT CHECK (role IN ('owner','admin','creator','viewer')) NOT NULL,
  allowed_shop_ids JSONB, -- optional per-shop access scope
  UNIQUE(user_id, tenant_id)
);

-- Shops & OAuth
CREATE TABLE shops(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  etsy_shop_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  status TEXT CHECK (status IN ('connected','revoked')) DEFAULT 'connected',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE oauth_tokens(
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT REFERENCES shops(id),
  provider TEXT CHECK (provider IN ('etsy')) NOT NULL,
  access_token BYTEA NOT NULL, -- encrypted
  refresh_token BYTEA, -- encrypted
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(shop_id, provider),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

-- Products & AI
CREATE TABLE products(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  shop_id BIGINT REFERENCES shops(id),
  etsy_listing_id TEXT,
  title_raw TEXT, description_raw TEXT,
  tags_raw JSONB, images JSONB, variants JSONB,
  source TEXT CHECK (source IN ('csv','json','api','etsy')) DEFAULT 'csv',
  ingest_batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_tags_gin ON products USING GIN(tags_raw);

CREATE TABLE ai_generations(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  product_id BIGINT REFERENCES products(id),
  model TEXT, prompt_hash TEXT,
  title TEXT, description TEXT, tags JSONB,
  policy_flags JSONB, status TEXT CHECK (status IN ('ok','flagged')) DEFAULT 'ok',
  cost_tokens INT DEFAULT 0, cost_usd_cents INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Jobs & Schedules
CREATE TABLE listing_jobs(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  shop_id BIGINT REFERENCES shops(id),
  product_id BIGINT REFERENCES products(id),
  ai_generation_id BIGINT REFERENCES ai_generations(id),
  idempotency_key TEXT UNIQUE,
  state TEXT CHECK (state IN ('queued','drafting','publishing','verifying','done','failed')) DEFAULT 'queued',
  error_code TEXT, error_detail JSONB, attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_listing_jobs_shop_state ON listing_jobs(shop_id, state);

CREATE TABLE schedules(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  shop_id BIGINT REFERENCES shops(id),
  cron_expr TEXT NOT NULL,
  daily_quota INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

-- Orders (minimal)
CREATE TABLE orders(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  shop_id BIGINT REFERENCES shops(id),
  etsy_receipt_id TEXT UNIQUE,
  status TEXT CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded')) DEFAULT 'pending',
  fulfillment_status TEXT, payment_status TEXT, shipments JSONB, supplier_user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

-- Usage & Audit
CREATE TABLE usage_costs(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  date DATE NOT NULL,
  ai_tokens INT DEFAULT 0, ai_cost_usd_cents INT DEFAULT 0,
  api_calls JSONB, storage_bytes BIGINT DEFAULT 0,
  UNIQUE(tenant_id, date)
);

CREATE TABLE audit_logs(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  actor_type TEXT CHECK (actor_type IN ('user','system','worker')),
  actor_id TEXT, shop_id BIGINT,
  action TEXT, target_type TEXT, target_id TEXT,
  request_id TEXT, idempotency_key TEXT,
  diff JSONB, status_code INT, latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, created_at DESC);

CREATE TABLE notifications(
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  shop_id BIGINT REFERENCES shops(id),
  user_id BIGINT REFERENCES users(id),
  type TEXT, severity TEXT,
  title TEXT, message TEXT, meta JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhook_events(
  id BIGSERIAL PRIMARY KEY,
  provider TEXT, external_id TEXT UNIQUE,
  payload JSONB, received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ, status TEXT CHECK (status IN ('pending','processed','skipped')) DEFAULT 'pending'
);
```

## 5) External Integrations

**Etsy**
- OAuth 2.0 (server-side), scopes for listings + orders (read for beta).
- Publish flow uses: `createDraftListing`, `updateListing`, `uploadListingImages`, `publishListing` (endpoint names illustrative).
- Respect rate limits with per-shop token bucket.

**Suppliers**
- Suppliers maintain profiles and record tracking manually.
- Tracking updates can optionally be synced to Etsy by admins.

## 6) Rate Limiting & Idempotency

**Per-Shop Token Bucket (Redis + Lua)**
- Key: `bucket:{shop_id}` with fields `{ tokens, ts }`.
- Capacity/Refill derived from Etsy quotas (configurable per endpoint).

```python
def take_token(shop_id: int, capacity: int, refill_per_sec: float) -> bool:
    script = redis_client.register_script(LUA)
    now_ms = int(time.time() * 1000)
    res = script(keys=[f"bucket:{shop_id}"], args=[capacity, refill_per_sec, now_ms])
    return res != -1
```

**Idempotency**
- All mutating REST endpoints require `Idempotency-Key` header.
- `listing_jobs.idempotency_key` is unique.
- Webhooks dedupe by `webhook_events.external_id`.

**Retry Strategy**
- Exponential backoff with jitter: base 2–8s, cap 5 min.
- Circuit-breaker when consecutive 429s exceed threshold.

## 7) API Contracts (REST)

**Standards**
- Authorization: `Bearer <JWT>`
- `Idempotency-Key: <uuid>` on POST/PUT/PATCH/DELETE
- `X-Request-Id: <uuid>` (client supplies or server generates)

**Error Envelope**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Shop bucket exhausted, retry later",
    "retry_after_ms": 8000,
    "request_id": "req_123",
    "details": {"shop_id": 42}
  }
}
```

**Auth**
- `POST /api/auth/token` → `{ access_token, expires_in }`

**Shops**
- `POST /api/shops/etsy/connect` → `{ auth_url }`
- `GET /api/shops/etsy/callback?code&state` → `302 → dashboard`
- `GET /api/shops` → `[{id, display_name, status}]`
- `PATCH /api/shops/{shop_id}` → `{ display_name }`

**Team**
- `PATCH /api/team/members/{user_id}/shops` → `{ shop_ids: [1,2,3] }`

**Products**
- `POST /api/products/import` (multipart)
  - Files: `file.csv` OR JSON body `{ products: [...] }`
  - Response: `{ ingest_batch_id }`
- `GET /api/products?batch=abc&page=1&limit=50`
  - Response: `{ items:[...], page, total }`
- `POST /api/products/sync/etsy`
  - `{ "shop_id": 123 }` → triggers Etsy listing sync

**CSV Columns (baseline)**
- `title, description, tags (| separated), image_urls (|), variants_json`

**Listing Jobs**
- `POST /api/shops/{shop_id}/listings`
  - `{ "product_id":123, "publish": true }`
  - Response: `{ "listing_job_id": 987 }`
- `GET /api/listing-jobs/{id}`
  - `{ "state":"publishing","attempts":2,"etsy_listing_id":null,"error":null }`

**Schedules**
- `POST /api/shops/{shop_id}/schedules`
  - `{ "cron_expr":"0 9 * * *", "daily_quota": 25 }`
- `GET /api/shops/{shop_id}/schedules` → list

**Orders (Happy Path)**
- `POST /api/orders/sync` → pulls latest Etsy receipts (time-windowed).
- `POST /api/orders/{id}/tracking` → records manual tracking details.

**Webhooks (future-safe)**
- `POST /api/webhooks/{provider}` → 200 on duplicate; enqueue.

**Notifications**
- `GET /api/notifications` → list
- `PATCH /api/notifications/{id}` → mark read

## 8) Core Worker Flows (Celery)

**Publish Pipeline**
```python
@app.task(bind=True, autoretry_for=(RateLimited, ExternalError),
          retry_backoff=True, retry_jitter=True, max_retries=7)
def publish_listing(self, listing_job_id: int):
    job = repo.get_listing_job(listing_job_id)
    repo.update_state(job.id, 'drafting')
    with redis_token_bucket(shop_id=job.shop_id):
        draft = etsy.create_draft(job)
    repo.update_state(job.id, 'publishing')
    with redis_token_bucket(shop_id=job.shop_id):
        live = etsy.publish(draft)
    repo.update_state(job.id, 'verifying')
    with redis_token_bucket(shop_id=job.shop_id):
        verify = etsy.get_listing(live.id)
    repo.mark_done(job.id, etsy_listing_id=verify.id)
```

**Scheduler Runner**
```python
@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    # run every 5 minutes
    sender.add_periodic_task(300.0, schedule_tick.s())

@app.task
def schedule_tick():
    for s in repo.get_active_schedules_now():
        remaining = repo.get_remaining_quota_today(s.id)
        if remaining <= 0:
            continue
        product_ids = repo.pick_next_products(s.shop_id, remaining)
        for pid in product_ids:
            enqueue_listing.delay(shop_id=s.shop_id, product_id=pid)
```

**Order Sync (happy path)**
```python
@app.task
def sync_orders():
    for shop in repo.get_shops_with_orders_enabled():
        receipts = etsy.fetch_new_receipts(shop)
        for r in receipts:
            oid = repo.ensure_order(shop.id, r)
            # suppliers record tracking manually when ready
```

## 9) Phased Execution (CareerBuddy Style)

**Phase 0 — Foundation (Weeks 1–2)**
- Monorepo, Docker Compose, CI (lint, type, tests, build), health endpoints.  
Exit: docker compose up runs web/api/worker/db/redis; CI green.

**Phase 1 — Tenancy & OAuth (Weeks 3–5)**
- Tenants, Memberships, Shops, OAuth tokens (encrypted), Etsy connect/refresh, audit middleware.  
Exit: Connect + refresh works; audit shows events; RBAC enforced.

**Phase 2 — Ingestion & AI (Weeks 6–9)**
- CSV/JSON ingest, batch IDs, AI adapters + policy checks, cost logging, preview UI.  
Exit: 95% first-pass compliance on seed set; ±5% cost accuracy.

**Phase 3 — Orchestration & Beta (Weeks 10–14)**
- Listing jobs, Redis token bucket, schedules, manual tracking workflow, observability (Prom/Grafana/Sentry), usage rollups, invite gating.  
Exit: 1k listings across 10 shops, <1% task failures; p95 publish ≤ 10 min; beta live.

Timeline buffer (Weeks 15–16) for polish & beta feedback.

## 10) Observability, SLOs, Alerts & Runbooks

**Golden Signals**
- API: RPS, p50/p95 latency, 4xx/5xx, JWT mint errors.
- Workers: queue depth, task success%, retries, time-in-state.
- External: Etsy 429/5xx rates, token refresh failures.
- Business: listings/day, AI pass rate, cost/day per tenant.

**SLOs (Beta)**
- Draft→Live p95 ≤ 10 min.
- Webhook/event processing p95 ≤ 2 min.
- Daily task failure rate ≤ 2%; auto-recovered ≥ 90%.
- Token refresh MTTR < 15 min.

**Alerts**
- Page: queue depth > 5k (10 min), 429 streak > 10 min, job failure > 5% (15 min), DB error spike (5 min).
- Ticket: AI policy fail-rate > 15% day, cost/day variance > 2× 7d mean.

**Runbooks**
- “429 storm”: enable adaptive throttle (halve refill), drain queue; post-mortem.
- “Token refresh loop”: single-flight refresh; revoke bad tokens; notify shop owner.
- “Redis restart”: verify Lua keys; check dedupe TTLs; resume jobs.
- “Etsy outage”: circuit open; queue gate; customer comms.

## 11) Security & Compliance

- Least privilege: DB roles per service; workers limited schema rights.
- Secrets: AES-GCM app-level encryption for OAuth tokens; KMS or libsodium; 90-day rotation.
- Cookies: HttpOnly, SameSite=Lax; JWT TTL 5 min; refresh via session cookie.
- Data minimization: store only for listings & reconciliation; delete buyer PII.
- Audit: all external calls logged (action, target, status, latency).
- Retention: AI prompts/outputs 90d; webhook raw 7d; audit 365d (configurable).

## 11.1) Privacy & Data Handling

- Buyer PII is stored only when required for order fulfillment.
- Retention windows are enforced per data type.
- Data deletion requests remove user data and soft-delete resources.

## 12) Resilience & Disaster Recovery

- Postgres: Managed with PITR (WAL). RPO ≤ 15m, RTO ≤ 60m.
- Redis: Volatile; token buckets rehydrate; dedupe keys TTL 1h; jobs replayable.
- Idempotency: all writes keyed; webhooks deduped by `external_id`.
- Backoff & Jitter: protects from herds; circuit-break on extended outage.
- Backups/Drills: monthly restore test; quarterly chaos (kill Redis, Etsy 429).

## 13) Testing Strategy

**Unit**
- CSV parser, AI adapter mocks, policy rules, token bucket math, OAuth refresh logic.

**Contract**
- Etsy stubs via respx/Pact; record/replay golden paths; validate error shapes.

**E2E (Playwright)**
- Login → connect shop → import → generate → enqueue → publish → verify.

**Load**
- 1k listings across 10 shops within 2 hours; success ≥ 98%.

**Security**
- JWT tamper tests; OAuth replay with stale state; CSV injection (formula/HTML).

**Chaos**
- Redis kill during publish; Etsy 429/500 ramp; network partitions.

## 14) Infrastructure Budget

**Budget Fit (Typical)**
- VM: $40–$120 (Hetzner/DigitalOcean).
- Managed Postgres: $60–$150 (storage + PITR).
- Redis: $15–$50.
- S3/R2: PAYG ($5–$20).
- Sentry: free/low tier.
- Total Target: $300–$500/mo.

## 15) Risks & Mitigations

- Rate-limit saturation → adaptive token buckets; dynamic refill; preflight quota checks.
- OAuth expiry/revocation → preemptive refresh, single-flight, user notice.
- Policy compliance drift → regression set & thresholds; block/allow lists.
- CSV variance → mapping UI; schema inference; clear reject reports.
- Long-tail publish failures → stepwise retries; partial success; human review queue.
- Infra constraints → no K8s; scale VM vertically; add worker process first.

## 16) Acceptance & Exit Criteria (SRS)

- Architecture deployed in staging via Compose; CI green.
- Data schema migrated; RBAC enforced; audit logs populated.
- APIs pass contract tests; error envelope consistent.
- Workers execute publish pipeline with token buckets; retries verified.
- Scheduler honors daily quotas; backfills gracefully.
- Order sync completes happy path; tracking posted.
- Observability dashboards live; alerts routed; runbooks linked.
- Load test (1k/10 shops) meets SLOs; chaos drills pass.
- Security checks pass (JWT, OAuth, CSV).
- Beta: 10–15 shops onboarded; 2 weeks stable SLOs.

## 17) Appendices

**Docker Compose (excerpt)**
```yaml
services:
  web:
    build: ./apps/web
    env_file: .env
    depends_on: [api]
  api:
    build: ./apps/api
    env_file: .env
    depends_on: [db, redis]
    ports: ["8080:8080"]
  worker:
    build: ./apps/worker
    env_file: .env
    depends_on: [api, db, redis]
  db:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: postgres }
    volumes: ["pg:/var/lib/postgresql/data"]
  redis:
    image: redis:7
volumes: { pg: {} }
```

**FastAPI Health & Metrics**
```python
@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/metrics")
def metrics():
    return Response(generate_prom_metrics(), media_type="text/plain")
```

**Policy Checker (simplified)**
```python
def policy_check(texts: dict) -> dict:
    flags = {"handmade_ok": True, "prohibited_terms": []}
    banned = ["counterfeit", "mass-produced", "AI-made product"]  # example
    blob = f"{texts['title']} {texts['description']} {' '.join(texts['tags'])}"
    for w in banned:
        if w.lower() in blob.lower():
            flags["prohibited_terms"].append(w)
    if "handmade" not in blob.lower():
        flags["handmade_ok"] = False
    return flags
```

---

## ✅ What’s Done (Current Build)

- Etsy OAuth connect/callback and token storage.
- Multi-shop support with shop naming + rename.
- Per-shop access control for Creator/Viewer roles.
- Product sync from Etsy (active/inactive/draft/sold_out).
- Publish listing flow wired from platform → Etsy.
- Notifications for order sync, listing publish, and schedule failures.
- Login error handling hardened (backend messages, sanitized UI).
- Translation system with RTL support and expanded coverage.

## 🧭 Planned / Next (Pre‑Beta)

- CSV/JSON ingestion UI with validation + mapping.
- AI generation UI with policy flag visibility + guided fixes.
- Usage/cost rollups in UI (per-tenant daily).
- Audit log viewer and export.
- Order sync + manual tracking productionized.
- Monitoring dashboards (Prom/Grafana) + alerting wired.
- E2E Playwright tests for full publish flow.
- Notification center UX with filters + bulk mark read.
- Localization coverage audit and test automation.

## 18) Assumptions & Dependencies

- Etsy API access approved for commercial use.
- OAuth apps configured with correct redirect URIs.
- Supplier tracking workflow available for order sync.
- Redis and Postgres capacity sized for beta load.

## 19) Open Questions

- Final Etsy API scopes for beta approval.
- Decide if/when to add supplier automation provider.
- Data retention windows for order data in production.

