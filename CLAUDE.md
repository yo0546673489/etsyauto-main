# CLAUDE.md — מקור האמת של הפרויקט

**שם הפרויקט**: Profitly (Etsy Automation Platform)
**עודכן לאחרונה**: 2026-03-28
**סטטוס**: Production-Ready ✅
**גרסה**: 1.2.0

---

## תוכן עניינים

1. [שם הפרויקט ותיאור](#1-שם-הפרויקט-ותיאור)
2. [טכנולוגיות](#2-טכנולוגיות)
3. [מבנה התיקיות](#3-מבנה-התיקיות)
4. [פקודות חשובות](#4-פקודות-חשובות)
5. [מה נעשה עד עכשיו](#5-מה-נעשה-עד-עכשיו)
6. [מאיפה להמשיך](#6-מאיפה-להמשיך)
7. [באגים ובעיות ידועות](#7-באגים-ובעיות-ידועות)
8. [החלטות חשובות](#8-החלטות-חשובות)
9. [כללים](#9-כללים)

---

## 1. שם הפרויקט ותיאור

**שם**: **Profitly**

**מה התוכנה עושה**:
פלטפורמת SaaS מלאה לניהול חנויות Etsy — אוטומציה, ניתוח נתונים, ניהול מוצרים, הזמנות, הכנסות והודעות, הכל ממקום אחד.

**למי היא מיועדת**:
- מוכרים ישראלים ב-Etsy שרוצים לנהל את החנות בעברית
- מי שמנהל כמה חנויות במקביל
- צוותים שעובדים יחד על חנות (Owner / Admin / Creator / Viewer)

**מטרות עיקריות**:
- 📊 Dashboard עם נתוני מכירות, הזמנות, ותשלומים בזמן אמת
- 📦 ניהול מוצרים — יצירה, עדכון, פרסום ל-Etsy
- 🤖 יצירת תוכן אוטומטית (AI) — כותרות, תיאורים, תגיות בעברית
- 🔒 בדיקת תאימות למדיניות Etsy
- 💰 מעקב פיננסי — הכנסות, הוצאות, תשלומים, מטבעות שונים
- 📧 ניהול הודעות עם קונים ישירות מהפלטפורמה
- 🛒 סנכרון הזמנות מ-Etsy בזמן אמת
- 📈 Analytics — גרפים ומגמות מכירות

---

## 2. טכנולוגיות

### Frontend — `apps/web/`
| טכנולוגיה | גרסה | תפקיד |
|-----------|------|--------|
| Next.js | 14.2.35 | React framework עם App Router |
| React | 18.2.0 | UI library |
| TypeScript | 5.3.2 | Type safety |
| Tailwind CSS | 3.3.5 | עיצוב (תמה ירוקה `#006d43`) |
| Recharts | 2.10.3 | גרפים ותרשימים |
| Lucide React | 0.292.0 | אייקונים |
| Framer Motion | 11.18.2 | אנימציות |
| @headlessui/react | 1.7.17 | קומפוננטים נגישים |
| @react-oauth/google | 0.12.1 | Google OAuth |
| Sentry | 7.91.0 | מעקב שגיאות |
| Playwright | 1.40.0 | בדיקות E2E |

### Backend — `apps/api/`
| טכנולוגיה | גרסה | תפקיד |
|-----------|------|--------|
| FastAPI | 0.115.6 | Python web framework (async) |
| Python | 3.11 | שפת הפיתוח |
| Uvicorn | 0.24.0 | ASGI server |
| Pydantic | v2 (2.5.0) | Data validation |
| SQLAlchemy | 2.0.23 | ORM לDatabase |
| Alembic | 1.12.1 | Database migrations |
| Celery | 5.3.4 | Task queue (משימות ברקע) |
| Redis client | 5.0.1 | חיבור ל-Redis |
| python-jose | 3.4.0 | JWT (RS256) |
| passlib[bcrypt] | 1.7.4 | הצפנת סיסמאות |
| cryptography | 43.0.1 | AES-GCM encryption |
| httpx | 0.25.1 | Async HTTP client |
| resend | 2.5.1 | שליחת אימיילים |
| prometheus-client | 0.19.0 | Metrics |
| sentry-sdk | 1.45.1 | Error tracking |
| aioimaplib | — | IMAP email listener |
| playwright | — | Browser automation |

### Infrastructure
| טכנולוגיה | גרסה | תפקיד |
|-----------|------|--------|
| PostgreSQL | 16 | Database ראשי |
| Redis | 7 | Cache + message broker |
| Docker | — | Containerization |
| Docker Compose | — | ניהול 9 שירותים |
| Prometheus | latest | Metrics collection |
| Grafana | latest | Metrics visualization |

### External APIs
| API | תפקיד |
|----|--------|
| Etsy API v3 | מוצרים, הזמנות, חנויות, לדג'ר |
| Google OAuth 2.0 | התחברות חברתית |
| Resend | שליחת אימיילים |
| AdsPower | Browser automation לשליחת הודעות |

---

## 3. מבנה התיקיות

```
etsyauto-main/  (aka "פרוייקט של אטסי")
│
├── apps/
│   ├── web/                          # Frontend — Next.js 14 (~1.7MB)
│   │   ├── app/                      # App Router (30+ עמודים)
│   │   │   ├── layout.tsx            # Root layout עם providers
│   │   │   ├── page.tsx              # דף בית / landing
│   │   │   ├── login/                # דף התחברות
│   │   │   ├── register/             # דף הרשמה
│   │   │   ├── forgot-password/      # שכחתי סיסמה
│   │   │   ├── reset-password/       # איפוס סיסמה
│   │   │   ├── verify-email/         # אישור אימייל
│   │   │   ├── accept-invitation/    # קבלת הזמנה לצוות
│   │   │   ├── dashboard/
│   │   │   │   ├── owner/page.tsx    # ✅ Dashboard בעל חנות (עיקרי) — עודכן
│   │   │   │   ├── admin/            # Dashboard מנהל
│   │   │   │   ├── supplier/         # Dashboard ספק
│   │   │   │   └── viewer/           # Dashboard צופה (read-only)
│   │   │   ├── products/             # רשימת מוצרים + [id] דף פרטים
│   │   │   ├── orders/               # רשימת הזמנות + [id] דף פרטים
│   │   │   ├── messages/             # תיבת הודעות + [id] שרשור
│   │   │   ├── analytics/            # דף Analytics ודוחות
│   │   │   ├── financials/           # דוחות פיננסיים + ספר חשבונות
│   │   │   ├── settings/             # הגדרות משתמש
│   │   │   ├── team/                 # ניהול צוות + הזמנות
│   │   │   ├── ingestion/            # ייבוא מוצרים CSV/JSON
│   │   │   ├── landing/              # עמוד נחיתה ציבורי
│   │   │   ├── privacy/              # מדיניות פרטיות
│   │   │   ├── terms/                # תנאי שימוש
│   │   │   └── oauth/etsy/           # OAuth flow (start, callback, success)
│   │   │
│   │   ├── components/               # 40+ קומפוננטים React
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx       # ניווט צד (RTL, עברית)
│   │   │   │   ├── TopBar.tsx        # Header עם תפריט משתמש
│   │   │   │   └── DashboardLayout.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── TrendChart.tsx    # ✅ גרף מגמות מלא — עוצב מחדש
│   │   │   │   ├── DateRangePicker.tsx # ✅ NEW — בורר תאריכים עברי
│   │   │   │   ├── RecentOrders.tsx
│   │   │   │   ├── ConnectionStatus.tsx
│   │   │   │   └── StatusOverview.tsx
│   │   │   └── ui/
│   │   │       ├── DisconnectedShopBanner.tsx
│   │   │       └── ...
│   │   │
│   │   └── lib/
│   │       ├── api.ts                # ✅ עודכן — DateRange params, DashboardStats
│   │       ├── auth-context.ts
│   │       ├── shop-context.ts
│   │       ├── language-context.ts
│   │       ├── toast-context.ts
│   │       └── order-status.ts
│   │
│   ├── api/                          # Backend — FastAPI (~3MB)
│   │   └── app/
│   │       ├── api/endpoints/
│   │       │   ├── dashboard.py      # ✅ עודכן — date filter, Etsy balance API
│   │       │   ├── analytics.py      # timeseries endpoint
│   │       │   └── ...
│   │       ├── models/
│   │       │   ├── products.py       # ✅ עודכן — views, num_favorers columns
│   │       │   └── ...
│   │       ├── services/
│   │       │   ├── financial_service.py  # ✅ עודכן — SUM balance, negative support
│   │       │   ├── etsy_client.py        # ✅ עודכן — get_shop_stats, get_payment_account
│   │       │   └── ...
│   │       └── worker/tasks/
│   │           └── product_sync_tasks.py # ✅ עודכן — syncs views/num_favorers
│   │
│   └── admin/                        # Admin Portal — Next.js (~114KB)
│
├── monitoring/
│   ├── prometheus.yml
│   └── grafana/
│
├── docker-compose.yml                # 9 שירותים
├── docker-compose.prod.yml
├── .env.example                      # תבנית משתני סביבה
├── private.pem / public.pem          # RS256 JWT keys (לא ב-git)
└── CLAUDE.md                         # ⬅️ הקובץ הזה
```

---

## 4. פקודות חשובות

### הפעלת הפרויקט
```bash
# הפעלת כל השירותים
docker compose -p etsyauto up -d

# גישה:
# Frontend:  http://localhost:3000
# API:       http://localhost:8080
# API Docs:  http://localhost:8080/docs
# Admin:     http://localhost:3002
# Grafana:   http://localhost:3001
# Adminer:   http://localhost:8081
```

### בנייה מחדש (חשוב — Docker baked images, אין volume mounts!)
```bash
# ⚠️ שינויים בקוד לא נכנסים לקונטיינרים בלי rebuild!
docker compose -p etsyauto up -d --build web     # rebuild frontend
docker compose -p etsyauto up -d --build api     # rebuild backend
docker compose -p etsyauto up -d --build         # rebuild הכל
```

### בדיקת סטטוס
```bash
docker compose ps
docker logs etsy-api --tail 50
docker logs etsy-web --tail 50
```

### Backend — FastAPI
```bash
cd apps/api
pytest                    # בדיקות
alembic upgrade head      # החל migrations
alembic stamp head        # סמן כ-up-to-date (לדלג על migrations)
```

### Database
```bash
docker exec etsy-db psql -U postgres -d etsy_platform
# \dt — כל הטבלאות
# \q  — יציאה
```

### סנכרון מוצרים מ-Etsy (לעדכן views/num_favorers)
```python
# מתוך etsy-api container:
from app.worker.tasks.product_sync_tasks import sync_products_from_etsy
sync_products_from_etsy(shop_id=1, tenant_id=3, full_sync=True)
sync_products_from_etsy(shop_id=2, tenant_id=3, full_sync=True)
```

---

## 5. מה נעשה עד עכשיו

### ✅ Infrastructure (ינואר–פברואר 2026)
- ✅ Docker Compose עם 9 שירותים מלאים
- ✅ PostgreSQL 16 + Redis 7
- ✅ FastAPI + Next.js 14 App Router
- ✅ Celery + Beat + IMAP listener
- ✅ JWT RS256 + HTTP-only cookies
- ✅ 50+ Alembic migrations
- ✅ Prometheus + Grafana monitoring
- ✅ CI/CD pipelines
- ✅ Sentry (frontend + backend)

### ✅ Authentication & Tenancy
- ✅ הרשמה + אישור אימייל
- ✅ JWT TTL 5 דקות + refresh אוטומטי
- ✅ **Google OAuth 2.0** — עובד ✓
- ✅ **Etsy OAuth 2.0 PKCE** — עובד ✓
- ✅ RBAC: Owner / Admin / Creator / Viewer
- ✅ Multi-tenant + team management

### ✅ Dashboard & UI (מעודכן מרץ 2026)
- ✅ **כרטיסי KPI מעוצבים לפי mockup** — סדר RTL נכון, פורמט ₪, badge נכון
- ✅ **יתרה נוכחית** — מחובר ל-Etsy Ledger API בזמן אמת
- ✅ **יתרה שלילית** — מוצגת כ-`-₪9` עם `dir="ltr"` (לא `₪9-`)
- ✅ **DateRangePicker** — 8 פרסטים בעברית (היום/אתמול/7 ימים/30 ימים/החודש/השנה/שנה שעברה/כל הזמנים)
- ✅ **סינון תאריכים** — מסנן הזמנות ולקוחות לפי טווח
- ✅ **TrendChart מלא** — LineChart עם KPI cards, period dropdown (יום/30 יום/חודשים), tabs (מכירות/צפיות/המרות), export CSV, legend
- ✅ **צפיות בחנות** — מסונכרן מ-Etsy (7,691 צפיות: FigurineeHaven 6,719 + CoreBags 972)
- ✅ RTL מלא בעברית
- ✅ Responsive

### ✅ Etsy Integration
- ✅ OAuth PKCE flow — connect/disconnect חנויות
- ✅ הצפנת טוקנים AES-GCM
- ✅ סנכרון מוצרים (כולל `views`, `num_favorers`)
- ✅ סנכרון הזמנות בזמן אמת
- ✅ Rate limiting + circuit breaker
- ✅ Etsy webhooks
- ✅ **Ledger API** — קריאת יתרת חשבון תשלומים

### ✅ Financial Tracking
- ✅ ספר חשבונות (Ledger) מ-Etsy
- ✅ **יתרה אמיתית** — SUM(amount) על כל רשומות הלדג'ר
- ✅ **תמיכה ביתרה שלילית** (חוב ל-Etsy)
- ✅ דוחות הכנסות + הוצאות
- ✅ תמיכה במטבעות מרובים + המרה

### ✅ Product / Order / Messaging
- ✅ CRUD מלא על מוצרים + AI content generation
- ✅ ייבוא CSV/JSON בקבוצות
- ✅ מעקב הזמנות + סטטוס תשלום
- ✅ ניהול הודעות Etsy דרך IMAP + AdsPower

### ✅ Admin Portal
- ✅ Super-admin dashboard
- ✅ ניהול tenants + משתמשים
- ✅ Audit logs

---

## 6. מאיפה להמשיך

### 🔴 עדיפות 1 — ידוע ולא תוקן

#### יתרת Etsy (Billing vs Payment balance)
- **בעיה**: Etsy מציגה יתרה אחת ב-UI שלהם (`-₪80.80`) אבל ה-API מחזיר יתרה אחרת (`-₪9.38`)
- **סיבה**: Etsy UI כולל חיובי Prolist צבורים שעדיין לא נסגרו בלדג'ר. הendpoint `/payment-account` מחזיר 404 לחנות זו.
- **אפשרויות**: (א) להשאיר כמות שהוא — הנתון נכון לפי ה-API; (ב) לאמוד pending prolist ולהוסיף לחישוב; (ג) לסנכרן לדג'ר אוטומטית כל שעה
- **קבצים**: `apps/api/app/api/endpoints/dashboard.py`, `apps/api/app/services/financial_service.py`

### 🟡 עדיפות 2 — Features

- [ ] Analytics dashboard מלא עם נתונים אמיתיים
- [ ] דוחות פיננסיים מתקדמים (P&L, גרף הכנסות לאורך זמן)
- [ ] ביצועי מוצרים (views, conversion per listing)
- [ ] RTL בדיקה על מובייל
- [ ] סנכרון לדג'ר אוטומטי כל שעה (Celery Beat task)

### 🟢 עדיפות 3 — Nice to have

- [ ] אפליקציית מובייל (React Native)
- [ ] Keyword research engine
- [ ] Multi-language support (אנגלית מלאה)
- [ ] Bulk operations על מוצרים

---

## 7. באגים ובעיות ידועות

### 🟡 בינוני

**1. פער ביתרת Etsy (Payment vs Billing)**
- בעיה: אנחנו מציגים -₪9.38, Etsy מציגה -₪80.80
- סיבה: Etsy UI כולל pending prolist (~₪71 / ~24 ימים × ₪3/יום) שלא ב-API
- Etsy's own ledger API מאשר שהיתרה היא -₪9.38 — **הנתון שלנו נכון לפי ה-API**
- מיקום: `financial_service.py` → `get_payout_estimate()`
- סטטוס: ידוע, לא דחוף

### ✅ תוקן בסשן 26/03/2026
- ✅ פורמט מטבע: `ILS70` → `₪70`
- ✅ Badge format: `+12%` → `12%+`
- ✅ סדר כרטיסי KPI (RTL)
- ✅ יתרה שלילית: `₪9-` → `-₪9` (dir="ltr")
- ✅ חיבור יתרה לנתונים אמיתיים (היה ₪0)
- ✅ צפיות בחנות — היה 0, עכשיו 7,691
- ✅ DateRangePicker — חדש, 8 פרסטים
- ✅ TrendChart — עוצב מחדש לרוחב מלא
- ✅ Google OAuth — עובד
- ✅ Etsy OAuth connect link — עובד

### ✅ תוקן בסשן 27/03/2026
- ✅ **מחיקת חנות נכשלה** — `oauth_tokens` relationship חסר `cascade="all, delete-orphan"`. תוקן ב-`apps/api/app/models/tenancy.py`
- ✅ **חיבור חנות מעביר ל-login** — `/oauth/etsy/callback` לא היה ב-`publicPaths`. תוקן ב-`apps/web/lib/api.ts`
- ✅ **כפתור "חבר חנות חדשה"** — חזר להתנהגות מעתיק לclipboard (לא ניווט ישיר)
- ✅ **שינוי שם ריפו GitHub** — מ-`etsyauto-main` ל-`etsy`

### ✅ נבנה בסשן 28/03/2026 — שרת אוטומציה מרכזי (הודעות/)
- ✅ **Migration 002** — טבלאות `ai_settings`, `review_replies`, `discount_tasks`, `discount_schedules`
- ✅ **מודול AI** — `src/ai/replyGenerator.ts` — יצירת תגובות אוטומטיות עם Anthropic API (הודעות + ביקורות)
- ✅ **EtsyReviewReplier** — אוטומציית תגובה לביקורות דרך AdsPower + HumanBehavior
- ✅ **EtsyDiscountManager** — יצירת/סיום מבצעי הנחה דרך AdsPower + HumanBehavior
- ✅ **Workers** — `replyToReview.ts` + `executeDiscount.ts` עם BullMQ, profile locking, retry
- ✅ **API Routes** — `/api/reviews` (CRUD + AI generate) + `/api/discounts` (tasks + schedules)
- ✅ **עדכון replies.ts** — AI generate endpoint, AI settings per store
- ✅ **עדכון setup.ts** — 2 queues חדשים (reply-to-review, execute-discount)
- ✅ **עדכון server.ts** — רישום routes חדשים
- ✅ **עדכון index.ts** — אתחול workers + migration 002
- ✅ **Frontend** — ReviewsPage, DiscountsPage, ReviewCard, DiscountCard
- ✅ **NavBar** — ניווט ל-4 עמודים (Messages, Reviews, Discounts, Stores)
- ✅ **ChatWindow** — כפתור AI Reply

---

## 8. החלטות חשובות

### ארכיטקטורה

**Monorepo (apps/)**
- למה: CI/CD אחד, שיתוף קוד קל

**Docker baked images (ללא volume mounts)**
- ⚠️ כל שינוי בקוד דורש `docker compose -p etsyauto up -d --build [service]`
- הסיבה: production-like environment

**יתרת Etsy — SUM(amount) לא last.balance**
- ה-`balance` field על רשומות prolist מכיל ערכים שגויים
- פתרון: `SUM(amount)` על כל רשומות הלדג'ר
- מאומת: Etsy Ledger API מחזיר אותו ערך בדיוק (-938 cents)

**RTL layout בכרטיסי KPI**
- ב-RTL: first child = visual RIGHT
- סדר HTML (ימין→שמאל): יתרה | הזמנות | לקוחות | צפיות
- ערכים עם מינוס: `dir="ltr"` על ה-`<p>` של הערך

### עיצוב

**תמה ירוקה (`#006d43`)**
**Tailwind CSS** (ולא Material-UI)
**RTL מלא לעברית**

### אבטחה

**JWT RS256** — private/public.pem (לא ב-git)
**HTTP-Only Cookies**
**AES-GCM** להצפנת OAuth tokens
**RBAC** — Owner / Admin / Creator / Viewer

---

## 9. כללים

### חובה
1. **כל הקבצים בתוך תיקיית הפרויקט בלבד**
2. **בסוף כל סשן — חובה לעדכן CLAUDE.md**
3. **כל סשן = commit חדש**

### Workflow בכל סשן
```
1. קרא CLAUDE.md → הבן את ההקשר
2. קרא קבצי קוד רלוונטיים לפני שינוי
3. שנה בworktree ואז העתק לתיקיית הפרויקט
4. Rebuild: docker compose -p etsyauto up -d --build [service]
5. עדכן CLAUDE.md
6. Commit + Push
```

### ⚠️ Docker workflow חשוב
```bash
# שינויים ב-web:
Copy-Item worktree/apps/web/... → project/apps/web/...
docker compose -p etsyauto up -d --build web

# שינויים ב-api:
Copy-Item worktree/apps/api/... → project/apps/api/...
docker compose -p etsyauto up -d --build api
```

### פורמט Commit
```
[component] תיאור קצר

- פירוט מה השתנה
- למה השתנה
```

### ❌ לעולם לא
- אל תמחק קבצים קיימים ללא סיבה
- אל תשכח לעדכן CLAUDE.md
- אל תכתוב קוד לא מאובטח
- אל תעשה push של `.env` או `*.pem`

---

## מדדי פרויקט

| מדד | ערך |
|-----|-----|
| Frontend | ~1.7 MB |
| Backend | ~3.0 MB |
| Admin Portal | ~114 KB |
| מודלי DB | 17 |
| API Endpoints | 24 מודולים |
| Services | 25 מודולים |
| קומפוננטים React | 40+ |
| עמודים | 35+ |
| שירותי Docker | 9 |
| טבלאות DB | 20+ |
| Migrations | 50+ |
| משתני סביבה | 50+ |

---

## נתוני חנויות (Production)

| חנות | Etsy Shop ID | יתרה נוכחית | מכירות 2026 | צפיות |
|------|-------------|-------------|-------------|-------|
| FigurineeHaven | 63042614 | -₪9.38 | ₪4,471 | 6,719 |
| CoreBags | 62991131 | +₪68.03 | ₪655 | 972 |

---

**עודכן**: 2026-03-28 | **הבא**: עדכון סלקטורים ב-inspect-selectors.ts, Billing/Payment balance sync, Analytics מלא, scheduler לרוטציית הנחות
