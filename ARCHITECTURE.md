# Project Architecture

## System Overview

> **Etsy-Exclusive Platform**: Purpose-built for Etsy marketplace automation. All components are optimized for Etsy's API, policies, and seller workflows.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER BROWSER                              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ HTTPS (Port 3000)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       NEXT.JS FRONTEND                              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Edge Middleware (middleware.ts)                              │   │
│  │  • Route-level auth: checks access_token cookie             │   │
│  │  • Redirects unauthenticated users to /login                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  • 30+ pages (App Router): Dashboard, Products, Listings,         │
│    Orders, Schedules, Analytics, Audit, Suppliers, Settings         │
│  • Role-based dashboards: Owner, Admin, Supplier, Viewer           │
│  • HttpOnly cookie auth (credentials: 'include')                   │
│  • Silent 401 refresh interceptor with mutex                       │
│  • Tailwind CSS + Blue-Green Theme                                 │
│  • TypeScript + React Server Components                            │
│  • i18n / RTL support                                              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ REST API (Port 8080)
                              │ HttpOnly cookies (access_token, refresh_token)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FASTAPI BACKEND                              │
│                                                                     │
│  ┌── Middleware Layer ──────────────────────────────────────────┐   │
│  │ CORS (credentials) │ Audit │ Idempotency │ Metrics │ Sentry │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌── API Endpoints (23 routers) ───────────────────────────────┐   │
│  │ /api/auth          - Login, register, refresh, logout       │   │
│  │ /api/auth/google   - Google OAuth (PKCE)                    │   │
│  │ /api/shops         - Etsy OAuth connect, shop management    │   │
│  │ /api/products      - CSV/JSON import, CRUD, sync            │   │
│  │ /api/listings      - Publish pipeline, job management       │   │
│  │ /api/orders        - Etsy sync, manual tracking, fulfill    │   │
│  │ /api/schedules     - Cron schedules, quota management       │   │
│  │ /api/ingestion     - Batch CSV/JSON upload pipeline         │   │
│  │ /api/policy        - Content policy enforcement             │   │
│  │ /api/analytics     - Revenue, conversion, performance       │   │
│  │ /api/audit         - Audit log queries                      │   │
│  │ /api/notifications - User notification center               │   │
│  │ /api/team          - Membership + invitation management     │   │
│  │ /api/suppliers     - Supplier profile management            │   │
│  │ /api/onboarding    - First-run setup wizard                 │   │
│  │ /api/errors        - Error report management                │   │
│  │ /api/webhooks      - Etsy webhook receiver                  │   │
│  │ /api/dashboard     - Dashboard summary data                 │   │
│  │ /api/metrics       - Prometheus metrics endpoint            │   │
│  │ /healthz           - Health + readiness check               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌── Core Services ────────────────────────────────────────────┐   │
│  │ security.py        - JWT (RS256), HttpOnly cookies, RBAC    │   │
│  │ etsy_client.py     - Etsy API + circuit breaker integration │   │
│  │ rate_limiter.py    - Atomic Redis Lua token bucket          │   │
│  │ circuit_breaker.py - Three-state per-shop circuit breaker   │   │
│  │ csv_validator.py   - Schema validation + sanitization       │   │
│  │ encryption.py      - AES-GCM for OAuth tokens              │   │
│  │ token_manager.py   - OAuth token refresh (single-flight)    │   │
│  │ policy_engine.py   - Content compliance checker             │   │
│  │ quota_manager.py   - Daily/weekly publish quota tracking    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Startup: ENV validation (DATABASE_URL, JWT keys, REDIS_URL,       │
│           CORS_ORIGINS, Etsy creds in production)                   │
└────────┬──────────────────┬──────────────────┬──────────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌────────────────┐  ┌──────────────┐  ┌───────────────────────┐
│   POSTGRESQL   │  │    REDIS     │  │    CELERY WORKERS     │
│   (Port 5432)  │  │  (Port 6379) │  │                       │
│                │  │              │  │  10 task modules:      │
│ 20+ models:    │  │ • Rate limit │  │  • listing_tasks      │
│ • tenants      │  │   Lua bucket │  │  • order_tasks        │
│ • users        │  │ • Celery     │  │  • schedule_tasks     │
│ • memberships  │  │   broker     │  │  • scheduled_publishing│
│ • shops        │  │ • Idempotency│  │  • token_tasks        │
│ • oauth_tokens │  │   cache      │  │  • product_sync_tasks │
│ • products     │  │ • OAuth state│  │  • webhook_tasks      │
│ • ai_gens      │  │ • Session    │  │  • audit_cleanup      │
│ • listing_jobs │  │   locks      │  │  • ingestion_tasks    │
│ • orders       │  │              │  │                       │
│ • schedules    │  └──────────────┘  │  All tasks:           │
│ • shipment_    │                    │  max_retries=3         │
│   events       │                    │                       │
│ • usage_costs  │  ┌──────────────┐  │  7 periodic beat jobs │
│ • audit_logs   │  │ CELERY BEAT  │  └───────────────────────┘
│ • notifications│  │ (Scheduler)  │
│ • error_reports│  │              │
│ • api_keys     │  │ • Every 5m:  │
│ • ingestion_   │  │   schedules  │
│   batches      │  │ • Every 15m: │
│ • oauth_       │  │   token audit│
│   providers    │  │ • Every 1h:  │
│                │  │   order sync │
│ FK integrity:  │  │ • Daily:     │
│ CASCADE /      │  │   audit purge│
│ SET NULL on    │  │   quota reset│
│ all FKs        │  └──────────────┘
└────────────────┘
```

### External Services

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Etsy API   │  │  Google API  │  │   Sentry     │
│              │  │              │  │              │
│ • OAuth 2.0  │  │ • OAuth 2.0  │  │ • Error      │
│   (PKCE)     │  │   (login)    │  │   tracking   │
│ • Listings   │  │ • ID token   │  │ • PII        │
│ • Orders     │  │   verify     │  │   scrubbing  │
│ • Receipts   │  │              │  │              │
│              │  │              │  │              │
│ Circuit      │  └──────────────┘  └──────────────┘
│ breaker:     │
│ closed/open/ │  ┌──────────────────────────────────────────────────┐
│ half-open    │  │           OBSERVABILITY STACK                    │
│              │  │                                                  │
│ Rate limiter:│  │  Prometheus (:9090) → Grafana (:3001)           │
│ Atomic Lua   │  │  Alertmanager (:9093) → Email / Slack / Webhook │
│ token bucket │  │  Node Exporter + cAdvisor (host/container)      │
└──────────────┘  │  4 dashboards: API, OAuth, Worker, Rate Limiter │
                  │  20+ alert rules (7 groups)                     │
                  └──────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### 1. Authentication Flow (HttpOnly Cookies)

```
User → Next.js → POST /api/auth/login → Verify credentials
                                       → Generate JWT (RS256, 5-min TTL)
                                       → Generate refresh token (30-day TTL)
                                       → Set HttpOnly cookies:
                                           access_token  (SameSite=Lax, Secure)
                                           refresh_token (SameSite=Lax, Secure, /api/auth)
                                       → Return user profile (no tokens in body)

Silent Refresh (on 401):
Frontend 401 interceptor → POST /api/auth/refresh (refresh_token cookie)
                         → Validate refresh token
                         → Issue new access_token cookie
                         → Retry original request

Logout:
POST /api/auth/logout → Clear both cookies → Redirect to /login
```

### 2. Product Import Flow (with CSV Validation)

```
User → Upload CSV → Next.js → POST /api/products/import
                             → Decode UTF-8 (reject non-UTF-8)
                             → csv_validator.validate_and_sanitize_csv():
                                 • Enforce required columns (title)
                                 • Strip formula injection (=, +, -, @, \t, \r)
                                 • Strip HTML tags
                                 • Validate numeric fields (price, quantity)
                                 • Collect row-level errors
                             → Store valid rows in products table
                             → Return { imported, skipped, row_errors[] }
```

### 3. Listing Publish Flow (with Circuit Breaker)

```
User → Click "Publish" → POST /api/shops/{id}/listings
                        → Create listing_job (pending)
                        → Enqueue Celery task

Celery Worker → Pick job → circuit_breaker.before_request(shop_id)
                         → If OPEN: raise CircuitOpenError → retry later
                         → rate_limiter.acquire(shop_id) [atomic Lua]
                         → Create Etsy draft listing
                         → Upload images
                         → Publish listing
                         → circuit_breaker.record_success(shop_id)
                         → Verify listing on Etsy (GET)
                         → Update job state (completed)
                         → Log audit entry

On Etsy 429/5xx:
    → circuit_breaker.record_failure(shop_id, status)
    → After threshold: circuit opens → blocks calls for cooldown
    → Half-open: allows one probe → success resets, failure re-opens
```

### 4. Scheduled Publishing Flow

```
Celery Beat → Every 5 min → Check active schedules
                           → quota_manager.check_remaining()
                           → Pick eligible products
                           → Enqueue listing_jobs (respects daily/weekly quota)
                           → rate_limiter enforces per-shop Etsy limits
```

### 5. Order Sync Flow

```
Celery Worker → Fetch Etsy receipts → Upsert into orders table
                                    → Match with products (by listing ID)
                                    → Track shipment events
                                    → Record state transitions

Manual Tracking:
Supplier → POST /orders/{id}/tracking → Add tracking code + carrier
Admin    → Review → POST /orders/{id}/fulfill → Submit to Etsy API
```

---

## Tech Stack

```
┌─────────────┬──────────────────────────────────────────────────────┐
│  Layer      │  Technology                                          │
├─────────────┼──────────────────────────────────────────────────────┤
│  Frontend   │  Next.js 14, React 18, TypeScript, App Router       │
│  Styling    │  Tailwind CSS, Custom Blue-Green Dark Theme          │
│  Auth       │  HttpOnly cookies (RS256 JWT), refresh tokens        │
│             │  Google OAuth, Etsy OAuth (PKCE)                     │
│  Backend    │  FastAPI, Python 3.11, Pydantic v2                   │
│  Database   │  PostgreSQL 16, SQLAlchemy 2.0, Alembic              │
│  Cache      │  Redis 7 (Lua scripting for rate limiter)            │
│  Queue      │  Celery 5.3 + Redis broker + Beat scheduler         │
│  Messaging  │  IMAP listener, Etsy conversations API              │
│  Security   │  AES-GCM encryption, RBAC (5 roles, 30+ perms)      │
│  Resilience │  Circuit breaker, atomic rate limiter, idempotency   │
│  Monitoring │  Prometheus, Grafana (4 dashboards), Alertmanager    │
│  Errors     │  Sentry (tenant/shop tags, PII scrubbing)            │
│  Email      │  Resend / SMTP (verification, password reset)        │
│  Container  │  Docker, Docker Compose (dev + prod profiles)        │
│  CI/CD      │  GitHub Actions (lint, test, build)                  │
└─────────────┴──────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
etsy-automation-platform/
│
├── apps/
│   ├── api/                          ← FastAPI Backend
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── endpoints/        ← 23 API routers
│   │   │   │   │   ├── auth.py           Login, register, refresh, logout
│   │   │   │   │   ├── google_oauth.py   Google OAuth flow
│   │   │   │   │   ├── shops.py          Etsy OAuth + shop CRUD
│   │   │   │   │   ├── products.py       CSV/JSON import, CRUD
│   │   │   │   │   ├── listings.py       Publish pipeline
│   │   │   │   │   ├── orders.py         Order sync + tracking
│   │   │   │   │   ├── schedules.py      Cron schedules
│   │   │   │   │   ├── ingestion.py      Batch ingestion
│   │   │   │   │   ├── policy.py         Content policy
│   │   │   │   │   ├── analytics.py      Revenue/performance
│   │   │   │   │   ├── audit.py          Audit log queries
│   │   │   │   │   ├── notifications.py  Notification center
│   │   │   │   │   ├── team.py           Membership/invitations
│   │   │   │   │   ├── suppliers.py      Supplier profiles
│   │   │   │   │   ├── onboarding.py     Setup wizard
│   │   │   │   │   ├── webhooks.py       Etsy webhooks
│   │   │   │   │   ├── errors.py         Error reports
│   │   │   │   │   ├── dashboard.py      Dashboard summaries
│   │   │   │   │   └── metrics.py        Prometheus /metrics
│   │   │   │   ├── dependencies.py   ← Auth (cookie-first), RBAC
│   │   │   │   └── dependencies/rbac.py
│   │   │   │
│   │   │   ├── models/               ← SQLAlchemy models (20+ tables)
│   │   │   │   ├── tenancy.py            User, Tenant, Membership, Shop,
│   │   │   │   │                         SupplierProfile, OAuthToken
│   │   │   │   ├── listings.py           Product, ListingJob,
│   │   │   │   │                         Schedule, Order, ShipmentEvent,
│   │   │   │   │                         UsageCost, AuditLog
│   │   │   │   ├── notifications.py      Notification
│   │   │   │   ├── errors.py             ErrorReport
│   │   │   │   ├── api_keys.py           APIKey
│   │   │   │   ├── ingestion.py          IngestionBatch
│   │   │   │   └── oauth.py              OAuthProvider
│   │   │   │
│   │   │   ├── services/             ← Business logic (25+ services)
│   │   │   │   ├── etsy_client.py        Etsy API client + circuit breaker
│   │   │   │   ├── etsy_oauth.py         Etsy OAuth PKCE flow
│   │   │   │   ├── rate_limiter.py       Atomic Redis Lua token bucket
│   │   │   │   ├── circuit_breaker.py    Three-state circuit breaker
│   │   │   │   ├── csv_validator.py      CSV schema validation + sanitization
│   │   │   │   ├── encryption.py         AES-GCM token encryption
│   │   │   │   ├── token_manager.py      OAuth token refresh
│   │   │   │   ├── policy_engine.py      Content policy enforcement
│   │   │   │   ├── quota_manager.py      Daily/weekly quota tracking
│   │   │   │   ├── google_oauth.py       Google OAuth service
│   │   │   │   ├── analytics_service.py
│   │   │   │   ├── notification_service.py
│   │   │   │   ├── ingestion_service.py
│   │   │   │   └── email_service.py
│   │   │   │
│   │   │   ├── core/                 ← Config, security, infra
│   │   │   │   ├── config.py             Settings (Pydantic BaseSettings)
│   │   │   │   ├── security.py           JWT, cookies, password hashing
│   │   │   │   ├── rbac.py               30+ permissions, 5 roles
│   │   │   │   ├── database.py           SQLAlchemy engine + sessions
│   │   │   │   ├── redis.py              Redis connection
│   │   │   │   ├── jwt_manager.py        Token lifecycle management
│   │   │   │   ├── sentry_config.py      Sentry DSN + PII scrubbing
│   │   │   │   ├── query_helpers.py      Tenant-scoped query filters
│   │   │   │   ├── auth_rate_limiter.py  Login attempt throttling
│   │   │   │   └── password_validator.py
│   │   │   │
│   │   │   ├── middleware/           ← ASGI middleware
│   │   │   │   ├── audit_middleware.py   Request/action audit logging
│   │   │   │   ├── idempotency.py        Idempotency-Key enforcement
│   │   │   │   ├── metrics_middleware.py  Prometheus request metrics
│   │   │   │   ├── sentry_middleware.py   Sentry context enrichment
│   │   │   │   └── tenant_context.py     Tenant isolation
│   │   │   │
│   │   │   ├── worker/              ← Celery task system
│   │   │   │   ├── celery_app.py         App + beat schedule (7 periodic)
│   │   │   │   └── tasks/
│   │   │   │       ├── listing_tasks.py      Publish pipeline
│   │   │   │       ├── order_tasks.py        Order sync + reconcile
│   │   │   │       ├── schedule_tasks.py     Schedule execution
│   │   │   │       ├── scheduled_publishing.py  Quota-managed publishing
│   │   │   │       ├── token_tasks.py        OAuth token maintenance
│   │   │   │       ├── product_sync_tasks.py Etsy → product catalog
│   │   │   │       ├── webhook_tasks.py      Webhook event processing
│   │   │   │       ├── audit_cleanup.py      Audit log retention
│   │   │   │       └── ingestion_tasks.py    Batch import processing
│   │   │   │
│   │   │   ├── observability/        ← Metrics + Sentry integration
│   │   │   │   ├── metrics.py            Prometheus counters/histograms
│   │   │   │   ├── celery_metrics.py     Worker task metrics
│   │   │   │   └── celery_sentry.py      Celery → Sentry bridge
│   │   │   │
│   │   │   └── schemas/              ← Pydantic request/response schemas
│   │   │
│   │   ├── alembic/                  ← Database migrations (29 versions)
│   │   ├── tests/                    ← Backend tests (17 test files)
│   │   ├── main.py                   ← App entry + startup ENV validation
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── web/                          ← Next.js Frontend
│   │   ├── middleware.ts             ← Edge Middleware (route-level auth)
│   │   ├── app/                      ← App Router (30+ pages)
│   │   │   ├── layout.tsx                Root layout + providers
│   │   │   ├── page.tsx                  Dashboard
│   │   │   ├── login/                    Login page
│   │   │   ├── register/                 Registration
│   │   │   ├── dashboard/                Role-based dashboards
│   │   │   │   ├── owner/
│   │   │   │   ├── admin/
│   │   │   │   ├── supplier/
│   │   │   │   └── viewer/
│   │   │   ├── products/                 Product management
│   │   │   ├── listings/                 Listing management
│   │   │   ├── orders/                   Order management
│   │   │   ├── schedules/               Schedule management
│   │   │   ├── analytics/               Analytics dashboard
│   │   │   ├── audit/                   Audit log viewer
│   │   │   ├── suppliers/               Supplier management
│   │   │   ├── ingestion/               Batch import UI
│   │   │   ├── errors/                  Error report viewer
│   │   │   ├── settings/               User settings
│   │   │   ├── oauth/etsy/callback/     Etsy OAuth callback
│   │   │   ├── accept-invitation/       Team invitation
│   │   │   └── ...                      (verify-email, forgot-password, etc.)
│   │   │
│   │   ├── components/               ← React components
│   │   │   ├── layout/                   Sidebar, TopBar, DashboardLayout
│   │   │   ├── dashboard/                ConnectionStatus, RecentOrders, etc.
│   │   │   ├── products/                 Import, Edit, Policy modals
│   │   │   ├── orders/                   Message draft modal
│   │   │   ├── schedules/                New schedule, quota config modals
│   │   │   ├── onboarding/               Setup wizard
│   │   │   ├── auth/                     AuthLayout
│   │   │   ├── modals/                   Confirm, AI Error, Notification
│   │   │   └── ui/                       Alert, DataTable
│   │   │
│   │   ├── lib/                      ← Frontend utilities
│   │   │   ├── api.ts                    API client (credentials:'include',
│   │   │   │                             401 refresh interceptor)
│   │   │   ├── auth-context.tsx          Auth state (cookie-driven)
│   │   │   ├── shop-context.tsx          Active shop state
│   │   │   ├── toast-context.tsx         Toast notifications
│   │   │   ├── translations.ts           i18n translations
│   │   │   └── utils.ts
│   │   │
│   │   ├── e2e/                      ← Playwright E2E tests
│   │   ├── tailwind.config.js        ← Custom theme
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── worker/                       ← Standalone worker Dockerfile
│       ├── tasks.py
│       ├── requirements.txt
│       └── Dockerfile
│
├── observability/                    ← Full observability stack
│   ├── docker-compose.observability.yml   (Prometheus, Grafana, Alertmanager,
│   │                                       Node Exporter, cAdvisor)
│   ├── prometheus/
│   │   ├── prometheus.yml                 Scrape config (6 targets)
│   │   └── alerts.yml                     20+ alert rules (7 groups)
│   ├── alertmanager/
│   │   └── alertmanager.yml               Routing tree + receivers
│   ├── grafana/
│   │   ├── dashboards/                    4 pre-built dashboards
│   │   │   ├── api-dashboard.json
│   │   │   ├── oauth-dashboard.json
│   │   │   ├── worker-dashboard.json
│   │   │   └── rate-limiter-dashboard.json
│   │   └── provisioning/                  Auto-configured datasource
│   └── README.md
│
├── monitoring/                       ← Legacy Prometheus config
│   └── prometheus.yml
│
├── runbooks/                         ← Incident response guides
│   ├── RATE_LIMIT_429_STORM.md
│   ├── TOKEN-REFRESH-LOOP.md
│   ├── REDIS_RESTART.md
│   ├── OAUTH_FAILURE.md
│   ├── QUEUE_SATURATION.md
│   ├── ETSY-API-OUTAGE.md
│   └── README.md
│
├── load_tests/
│   └── locustfile.py                 ← Locust load test scenarios
│
├── docs/
│   ├── PRD.md                        ← Product Requirements Document
│   ├── SRS.md                        ← Software Requirements Specification
│   └── MIGRATION_OPERATIONS.md
│
├── .github/workflows/ci.yml         ← CI pipeline (lint, test, build)
│
├── docker-compose.yml                ← Dev: 8 services
├── docker-compose.prod.yml           ← Prod: 7 services + nginx
├── .env.example                      ← Config template
├── deploy-to-production.sh           ← Deployment script (backup/rollback)
│
├── README.md
├── ARCHITECTURE.md                   ← This file
├── GAP_AND_READINESS_ANALYSIS.md     ← Audit report + remediation status
├── DATABASE_MANAGEMENT_GUIDE.md
├── DEPLOYMENT.md
├── DEPLOYMENT_CHECKLIST.md
├── DEPLOYMENT_WORKFLOW.md
├── PRODUCTION_READY.md
├── TESTING_GUIDE.md
├── TROUBLESHOOTING.md
├── QUICK_START.md
├── QUICK_REFERENCE.md
│
├── setup.ps1 / start.ps1 / stop.ps1 / restart.ps1 / health.ps1
└── sample-products.csv
```

---

## Security Architecture

```
Layer          Security Feature                         Status
──────────────────────────────────────────────────────────────────
Auth           JWT RS256 (5-min TTL) in HttpOnly          ✅
               cookies, SameSite=Lax, Secure
               Refresh tokens (30-day TTL, /api/auth)     ✅
               Password hashing (bcrypt)                   ✅
               Account lockout (5 failed attempts)         ✅
               Google OAuth (server-side ID verify)        ✅
               Etsy OAuth 2.0 (PKCE + state)              ✅

Frontend       Edge Middleware route protection             ✅
               Silent 401 refresh interceptor               ✅
               credentials:'include' on all requests        ✅
               No tokens in localStorage or URL params      ✅

API            CORS (credentials:true, explicit origins)   ✅
               Startup ENV validation                       ✅
               Rate limiting (atomic Redis Lua)             ✅
               Circuit breaker (three-state per shop)       ✅
               Idempotency-Key enforcement (Redis 24h)      ✅
               Request validation (Pydantic v2)             ✅
               CSV sanitization (formula + HTML strip)      ✅

Database       SQL injection protection (ORM)               ✅
               OAuth token encryption (AES-GCM 256-bit)    ✅
               FK integrity (CASCADE / SET NULL on all)    ✅
               RBAC enforcement (5 roles, 30+ perms)       ✅
               Tenant isolation (query helpers)             ✅

Network        Docker internal networks                     ✅
               No exposed ports except web (3000) & API    ✅
               Secrets via environment variables            ✅

Audit          All actions logged (audit_middleware)        ✅
               Request ID correlation                      ✅
               PII sanitization in logs                    ✅
               Error monitoring (Sentry + PII scrubbing)   ✅
```

---

## Docker Services (Development)

| Service    | Image               | Port  | Purpose                         |
|------------|---------------------|-------|---------------------------------|
| db         | postgres:16-alpine  | 5433  | PostgreSQL database             |
| redis      | redis:7-alpine      | 6380  | Broker, cache, rate limiter     |
| api        | ./apps/api          | 8080  | FastAPI backend                 |
| worker     | ./apps/api          | —     | Celery worker (concurrency=4)   |
| beat       | ./apps/api          | —     | Celery Beat scheduler           |
| adminer    | adminer:latest      | 8081  | Database admin UI               |
| web        | ./apps/web          | 3000  | Next.js frontend                |
| prometheus | prom/prometheus      | 9090  | Metrics collection              |
| grafana    | grafana/grafana     | 3001  | Metrics dashboards              |

---

## RBAC Role Matrix

| Capability              | Owner | Admin | Creator | Supplier | Viewer |
|------------------------|-------|-------|---------|----------|--------|
| Manage team/billing    | Yes   | No    | No      | No       | No     |
| Manage shops           | Yes   | Yes   | No      | No       | No     |
| Create/edit products   | Yes   | Yes   | Yes     | No       | No     |
| Generate AI content    | Yes   | Yes   | Yes     | No       | No     |
| Publish listings       | Yes   | Yes   | Yes     | No       | No     |
| Manage schedules       | Yes   | Yes   | No      | No       | No     |
| View orders            | Yes   | Yes   | Yes     | Yes      | Yes    |
| Add tracking           | Yes   | Yes   | No      | Yes      | No     |
| Fulfill orders         | Yes   | Yes   | No      | No       | No     |
| View audit logs        | Yes   | Yes   | No      | No       | No     |
| View analytics         | Yes   | Yes   | Yes     | No       | Yes    |

---

## Performance Targets (SLOs)

```
Metric                     Target           Infrastructure
────────────────────────────────────────────────────────────
API Response Time (p95)    < 500ms          Prometheus histogram
Listing Publish (p95)      < 10 min         Celery task duration
Task Failure Rate          < 2%             Celery metrics + alerts
Token Refresh MTTR         < 15 min         Single-flight locks
Database Queries (p95)     < 100ms          Prometheus histogram
Queue Depth                < 5,000 jobs     Celery queue gauge + alert
Etsy Rate Limit            0 bans           Atomic limiter + circuit breaker
Uptime                     99.9%            Health checks + alerting
```

---

## Color Scheme

```
Primary Colors (Blue to Green Gradient):
──────────────────────────────────────────
#3b82f6 → Blue (Primary)
#14b8a6 → Teal (Accent)
#10b981 → Green (Success)

Dark Theme:
──────────────────────────────────────────
#0f172a → Background
#1e293b → Cards/Surfaces
#334155 → Borders
#f1f5f9 → Text
#94a3b8 → Muted Text

Status Colors:
──────────────────────────────────────────
#3b82f6 → NEW (Blue)
#f59e0b → PROCESSING (Orange)
#a855f7 → SHIPPED (Purple)
#6b7280 → QUEUED (Gray)
#eab308 → DRAFTING (Yellow)
#10b981 → DONE / COMPLETED (Green)
#ef4444 → FAILED (Red)
#f97316 → POLICY_BLOCKED (Orange)
```

---

**Last Updated:** 2026-02-11
**Architecture Version:** 2.0 (post-audit remediation)
