# CLAUDE.md — מקור האמת של הפרויקט

**שם הפרויקט**: Profitly (Etsy Automation Platform)
**עודכן לאחרונה**: 2026-03-26
**סטטוס**: Production-Ready ✅
**גרסה**: 1.0.0

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
| Etsy API v3 | מוצרים, הזמנות, חנויות |
| Google OAuth 2.0 | התחברות חברתית |
| Resend | שליחת אימיילים |
| AdsPower | Browser automation לשליחת הודעות |

---

## 3. מבנה התיקיות

```
etsyauto-main/
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
│   │   │   │   ├── owner/            # Dashboard בעל חנות (עיקרי)
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
│   │   │   │   └── DashboardLayout.tsx # Wrapper לכל דפי Dashboard
│   │   │   ├── dashboard/
│   │   │   │   ├── StatCard.tsx      # כרטיסי KPI (צפיות, לקוחות, הזמנות, תשלום)
│   │   │   │   ├── TrendChart.tsx    # גרף מגמות שבועי (Recharts)
│   │   │   │   ├── RecentOrders.tsx  # טבלת הזמנות אחרונות
│   │   │   │   ├── ConnectionStatus.tsx # סטטוס חיבור חנות
│   │   │   │   └── StatusOverview.tsx  # מדדי בריאות חנות
│   │   │   ├── ui/
│   │   │   │   ├── Modal.tsx         # Dialog כללי
│   │   │   │   ├── Button.tsx        # כפתור
│   │   │   │   ├── Input.tsx         # שדה קלט
│   │   │   │   ├── Alert.tsx         # התראה / toast
│   │   │   │   ├── DataTable.tsx     # טבלה עם מיון
│   │   │   │   └── DisconnectedShopBanner.tsx
│   │   │   └── auth/
│   │   │       ├── AuthLayout.tsx    # עיצוב דפי auth
│   │   │       └── GoogleSignInButton.tsx
│   │   │
│   │   ├── lib/                      # Utilities & hooks
│   │   │   ├── api.ts                # API client + כל הטיפוסים
│   │   │   ├── auth-context.ts       # ניהול מצב auth
│   │   │   ├── shop-context.ts       # בחירת חנות פעילה
│   │   │   ├── language-context.ts   # עברית / אנגלית i18n
│   │   │   ├── toast-context.ts      # Toast notifications
│   │   │   ├── translations.ts       # מחרוזות תרגום
│   │   │   └── utils.ts              # פונקציות עזר
│   │   │
│   │   ├── e2e/                      # בדיקות Playwright
│   │   ├── public/                   # קבצים סטטיים
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── Dockerfile
│   │
│   ├── api/                          # Backend — FastAPI (~3MB)
│   │   ├── app/
│   │   │   ├── main.py               # נקודת כניסה, רישום routers
│   │   │   ├── api/endpoints/        # 24 מודולי endpoints
│   │   │   │   ├── auth.py           # register, login, logout, refresh, me
│   │   │   │   ├── google_oauth.py   # Google + Etsy OAuth flows
│   │   │   │   ├── shops.py          # ניהול חנויות Etsy
│   │   │   │   ├── products.py       # CRUD מוצרים + ייבוא + סנכרון
│   │   │   │   ├── orders.py         # הזמנות + סטטוס + סנכרון
│   │   │   │   ├── dashboard.py      # נתוני Dashboard + מגמות
│   │   │   │   ├── analytics.py      # KPIs, המרה, ביצועים
│   │   │   │   ├── financials.py     # ספר חשבונות + תשלומים
│   │   │   │   ├── team.py           # ניהול צוות + הזמנות
│   │   │   │   ├── messages.py       # שרשורי הודעות
│   │   │   │   ├── notifications.py  # מרכז התראות
│   │   │   │   ├── audit.py          # לוג פעילות
│   │   │   │   ├── admin.py          # Super-admin endpoints
│   │   │   │   ├── ingestion.py      # ייבוא CSV/JSON בקבוצות
│   │   │   │   ├── webhooks.py       # Etsy webhooks
│   │   │   │   ├── currency.py       # המרת מטבעות
│   │   │   │   ├── tasks.py          # מעקב Celery tasks
│   │   │   │   └── user_preferences.py # הגדרות משתמש
│   │   │   │
│   │   │   ├── models/               # 17 מודלי SQLAlchemy
│   │   │   │   ├── tenancy.py        # Tenant, User, Membership, Shop
│   │   │   │   ├── products.py       # Product
│   │   │   │   ├── orders.py         # Order
│   │   │   │   ├── oauth.py          # OAuthToken (מוצפן)
│   │   │   │   ├── financials.py     # LedgerEntry, Expense, PaymentDetail
│   │   │   │   ├── messaging.py      # MessageThread, Message
│   │   │   │   ├── audit.py          # AuditLog
│   │   │   │   ├── notifications.py  # Notification
│   │   │   │   ├── ingestion.py      # IngestionBatch, IngestionRecord
│   │   │   │   ├── webhooks.py       # WebhookEvent
│   │   │   │   ├── user_preferences.py
│   │   │   │   ├── exchange_rates.py
│   │   │   │   └── api_keys.py
│   │   │   │
│   │   │   ├── services/             # 25 מודולי business logic
│   │   │   │   ├── etsy_client.py    # Etsy API client (circuit breaker + rate limiting)
│   │   │   │   ├── etsy_oauth.py     # Etsy OAuth PKCE flow
│   │   │   │   ├── google_oauth.py   # Google OAuth flow
│   │   │   │   ├── token_manager.py  # OAuth token refresh (single-flight)
│   │   │   │   ├── encryption.py     # AES-GCM הצפנה לטוקנים
│   │   │   │   ├── security.py       # JWT, bcrypt, cookies
│   │   │   │   ├── email_service.py  # אימות, איפוס סיסמה
│   │   │   │   ├── circuit_breaker.py # 3-state circuit breaker לEtsy API
│   │   │   │   ├── rate_limiter.py   # Token bucket לEtsy API
│   │   │   │   ├── financial_service.py # חישובי הכנסה ותשלום
│   │   │   │   ├── currency_conversion.py # המרת מטבעות
│   │   │   │   ├── analytics_service.py  # חישובי KPI
│   │   │   │   ├── shop_sync_service.py  # סנכרון נתוני חנות
│   │   │   │   ├── ingestion_service.py  # עיבוד CSV/JSON
│   │   │   │   ├── audit_service.py      # רישום audit logs
│   │   │   │   ├── notification_service.py
│   │   │   │   └── adspower.py       # AdsPower browser automation
│   │   │   │
│   │   │   ├── worker/               # Celery infrastructure
│   │   │   │   ├── celery_app.py     # הגדרות Celery
│   │   │   │   ├── tasks.py          # הגדרות משימות async
│   │   │   │   ├── scheduler.py      # Cron jobs (Celery Beat)
│   │   │   │   └── services/
│   │   │   │       └── imap_manager.py # IMAP email listener
│   │   │   │
│   │   │   └── core/
│   │   │       ├── config.py         # ניהול כל משתני הסביבה
│   │   │       ├── security.py       # JWT + הצפנה
│   │   │       ├── database.py       # SQLAlchemy engine + session
│   │   │       └── constants.py      # קבועים גלובליים
│   │   │
│   │   ├── alembic/                  # 50+ database migrations
│   │   ├── tests/                    # Unit tests (pytest)
│   │   ├── requirements.txt          # Python dependencies
│   │   └── Dockerfile
│   │
│   ├── admin/                        # Admin Portal — Next.js (~114KB)
│   │   ├── app/
│   │   │   ├── login/                # כניסה עם ADMIN_PORTAL_SECRET
│   │   │   ├── dashboard/            # סקירת מערכת
│   │   │   ├── tenants/              # ניהול דיירים (Tenants)
│   │   │   └── message-access/       # אישור גישה להודעות
│   │   └── Dockerfile
│   │
│   └── worker/                       # Celery Worker (same image as api)
│
├── monitoring/
│   ├── prometheus.yml                # הגדרות scraping
│   └── grafana/                      # Dashboards + provisioning
│
├── docs/                             # תיעוד נוסף
├── .github/workflows/                # CI/CD pipelines
│
├── docker-compose.yml                # 9 שירותים (development)
├── docker-compose.prod.yml           # Production stack
├── .env.example                      # תבנית משתני סביבה (50+)
├── .env                              # ⚠️ קובץ מקומי בלבד — לא ב-git
├── private.pem                       # RS256 private key
├── public.pem                        # RS256 public key
└── CLAUDE.md                         # ⬅️ הקובץ הזה
```

---

## 4. פקודות חשובות

### הפעלת הפרויקט
```bash
# הפעלת כל השירותים (מהתיקייה etsyauto-main/)
docker compose up -d

# גישה:
# Frontend:  http://localhost:3000
# API:       http://localhost:8080
# API Docs:  http://localhost:8080/docs
# Admin:     http://localhost:3002
# Grafana:   http://localhost:3001
# Adminer:   http://localhost:8081
```

### בדיקת סטטוס
```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose logs -f worker
```

### עצירה ואיפוס
```bash
docker compose down          # עצור הכל
docker compose down -v       # עצור + מחק נתונים
docker compose up -d --build # בנה מחדש + הפעל
```

### Backend — FastAPI
```bash
cd apps/api

# הרצה מקומית
uvicorn main:app --reload

# בדיקות
pytest
pytest -v --tb=short

# Migration חדש
alembic revision -m "תיאור השינוי"
alembic upgrade head          # החל migrations
alembic downgrade -1          # בטל migration אחרון

# כניסה ל-shell של API
docker compose exec api bash
```

### Frontend — Next.js
```bash
cd apps/web

npm run dev        # פיתוח עם hot reload
npm run build      # בנייה לproduction
npm start          # הרצת production build
npm test           # בדיקות יחידה
npm run test:e2e   # בדיקות E2E (Playwright)
```

### Database
```bash
# כניסה ל-PostgreSQL
docker compose exec db psql -U postgres -d etsy_platform

# פקודות שימושיות:
\dt                    # כל הטבלאות
\d table_name          # מבנה טבלה
SELECT * FROM users;
\q                     # יציאה
```

---

## 5. מה נעשה עד עכשיו

### ✅ Infrastructure (ינואר–פברואר 2026)
- ✅ Docker Compose עם 9 שירותים מלאים
- ✅ PostgreSQL 16 עם CITEXT extension
- ✅ FastAPI backend + uvicorn
- ✅ Next.js 14 עם App Router
- ✅ Celery + Redis (worker, beat, imap)
- ✅ JWT authentication RS256 (asymmetric)
- ✅ 50+ database migrations עם Alembic
- ✅ Prometheus + Grafana monitoring
- ✅ CI/CD pipelines ב-GitHub Actions
- ✅ Sentry error tracking (frontend + backend)

### ✅ Authentication & Tenancy
- ✅ הרשמה + אישור אימייל
- ✅ התחברות JWT (TTL 5 דקות) + refresh אוטומטי
- ✅ Google OAuth 2.0
- ✅ Etsy OAuth 2.0 PKCE flow
- ✅ RBAC: Owner / Admin / Creator / Viewer
- ✅ ניהול צוות + הזמנות בדואר
- ✅ Multi-tenant עם בידוד מלא
- ✅ Account lockout לאחר ניסיונות כשלון
- ✅ שכחתי סיסמה + איפוס

### ✅ Dashboard & UI
- ✅ Owner dashboard עם כרטיסי KPI
- ✅ RTL מלא (עברית) בכל הממשק
- ✅ תמה ירוקה (`--primary: #006d43`)
- ✅ Sidebar עם בורר חנויות
- ✅ טבלת הזמנות אחרונות
- ✅ מדדי בריאות חנות
- ✅ Responsive (mobile, tablet, desktop)
- ✅ Notification center

### ✅ Etsy Integration
- ✅ יצירת קישור OAuth לחיבור חנות
- ✅ הצפנת טוקנים AES-GCM ואחסון מאובטח
- ✅ חיבור / ניתוק חנות
- ✅ סנכרון מוצרים מ-Etsy
- ✅ סנכרון הזמנות בזמן אמת
- ✅ Rate limiting + circuit breaker
- ✅ Etsy webhooks

### ✅ Product Management
- ✅ ייבוא CSV/JSON בקבוצות
- ✅ CRUD מלא על מוצרים
- ✅ סנכרון עם רישומי Etsy
- ✅ AI content generation (כותרות, תיאורים, תגיות)
- ✅ Policy compliance checker

### ✅ Order Management
- ✅ רשימת הזמנות עם סינונים
- ✅ מעקב סטטוס הזמנה
- ✅ סטטוס תשלום עם badges
- ✅ מעקב משלוחים
- ✅ פרטי לקוח

### ✅ Financial Tracking
- ✅ ספר חשבונות (Ledger) — מכירות, עמלות, החזרות
- ✅ דוחות הכנסות
- ✅ מעקב הוצאות
- ✅ תמיכה במטבעות מרובים + המרה
- ✅ מעקב סטטוס תשלום

### ✅ Messaging System
- ✅ הודעות Etsy דרך IMAP
- ✅ ניהול שרשורים
- ✅ שליחת תשובות ללקוחות
- ✅ AdsPower integration לאוטומציה
- ✅ ממשק אישור גישה להודעות (Admin)

### ✅ Admin Portal
- ✅ Super-admin dashboard
- ✅ ניהול tenants
- ✅ ניהול משתמשים
- ✅ בריאות מערכת
- ✅ Audit logs viewer

---

## 6. מאיפה להמשיך

### 🔴 עדיפות 1 — תיקון UI Dashboard (מיידי)

#### Stat Cards
- [ ] שנה תצוגת מטבע: `ILS70.65` → `₪70.65`
- [ ] שנה פורמט badge: `+12%` → `12%+`
- [ ] כוונן גדלי אייקונים לפי Mockup
- [ ] בדוק padding ומרווחים

**קובץ**: `apps/web/app/dashboard/owner/page.tsx`

#### Weekly Trend Chart
- [ ] בנה קומפוננט `TrendChart.tsx` מלא
- [ ] כפתורי פילטר period: יום / 30 יום / חודשים
- [ ] כפתורי קטגוריה: מכירות / צפיות / המרה
- [ ] חיבור לendpoint אמיתי: `GET /api/dashboard/trends`
- [ ] קו השוואה (dashed) לתקופה הקודמת
- [ ] Tooltip עם ערך + אחוז שינוי

**קובץ**: `apps/web/components/dashboard/TrendChart.tsx`

#### Sidebar Updates
- [ ] הסר פריט "שיווק" מהניווט
- [ ] שנה כפתור "הוסף מוצר חדש" → "חבר חנות חדשה"
- [ ] חיבור הכפתור: copy OAuth link ל-clipboard
- [ ] פידבק חזותי (✓) אחרי העתקה

**קובץ**: `apps/web/components/layout/Sidebar.tsx`

### 🟡 עדיפות 2 — Backend Enhancements

- [ ] צור endpoint: `GET /api/dashboard/trends`
  - פרמטרים: `period` (day/30d/month), `category` (sales/views/conversion)
  - תחזיר: נתונים יומיים לגרף + השוואה לתקופה קודמת
- [ ] ודא שעובד: `GET /api/oauth/etsy/connect-link`

### 🟢 עדיפות 3 — Features

- [ ] Analytics dashboard מלא
- [ ] דוחות פיננסיים מתקדמים
- [ ] דוחות ביצועי מוצרים
- [ ] RTL בדיקה על מובייל

---

## 7. באגים ובעיות ידועות

### 🔴 קריטי
אין כרגע.

### 🟡 בינוני

**1. תצוגת מטבע בכרטיסי KPI**
- בעיה: מוצג `ILS70.65` במקום `₪70.65`
- מיקום: `apps/web/app/dashboard/owner/page.tsx` — StatCard component
- סטטוס: ממתין לתיקון

**2. Trend Chart לא מחובר לנתונים אמיתיים**
- בעיה: הקומפוננט קיים אך מציג placeholder data
- מיקום: `apps/web/components/dashboard/TrendChart.tsx`
- סטטוס: בפיתוח

**3. פורמט Badge לא תואם Mockup**
- בעיה: מוצג `+12%` במקום `12%+`
- מיקום: StatCard component
- סטטוס: ממתין לתיקון

### ✅ תוקן
- ✅ רקע כרטיסים (היה לילך, תוקן לבן)
- ✅ סדר grid ב-RTL (כרטיסים בסדר הנכון)
- ✅ מיקום badge ב-RTL

---

## 8. החלטות חשובות

### ארכיטקטורה

**Monorepo (apps/)**
- למה: CI/CD אחד, שיתוף קוד קל, ניהול פשוט
- חסרון: לא ניתן deploy עצמאי לכל שירות

**Next.js 14 App Router** (ולא Pages Router)
- למה: Server Components, ביצועים טובים יותר, מודרני
- חסרון: עקומת למידה תלולה יותר

**FastAPI** (ולא Node.js)
- למה: Python מתאים לAI/ML, async מהיר, Pydantic v2
- חסרון: דורש ידע Python

**PostgreSQL** (ולא NoSQL)
- למה: קשרים מורכבים (users, shops, orders), ACID compliance
- חסרון: Schema פחות גמיש

**Celery + Redis**
- למה: Etsy API איטי — צריך background jobs
- חסרון: מורכבות נוספת עם message queue

### עיצוב

**תמה ירוקה (`#006d43`)**
- למה: ירוק = כסף ו-growth, מקצועי
- דחינו: כחול (שכיח מדי), כתום (Etsy כבר משתמשת)

**Tailwind CSS** (ולא Material-UI)
- למה: גמישות מלאה, אין bloat, שליטה מוחלטת
- חסרון: צריך לכתוב יותר CSS

**RTL מלא לעברית**
- למה: קהל היעד — מוכרים ישראלים
- מימוש: CSS grid עם `dir="rtl"`, first child = ימין

### אבטחה

**JWT עם RS256 (asymmetric)**
- למה: אפשר לאמת טוקנים בלי גישה לDB
- חסרון: ניהול key pairs

**HTTP-Only Cookies לאוטנטיקציה**
- למה: הגנה מ-XSS
- מימוש: credentials כלולים בכל API calls

**AES-GCM להצפנת OAuth tokens**
- למה: תקן תעשייה עם built-in authentication
- מאוחסן ב: `app.models.oauth.OAuthToken.encrypted_token`

**RBAC עם 4 תפקידים**
- Owner, Admin, Creator, Viewer
- מימוש: `apps/api/app/api/dependencies/rbac.py`

---

## 9. כללים

### חובה
1. **כל הקבצים חייבים להישאר בתוך תיקיית הפרויקט `etsyauto-main/` בלבד**
   - ❌ אסור ליצור קבצים מחוץ לתיקייה
   - ❌ אסור לשנות קבצים בתיקיות אחרות
   - ✅ הכל בפנים

2. **בסוף כל סשן עבודה — חובה לעדכן קובץ זה (CLAUDE.md)**
   - עדכן "מה נעשה עד עכשיו"
   - עדכן "מאיפה להמשיך"
   - הוסף באגים חדשים אם יש
   - הוסף החלטות חדשות אם יש

3. **כל סשן = commit חדש עם הודעה ברורה**

### Workflow בכל סשן
```
1. קרא CLAUDE.md → הבן את ההקשר
2. קרא את קבצי הקוד הרלוונטיים לפני שינוי
3. בצע את השינויים הדרושים
4. בדוק שהכל עובד
5. עדכן CLAUDE.md
6. Commit עם הודעה ברורה
```

### פורמט Commit
```
[component] תיאור קצר

- פירוט מה השתנה
- למה השתנה

Fixes: #123 (אם רלוונטי)
```

### ❌ לעולם לא
- אל תמחק קבצים קיימים ללא סיבה ברורה
- אל תחליף libraries בלי להשוות אלטרנטיבות
- אל תשכח לעדכן CLAUDE.md בסוף סשן
- אל תכתוב קוד לא מאובטח (SQL injection, XSS, וכד')

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

**עודכן**: 2026-03-26 | **הבא**: Priority 1 — תיקוני UI Dashboard
