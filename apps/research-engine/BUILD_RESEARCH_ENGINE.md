# BUILD_RESEARCH_ENGINE.md
# מנוע מחקר נישות אוטומטי — Profitly
# תאריך: 30.03.2026

---

## 🎯 מטרה

בניית מנוע מחקר נישות אוטומטי שרץ 24/7 על Windows VPS, אוסף נתונים מ-6 כלים חינמיים + Etsy API + Apify, מזהה נישות רווחיות, ומאפשר גם חיפוש ידני.

**הפלט:** דף Dashboard ב-Profitly עם נישות מומלצות, מוצרים מובילים, ונתוני keywords.

---

## 📍 מיקום בפרויקט

```
etsy/
├── apps/
│   └── research-engine/          ← המודול שנבנה
│       ├── src/
│       │   ├── scrapers/         ← scraper לכל כלי
│       │   │   ├── erank.ts
│       │   │   ├── koalanda.ts
│       │   │   ├── alura.ts
│       │   │   ├── everbee.ts
│       │   │   ├── ehunt.ts
│       │   │   └── base-scraper.ts
│       │   ├── api-clients/      ← כלים עם API
│       │   │   ├── etsy-api.ts
│       │   │   └── apify-client.ts
│       │   ├── processors/       ← עיבוד ומיזוג נתונים
│       │   │   ├── data-merger.ts
│       │   │   ├── niche-scorer.ts
│       │   │   └── niche-detector.ts
│       │   ├── scheduler/        ← תזמון ותורים
│       │   │   ├── scheduler.ts
│       │   │   └── jobs.ts
│       │   ├── storage/          ← שמירה ל-DB
│       │   │   ├── database.ts
│       │   │   └── models.ts
│       │   └── index.ts          ← entry point
│       ├── config/
│       │   ├── tools.json        ← הגדרות כלים (profiles, limits)
│       │   ├── categories.json   ← קטגוריות Etsy לסריקה
│       │   └── schedule.json     ← לוח זמנים
│       ├── package.json
│       └── tsconfig.json
```

---

## 🔧 דרישות מוקדמות

### על ה-Windows VPS:
- [x] Node.js 18+
- [x] PostgreSQL 16
- [x] Redis
- [x] AdsPower (כבר מותקן)
- [ ] פרופילי AdsPower חדשים לכלי מחקר (6 פרופילים)
- [ ] חשבון חינמי בכל כלי

### חשבונות לפתוח (כל אחד עם אימייל נפרד):

| # | כלי | URL | אימייל | פרופיל AdsPower |
|---|------|-----|--------|-----------------|
| 1 | eRank | https://erank.com | research1@... | Profile #R1 |
| 2 | Koalanda | https://koalanda.pro | research2@... | Profile #R2 |
| 3 | Alura | https://alura.io | research3@... | Profile #R3 |
| 4 | EverBee | https://everbee.io | research4@... | Profile #R4 |
| 5 | EHunt | https://ehunt.ai | research5@... | Profile #R5 |
| 6 | Apify | https://apify.com | research6@... | לא צריך — API |

### Etsy API (כבר קיים):
- ShopPilot keystring: `111vgjj2jj473fdrua428twk`
- 100K QPD / 150 QPS

---

## 🧠 Phase 1 — מודל מחקר נישות (הלוגיקה)

### הגישה: Top-Down — מחנויות מצליחות לנישות

```
שלב 1: גילוי חנויות מצליחות
   │  מקורות: Etsy API, Koalanda, eRank, EHunt
   │  קריטריונים: 10,000+ מכירות, 4.5+ כוכבים, פעילה
   ▼
שלב 2: ניתוח מוצרים מובילים
   │  לכל חנות — שליפת 30 המוצרים הכי נמכרים
   │  מקורות: Etsy API (listings), Alura, EverBee
   │  נתונים: מכירות, מחיר, תגים, קטגוריה, favorites
   ▼
שלב 3: חילוץ תת-נישות (AI)
   │  Claude/Gemini מנתח patterns:
   │  - מה המשותף בין המוצרים?
   │  - איזה סגנון? איזה קהל? איזה סוג?
   │  - פלט: שם תת-נישה + keywords מרכזיים
   ▼
שלב 4: ולידציה עם נתוני keywords
   │  מקורות: eRank, Koalanda, Alura
   │  בדיקה: יש ביקוש? תחרות סבירה? אפשר לייצר?
   ▼
שלב 5: דירוג ו-Niche Score
   │  חישוב ציון 0-100 לכל נישה
   │  שמירה ב-DB + הצגה ב-Dashboard
   ▼
פלט: רשימת נישות מדורגות עם כל הנתונים
```

### הסבר כל שלב:

#### שלב 1 — גילוי חנויות מצליחות

**מקור ראשי: Etsy API**
```
GET /v3/application/shops?limit=25&sort_on=created&sort_order=desc
```
- שולפים חנויות לפי קטגוריה
- מסננים: 10,000+ transaction_count, rating >= 4.5

**מקור משני: Koalanda (Free)**
- דף Top Etsy Shops: https://koalanda.pro/top-etsy-shops
- סינון לפי מדינה, קטגוריה, מכירות
- Scraping: טבלת חנויות מובילות

**מקור משני: eRank (Free)**
- Top Shops: https://erank.com/top-shops
- מוגבל ב-Free plan אבל נותן את הטופ

**מקור משני: EHunt (Free)**
- Shop Analyzer: https://ehunt.ai/shop-analyzer
- 10 חיפושים ביום — ממוקדים

**פלט שלב 1:**
```json
{
  "shop_id": "EtsyShop123",
  "shop_name": "MinimalistArtCo",
  "total_sales": 45000,
  "rating": 4.9,
  "category": "Art & Collectibles",
  "country": "US",
  "open_date": "2019-03-15",
  "listing_count": 250,
  "sources": ["etsy_api", "koalanda", "erank"]
}
```

#### שלב 2 — ניתוח מוצרים מובילים

**מקור ראשי: Etsy API**
```
GET /v3/application/shops/{shop_id}/listings/active?limit=100&sort_on=price
GET /v3/application/listings/{listing_id}?includes=Images,Tags
```
- שליפת כל ה-listings של החנות
- מיון לפי views/favorites (אין API למכירות — הערכה)

**מקור משני: Alura (Free)**
- ניתוח חנות: מכירות חודשיות מוערכות לכל listing
- Scraping: כניסה לעמוד חנות, סינון לפי monthly sales

**מקור משני: EverBee (Free)**
- תוסף Chrome שמציג הערכת מכירות
- Scraping: פתיחת עמוד חנות ב-Etsy, קריאת נתוני EverBee

**מקור משני: Apify (API)**
```python
# Apify Etsy Scraper — שליפת מוצרים לפי חנות
run_input = {
    "startUrls": [{"url": "https://www.etsy.com/shop/MinimalistArtCo"}],
    "maxItems": 50
}
```
- נתונים מלאים: מחיר, תמונות, תגים, favorites, reviews

**פלט שלב 2:**
```json
{
  "listing_id": 123456789,
  "title": "Custom Couple Line Art Portrait",
  "price": 29.99,
  "sales_estimate": 1500,
  "monthly_sales": 120,
  "favorites": 8500,
  "tags": ["couple portrait", "line art", "custom portrait", ...],
  "category": "Art & Collectibles > Drawing & Illustration",
  "shop_id": "EtsyShop123",
  "sources": ["etsy_api", "alura", "apify"]
}
```

#### שלב 3 — חילוץ תת-נישות (AI)

**הלוגיקה:**
לוקחים את 30 המוצרים המובילים של כל חנות ושולחים ל-Claude API:

```
System: אתה מנתח נישות Etsy. קיבלת רשימת מוצרים מובילים מחנות מצליחה.
זהה:
1. מה התת-נישה של החנות? (לא "תכשיטים" אלא "שרשראות שם מותאמות בזהב 14K")
2. מה ה-keywords המרכזיים?
3. מה סוג המוצר? (דיגיטלי / פיזי / POD / dropship)
4. מה טווח המחירים?
5. מה הקהל היעד?

החזר JSON בלבד.
```

**פלט שלב 3:**
```json
{
  "niche_name": "Custom Couple Line Art Portraits",
  "parent_niche": "Wall Art",
  "category": "Art & Collectibles",
  "sub_niche_level": 3,
  "keywords": ["couple portrait", "line art portrait", "custom couple drawing"],
  "product_type": "digital",
  "price_range": {"min": 15, "max": 45},
  "target_audience": "couples, wedding gifts, anniversary",
  "production_method": "AI + digital illustration",
  "shop_examples": ["MinimalistArtCo", "LineArtStudio"]
}
```

#### שלב 4 — ולידציה עם Keywords

**עבור כל keyword שזוהה בשלב 3:**

**eRank (50 חיפושים/יום):**
- Search volume (estimated)
- Competition level
- Click rate
- Top listings

**Koalanda (מוגבל/יום):**
- Search Score (שילוב volume + CTR + engagement)
- Trend (rising/stable/declining)
- Related keywords

**Alura (מוגבל/יום):**
- Keyword volume
- Competition score
- Related tags

**פלט שלב 4:**
```json
{
  "keyword": "couple line art portrait",
  "erank_data": {
    "searches": 12500,
    "competition": "medium",
    "click_rate": 0.65,
    "avg_price": 28.50
  },
  "koalanda_data": {
    "search_score": 78,
    "trend": "rising",
    "ctr": 0.72
  },
  "alura_data": {
    "volume": "high",
    "competition": 0.45
  }
}
```

#### שלב 5 — Niche Score

**נוסחה:**
```
Niche Score = (Demand × 0.35) + (Opportunity × 0.25) + (Trend × 0.20) + (Profitability × 0.20)

Demand (0-100):
  = weighted_avg(erank_searches, koalanda_score, alura_volume)
  משקלות: eRank 50%, Koalanda 30%, Alura 20%

Opportunity (0-100):
  = 100 - Competition_Score
  Competition = מספר listings × רמת תחרות

Trend (0-100):
  = if rising: 80-100
    if stable: 40-60
    if declining: 0-30

Profitability (0-100):
  = based on avg_price, production_cost, margins
  digital products get bonus (+20)

המלצה:
  Score > 80 = ✅ Excellent — להתחיל מיד
  Score > 60 = 👍 Good — שווה לבדוק
  Score > 40 = 🟡 Medium — תחרות גבוהה
  Score < 40 = ❌ Avoid — לא כדאי
```

---

## 📅 Scheduler — לוח זמנים יומי

```json
{
  "daily_schedule": {
    "phase_1_discovery": {
      "06:00": "Etsy API — שליפת חנויות מובילות (אוטומטי, ללא AdsPower)",
      "06:30": "Apify — scraping מוצרים מובילים (API, ללא AdsPower)",
      "07:00": "Koalanda — Top Shops (AdsPower Profile #R2)",
      "08:00": "eRank — Top Shops + Trends (AdsPower Profile #R1)"
    },
    "phase_2_analysis": {
      "10:00": "EHunt — Shop Analysis (AdsPower Profile #R5)",
      "11:00": "Alura — Product Research (AdsPower Profile #R3)",
      "13:00": "EverBee — Sales Estimates (AdsPower Profile #R4)"
    },
    "phase_3_keywords": {
      "15:00": "eRank — Keyword Research (Profile #R1, מנוצל שארית 50 חיפושים)",
      "16:00": "Koalanda — Keyword Scores (Profile #R2)",
      "17:00": "Alura — Keyword Research (Profile #R3)"
    },
    "phase_4_processing": {
      "20:00": "מיזוג נתונים + חישוב Niche Score",
      "21:00": "AI Analysis (Claude API) — חילוץ תת-נישות",
      "22:00": "עדכון Dashboard + שליחת סיכום (אופציונלי)"
    }
  },
  "limits_per_tool": {
    "erank": {"max_searches": 45, "note": "שומרים 5 לחיפוש ידני"},
    "koalanda": {"max_searches": 10, "note": "Free plan מוגבל מאוד"},
    "alura": {"max_searches": 15, "note": "Free plan מוגבל"},
    "everbee": {"max_searches": 8, "note": "10/חודש = ~0.3/יום, נשתמש חכם"},
    "ehunt": {"max_searches": 8, "note": "10/יום, שומרים 2 לידני"},
    "apify": {"max_credits": 4.5, "note": "$5/חודש, שומרים buffer"},
    "etsy_api": {"max_calls": 5000, "note": "מתוך 100K — מרחב ענק"}
  }
}
```

### Anti-Detection:
```json
{
  "anti_detection": {
    "random_delay_between_actions": {"min_ms": 2000, "max_ms": 8000},
    "random_delay_between_searches": {"min_ms": 30000, "max_ms": 120000},
    "random_break_chance": 0.10,
    "random_break_duration": {"min_ms": 180000, "max_ms": 600000},
    "human_behavior": true,
    "bezier_mouse": true,
    "typo_rate": 0.03,
    "gradual_scroll": true
  }
}
```

---

## 💾 Database Schema

### טבלאות חדשות (להוסיף ל-PostgreSQL):

```sql
-- חנויות שנסרקו
CREATE TABLE research_shops (
    id SERIAL PRIMARY KEY,
    etsy_shop_id VARCHAR(100) UNIQUE NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    total_sales INT,
    rating DECIMAL(3,2),
    main_category VARCHAR(100),
    country VARCHAR(10),
    listing_count INT,
    open_date DATE,
    sources TEXT[],               -- ['etsy_api', 'koalanda', 'erank']
    last_scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- מוצרים מובילים
CREATE TABLE research_products (
    id SERIAL PRIMARY KEY,
    etsy_listing_id BIGINT UNIQUE NOT NULL,
    shop_id INT REFERENCES research_shops(id),
    title TEXT NOT NULL,
    price DECIMAL(10,2),
    sales_estimate INT,
    monthly_sales INT,
    favorites INT,
    reviews INT,
    tags TEXT[],
    category_path TEXT,
    image_urls TEXT[],
    is_digital BOOLEAN DEFAULT FALSE,
    sources TEXT[],
    last_scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- נישות שזוהו
CREATE TABLE research_niches (
    id SERIAL PRIMARY KEY,
    niche_name VARCHAR(255) NOT NULL,
    parent_niche VARCHAR(255),
    category VARCHAR(100),
    sub_niche_level INT DEFAULT 1,
    keywords TEXT[] NOT NULL,
    product_type VARCHAR(50),       -- 'digital', 'physical', 'pod', 'dropship'
    price_range_min DECIMAL(10,2),
    price_range_max DECIMAL(10,2),
    target_audience TEXT,
    production_method TEXT,
    shop_examples TEXT[],
    niche_score INT DEFAULT 0,      -- 0-100
    demand_score INT DEFAULT 0,
    opportunity_score INT DEFAULT 0,
    trend_score INT DEFAULT 0,
    profitability_score INT DEFAULT 0,
    recommendation VARCHAR(20),     -- 'excellent', 'good', 'medium', 'avoid'
    ai_analysis TEXT,               -- ניתוח AI מלא
    is_active BOOLEAN DEFAULT TRUE,
    last_validated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- נתוני keywords גולמיים
CREATE TABLE research_keywords_raw (
    id SERIAL PRIMARY KEY,
    keyword TEXT NOT NULL,
    source VARCHAR(50) NOT NULL,    -- 'erank', 'koalanda', 'alura'
    data JSONB NOT NULL,
    scraped_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(keyword, source, scraped_at::date)
);

-- keywords מאוחדים
CREATE TABLE research_keywords (
    id SERIAL PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    niche_id INT REFERENCES research_niches(id),
    erank_searches INT,
    erank_competition VARCHAR(20),
    erank_click_rate DECIMAL(3,2),
    koalanda_search_score INT,
    koalanda_trend VARCHAR(20),
    alura_volume VARCHAR(20),
    alura_competition DECIMAL(3,2),
    avg_volume INT,
    competition_score DECIMAL(5,2),
    trend VARCHAR(20),              -- 'rising', 'stable', 'declining'
    recommendation VARCHAR(20),
    last_updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- לוג סריקות
CREATE TABLE research_scrape_log (
    id SERIAL PRIMARY KEY,
    tool VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,    -- 'success', 'failed', 'blocked'
    items_scraped INT DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- חיפושים ידניים
CREATE TABLE research_manual_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    query_type VARCHAR(50),         -- 'niche', 'keyword', 'shop', 'product'
    status VARCHAR(20) DEFAULT 'pending',
    results JSONB,
    requested_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- אינדקסים
CREATE INDEX idx_niches_score ON research_niches(niche_score DESC);
CREATE INDEX idx_niches_recommendation ON research_niches(recommendation);
CREATE INDEX idx_niches_category ON research_niches(category);
CREATE INDEX idx_products_shop ON research_products(shop_id);
CREATE INDEX idx_products_sales ON research_products(monthly_sales DESC);
CREATE INDEX idx_keywords_niche ON research_keywords(niche_id);
CREATE INDEX idx_keywords_trend ON research_keywords(trend);
CREATE INDEX idx_scrape_log_tool ON research_scrape_log(tool, created_at);
```

---

## 🔨 שלבי בנייה (סדר עבודה ב-Claude Code)

### שלב 1: Setup בסיסי
```bash
cd /path/to/etsy
mkdir -p apps/research-engine/src/{scrapers,api-clients,processors,scheduler,storage}
mkdir -p apps/research-engine/config
cd apps/research-engine
npm init -y
npm install playwright ghost-cursor-playwright bullmq ioredis pg dotenv node-cron axios
npm install -D typescript @types/node ts-node
```

### שלב 2: Database
- הרצת כל ה-CREATE TABLE מלמעלה
- יצירת `src/storage/database.ts` — connection pool
- יצירת `src/storage/models.ts` — פונקציות CRUD

### שלב 3: Base Scraper
```typescript
// src/scrapers/base-scraper.ts
// מחלקת בסיס עם:
// - חיבור ל-AdsPower profile
// - human behavior (Bézier, typing, scrolling)
// - anti-detection (delays, breaks)
// - error handling + retry
// - logging ל-research_scrape_log
```

### שלב 4: Etsy API Client
```typescript
// src/api-clients/etsy-api.ts
// - שליפת חנויות מובילות לפי קטגוריה
// - שליפת listings של חנות
// - שליפת פרטי listing (תגים, תמונות)
// - Rate limiting (150 QPS)
```

### שלב 5: Apify Client
```typescript
// src/api-clients/apify-client.ts
// - הפעלת Etsy Scraper Actor
// - שליפת תוצאות
// - ניהול credits ($5/חודש)
```

### שלב 6: Scrapers לכל כלי
```
erank.ts     — Top Shops, Keyword Tool, Trends
koalanda.ts  — Top Shops, Top Products, Keyword Search Score
alura.ts     — Product Research, Keyword Finder, Shop Analysis
everbee.ts   — Product Analytics (Chrome extension simulation)
ehunt.ts     — Product Research, Shop Analyzer, Keyword Tool
```

כל scraper מממש:
```typescript
interface IScraper {
  name: string;
  profileId: string;
  dailyLimit: number;
  
  connect(): Promise<void>;
  searchKeyword(keyword: string): Promise<KeywordData>;
  getTopShops(category?: string): Promise<ShopData[]>;
  getTopProducts(keyword?: string): Promise<ProductData[]>;
  disconnect(): Promise<void>;
}
```

### שלב 7: Data Merger
```typescript
// src/processors/data-merger.ts
// - מיזוג נתונים מכל המקורות
// - נירמול (eRank searches ≠ Koalanda score)
// - משקלות: eRank 50%, Koalanda 30%, Alura 20%
// - טיפול בנתונים חסרים
```

### שלב 8: Niche Detector (AI)
```typescript
// src/processors/niche-detector.ts
// - שליחת מוצרים מובילים ל-Claude API
// - חילוץ תת-נישות
// - זיהוי patterns
// - שמירה ל-research_niches
```

### שלב 9: Niche Scorer
```typescript
// src/processors/niche-scorer.ts
// - חישוב Niche Score (0-100)
// - חישוב תת-ציונים (demand, opportunity, trend, profitability)
// - קביעת המלצה (excellent/good/medium/avoid)
```

### שלב 10: Scheduler
```typescript
// src/scheduler/scheduler.ts
// - BullMQ queues לכל משימה
// - node-cron ללוח זמנים יומי
// - retry logic
// - monitoring
```

### שלב 11: API Endpoints (FastAPI)
```python
# endpoints להוספה ב-backend הקיים:
# GET  /api/research/niches          — רשימת נישות מדורגות
# GET  /api/research/niches/{id}     — פרטי נישה + keywords + מוצרים
# GET  /api/research/keywords        — חיפוש keywords
# POST /api/research/query           — חיפוש ידני (נכנס לתור)
# GET  /api/research/stats           — סטטיסטיקות (כמה נסרק, מתי)
# GET  /api/research/log             — לוג סריקות
```

### שלב 12: Frontend (Next.js)
```
דף חדש: /research
- טבלת נישות מדורגות עם Niche Score
- סינון לפי קטגוריה, ציון, trend
- עמוד פרטי נישה עם כל הנתונים
- טופס חיפוש ידני
- גרף trends
- RTL עברית
```

---

## 🔄 Flow אוטומטי יומי (מה קורה כל יום)

```
06:00  ┌─ Etsy API: שליפת 200 חנויות מובילות (5 קטגוריות × 40)
       │  שמירה ב-research_shops
       │
06:30  ├─ Apify: scraping מוצרים מ-20 חנויות חדשות
       │  שמירה ב-research_products
       │
07:00  ├─ Koalanda: Top Shops + Top Products (10 חיפושים)
       │  AdsPower Profile #R2 → השלמת נתונים
       │
08:00  ├─ eRank: Top Shops + Trend Buzz (15 חיפושים)
       │  AdsPower Profile #R1 → טרנדים + חנויות
       │
10:00  ├─ EHunt: Shop Analysis (8 חיפושים)
       │  AdsPower Profile #R5 → ניתוח חנויות
       │
11:00  ├─ Alura: Product Research (10 חיפושים)
       │  AdsPower Profile #R3 → הערכות מכירות
       │
13:00  ├─ EverBee: Sales Estimates (8 חיפושים)
       │  AdsPower Profile #R4 → נתוני מכירות
       │
15:00  ├─ eRank: Keyword Research (30 חיפושים)
       │  Profile #R1 → ולידציית keywords
       │
16:00  ├─ Koalanda: Keyword Scores (שארית חיפושים)
       │  Profile #R2 → Search Scores
       │
17:00  ├─ Alura: Keyword Research (5 חיפושים)
       │  Profile #R3 → volume + competition
       │
20:00  ├─ Data Merger: מיזוג כל הנתונים
       │  נירמול + משקלות + unified_keywords
       │
21:00  ├─ AI Analysis: Claude API
       │  חילוץ תת-נישות מהמוצרים שנאספו
       │
22:00  └─ Niche Scorer: חישוב ציונים
          עדכון research_niches + Dashboard
```

---

## 🎯 קטגוריות Etsy לסריקה (התחלה)

```json
{
  "categories": [
    {
      "name": "Art & Collectibles",
      "subcategories": ["Drawing & Illustration", "Prints", "Photography"]
    },
    {
      "name": "Jewelry",
      "subcategories": ["Necklaces", "Rings", "Earrings", "Bracelets"]
    },
    {
      "name": "Home & Living",
      "subcategories": ["Home Decor", "Wall Decor", "Kitchen & Dining"]
    },
    {
      "name": "Wedding",
      "subcategories": ["Invitations", "Decorations", "Gifts"]
    },
    {
      "name": "Clothing",
      "subcategories": ["T-Shirts", "Dresses", "Accessories"]
    },
    {
      "name": "Digital Downloads",
      "subcategories": ["Printable Art", "Planners", "SVG Files", "Templates"]
    },
    {
      "name": "Personalized",
      "subcategories": ["Custom Portraits", "Name Jewelry", "Engraved Items"]
    },
    {
      "name": "Baby & Kids",
      "subcategories": ["Nursery Decor", "Kids Clothing", "Toys"]
    }
  ]
}
```

---

## ⚠️ חשוב לזכור

1. **כל scraper בפרופיל AdsPower נפרד** — proxy שונה, fingerprint שונה, אין קשר ביניהם
2. **לא לחרוג ממגבלות Free plan** — אם נחסמים, פותחים חשבון חדש עם אימייל אחר
3. **EverBee מוגבל מאוד** — 10 keywords בחודש! להשתמש רק ב-keywords הכי חשובים
4. **Apify — $5/חודש** — לנצל חכם, ~50 מוצרים בדקה = הרבה data ב-$5
5. **Etsy API — 100K/יום** — מרחב ענק, זה המקור הכי אמין
6. **AI (Claude API) — עלות** — לאגד מוצרים לbatch ולא לשלוח אחד-אחד
7. **git pull בתחילת עבודה, git push בסוף** — סנכרון עם המחשב הראשי
8. **Human behavior חובה** — Bézier, טעויות הקלדה, גלילה הדרגתית, השהיות

---

## 📊 ציפיות (מה נקבל בסוף כל יום)

- ~200 חנויות חדשות מנותחות
- ~1,000 מוצרים מובילים עם נתוני מכירות
- ~30-50 keywords מאומתים עם volume ותחרות
- ~5-10 נישות חדשות מזוהות ומדורגות
- Dashboard מעודכן עם נישות מומלצות

**אחרי חודש:** מאגר של ~6,000 חנויות, ~30,000 מוצרים, ~1,000 keywords, ו-~200 נישות מדורגות.

---

## 🚀 הצעד הבא

1. **אתה:** פותח חשבונות בכל 6 הכלים + מגדיר 6 פרופילי AdsPower
2. **Claude Code:** מקבל את הקובץ הזה ומתחיל לבנות — שלב אחרי שלב
3. **Phase 2 (אחרי שהמנוע עובד):** בניית מנוע תגים + כותרות + SEO
