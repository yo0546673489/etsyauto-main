# הוראות הפעלה — מנוע מחקר נישות Profitly
# תאריך: 30.03.2026

---

## 📋 שלב 1: הבאת API Token מ-Apify

1. פתח את הטאב של **Apify Store** (https://apify.com)
2. בפינה הימנית העליונה — לחץ על שם המשתמש שלך
3. לחץ על **Settings**
4. בתפריט הצדדי — לחץ על **Integrations** (או **API & Integrations**)
5. תראה שדה עם **Personal API Token** — לחץ על **Copy**
6. שמור את ה-token בצד (נזדקק לו בשלב 4)

**ה-token נראה ככה:** `apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## 📋 שלב 2: רשימת פרטי חשבונות

רשום את הפרטים של כל 6 החשבונות שפתחת:

```
eRank:
  אימייל: _______________
  סיסמה: _______________

Koalanda:
  אימייל: _______________
  סיסמה: _______________

Alura:
  אימייל: _______________
  סיסמה: _______________

EverBee:
  אימייל: _______________
  סיסמה: _______________

EHunt:
  אימייל: _______________
  סיסמה: _______________

Apify:
  אימייל: _______________
  סיסמה: _______________
  API Token: _______________
```

---

## 📋 שלב 3: העברת הקוד לשרת Windows

### אפשרות א — דרך GitHub:
1. פתח Claude Code על השרת
2. תגיד לו:
```
צור תיקייה apps/research-engine בתוך הפרויקט etsy
והעתק לתוכה את כל הקבצים מהקובץ BUILD_RESEARCH_ENGINE.md
```

### אפשרות ב — העתקה ידנית:
1. הורד את תיקיית research-engine שבניתי
2. העתק אותה לשרת Windows לתוך `C:\Users\Administrator\etsy\apps\research-engine\`

---

## 📋 שלב 4: הגדרת קובץ .env

בתיקיית research-engine, צור קובץ בשם `.env` עם התוכן הבא:

```env
# Database (אותו PostgreSQL שכבר מותקן)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=profitly
DB_USER=profitly
DB_PASSWORD=הסיסמה_של_הדאטאבייס

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Apify
APIFY_API_TOKEN=הטוקן_שהעתקת_משלב_1

# Claude API (למנוע ה-AI)
ANTHROPIC_API_KEY=המפתח_של_אנתרופיק

# eRank
ERANK_EMAIL=האימייל_שנרשמת_איתו
ERANK_PASSWORD=הסיסמה

# Koalanda
KOALANDA_EMAIL=האימייל_שנרשמת_איתו
KOALANDA_PASSWORD=הסיסמה

# Alura
ALURA_EMAIL=האימייל_שנרשמת_איתו
ALURA_PASSWORD=הסיסמה

# EverBee
EVERBEE_EMAIL=האימייל_שנרשמת_איתו
EVERBEE_PASSWORD=הסיסמה

# EHunt
EHUNT_EMAIL=האימייל_שנרשמת_איתו
EHUNT_PASSWORD=הסיסמה
```

---

## 📋 שלב 5: התקנה על השרת (Claude Code יעשה את זה)

תגיד ל-Claude Code להריץ את הפקודות האלה:

```bash
# 1. כנס לתיקייה
cd C:\Users\Administrator\etsy\apps\research-engine

# 2. התקן dependencies
npm install

# 3. התקן Playwright browsers
npx playwright install chromium

# 4. צור תיקיית logs
mkdir logs

# 5. צור טבלאות בדאטאבייס
npm run db:setup

# 6. בדוק שהכל תקין
npm run dev -- --phase4
```

---

## 📋 שלב 6: עדכון Selectors (חשוב!)

**זה השלב הכי חשוב.** ה-CSS selectors בקוד הם placeholders — צריך לעדכן אותם לפי האתרים האמיתיים.

תגיד ל-Claude Code:

```
פתח את הדפדפן, היכנס ל-eRank עם הפרטים בקובץ .env,
נווט לדף keyword-explorer, ובדוק מה ה-CSS selectors האמיתיים
של שדה החיפוש, כפתור החיפוש, ותוצאות (search volume, competition, click rate).
עדכן את הקובץ src/scrapers/erank.ts בהתאם.
חזור על זה עבור koalanda.ts, other-scrapers.ts (alura, ehunt, everbee).
```

### מה Claude Code צריך לעדכן בכל scraper:

**erank.ts:**
- selector של שדה חיפוש keyword
- selector של כפתור חיפוש
- selectors של תוצאות: searches, competition, click rate, avg price
- selectors של טבלת Top Shops
- selectors של Trend Buzz

**koalanda.ts:**
- selector של שדה חיפוש
- selectors של Search Score, trend, competition
- selectors של טבלת Top Shops
- selectors של Top Products

**other-scrapers.ts (Alura):**
- selector של Keyword Finder
- selectors של volume, competition
- selectors של Product Research

**other-scrapers.ts (EHunt):**
- selector של Keyword Tool
- selectors של search volume, competition
- selectors של Shop Analyzer

**other-scrapers.ts (EverBee):**
- selectors של Etsy search results (אם עובד בלי extension)

---

## 📋 שלב 7: הרצה ראשונה (טסט)

אחרי שהselectors מעודכנים:

```bash
# הרצת Phase 1 בלבד (גילוי חנויות)
npm run dev -- --phase1

# אם עובד — הרצת הכל
npm run dev -- --now
```

### מה צפוי לקרות:
1. הדפדפן ייפתח
2. ייכנס ל-eRank, יחפש Top Shops
3. יעבור ל-Koalanda, יחפש Top Shops
4. Apify ירוץ ברקע (API, בלי דפדפן)
5. בסוף — תראה בלוג כמה חנויות ומוצרים נאספו

### אם משהו נכשל:
- תסתכל בקובץ `logs/research-engine.log`
- תסתכל בתמונות השגיאה: `logs/error-*.png`
- בדרך כלל הבעיה היא CSS selector לא נכון — צריך לעדכן

---

## 📋 שלב 8: הפעלת Scheduler (מצב קבוע)

כשהכל עובד — להפעיל את ה-scheduler שירוץ 24/7:

```bash
# הפעלה כ-service שרץ כל הזמן
npm run start:scheduler
```

**לוח הזמנים האוטומטי:**
- 06:00 — Phase 1: גילוי חנויות (Apify + Koalanda + eRank)
- 10:00 — Phase 2: ניתוח מוצרים (EHunt + Alura + EverBee)
- 15:00 — Phase 3: מחקר keywords (eRank + Koalanda + Alura)
- 20:00 — Phase 4: מיזוג + AI + Niche Score

---

## 📋 שלב 9: בדיקת תוצאות

### דרך הדאטאבייס:
```sql
-- כמה נישות מצוינות יש?
SELECT * FROM research_niches 
WHERE recommendation = 'excellent' 
ORDER BY niche_score DESC;

-- כמה חנויות נאספו?
SELECT COUNT(*) FROM research_shops;

-- כמה מוצרים?
SELECT COUNT(*) FROM research_products;

-- keywords הכי טובים
SELECT * FROM research_keywords 
WHERE recommendation IN ('excellent', 'good')
ORDER BY avg_volume DESC;

-- מה קרה היום?
SELECT tool, status, SUM(items_scraped) as items 
FROM research_scrape_log 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tool, status;
```

---

## ⚠️ דברים חשובים לזכור

1. **לא לחבר חנויות Etsy** לכלים האלה — אנחנו רק עושים מחקר, לא מחברים חנויות
2. **EverBee מוגבל מאוד** — 10 keywords בחודש בחינם, המערכת יודעת להתחשב בזה
3. **אם נחסמים** — לפתוח חשבון חדש עם אימייל אחר
4. **Apify — $5/חודש** — המערכת שומרת על buffer, לא מבזבזת
5. **CSS selectors** — אם אתר משנה עיצוב, צריך לעדכן selectors
6. **הלוגים** — תמיד בתיקיית `logs/`, כולל screenshots של שגיאות

---

## 📁 מבנה הקבצים

```
apps/research-engine/
├── .env                          ← הסיסמאות שלך (לא ב-git!)
├── .env.example                  ← תבנית
├── package.json                  ← dependencies
├── tsconfig.json                 ← TypeScript config
├── config/
│   └── tools.json                ← הגדרות כלים + לוח זמנים
├── logs/                         ← לוגים + screenshots שגיאות
├── src/
│   ├── index.ts                  ← נקודת כניסה ראשית
│   ├── utils/
│   │   ├── logger.ts             ← מערכת לוגים
│   │   └── human-behavior.ts     ← הקלדה אנושית, עיכובים
│   ├── storage/
│   │   ├── database.ts           ← חיבור PostgreSQL
│   │   ├── setup-db.ts           ← יצירת טבלאות
│   │   └── models.ts             ← פונקציות CRUD
│   ├── scrapers/
│   │   ├── base-scraper.ts       ← מחלקת בסיס
│   │   ├── erank.ts              ← eRank scraper
│   │   ├── koalanda.ts           ← Koalanda scraper
│   │   └── other-scrapers.ts     ← Alura + EverBee + EHunt
│   ├── api-clients/
│   │   └── apify-client.ts       ← Apify API
│   ├── processors/
│   │   ├── niche-detector.ts     ← AI ניתוח נישות
│   │   ├── niche-scorer.ts       ← חישוב Niche Score
│   │   └── data-merger.ts        ← מיזוג נתונים
│   └── scheduler/
│       └── scheduler.ts          ← תזמון יומי
```

---

## 🎯 אחרי שהמנוע רץ — מה הלאה?

1. **Phase 2 של הפרויקט:** בניית מנוע תגים + כותרות + SEO
2. **דף Dashboard:** הוספת דף מחקר באתר Profitly
3. **חיפוש ידני:** אפשרות להזין keyword ולקבל תוצאות מכל הכלים
4. **התראות:** הודעה בוואטסאפ כשנמצאת נישה מצוינת
