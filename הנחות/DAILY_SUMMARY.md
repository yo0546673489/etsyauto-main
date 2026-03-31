# סיכום מלא — אוטומציית הנחות Etsy
## תאריך: 2026-03-31
## תיקייה: `C:\etsy\הנחות\`

---

## 🎯 מה המערכת עושה

המשתמש נכנס לאתר `yaroncohen.cc/discounts` → מגדיר הנחה → **האוטומציה יוצרת מבצע (Sale) ב-Etsy אוטומטית דרך AdsPower**.

- אין תאריך התחלה → מתחיל מחר (כי Etsy UK timezone)
- נמחק / כובה → מסיים את המבצע ב-Etsy מיד

---

## 🖥️ פרטי שרת

**שרת VPS Windows (שם אתה עובד):**
- מחשב: `91.202.169.242` (Windows Server 2025)
- תיקיית עבודה: `C:\etsy\הנחות\`

**שרת Ubuntu (DB + Redis):**
- IP: `185.241.4.225`
- PostgreSQL: port `5433`
- Redis: port `6380`

**AdsPower:**
- רץ **מקומית** על שרת ה-Windows
- API: `http://127.0.0.1:50325`
- API Key: `c44cda0f358957f4a60bc8054504571400707d1cc0163261`
- פרופיל חנות 1: `k16kmi55` (השתמשנו בו לבדיקות)

---

## 🗄️ Databases

### etsy_messages (Node.js schema)
```
postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_messages
```
- `stores` — חנויות עם `adspower_profile_id`
- `discount_tasks` — משימות לביצוע

### etsy_platform (Python FastAPI schema)
```
postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_platform
```
- `discount_rules` — חוקי הנחה שהמשתמש הגדיר
- `discount_tasks` — משימות מתוזמנות (מה ה-Executor מסתכל עליו)
- `shops` — חנויות עם `adspower_profile_id`

**טבלת `discount_tasks` ב-etsy_platform:**
```sql
id, rule_id, shop_id, action ('apply_discount'/'remove_discount'),
discount_value, scope, listing_ids, scheduled_for, status,
started_at, completed_at, error_message, retry_count
```

**טבלת `discount_rules` ב-etsy_platform:**
```sql
id, shop_id, name, discount_type, discount_value, scope,
listing_ids, target_country, terms_text, etsy_sale_name,
start_date, end_date, is_active
```

---

## 🔄 זרימת העבודה

```
yaroncohen.cc/discounts
        ↓ (Python FastAPI)
  etsy_platform.discount_tasks (status='pending')
        ↓ (כל 5 דקות)
  DiscountTaskExecutor (מסתכל על ה-DB)
        ↓
  BullMQ queue: 'discount-execute'
        ↓
  executeDiscount Worker
        ↓
  AdsPower → פותח פרופיל k16kmi55
        ↓
  Playwright CDP → מתחבר לדפדפן
        ↓
  EtsyDiscountManager.createSale()
        ↓
  Etsy website (creates sale)
```

---

## 📁 מבנה הקבצים

```
C:\etsy\הנחות\
├── src/
│   ├── index.ts                     # Entry point — מפעיל הכל
│   ├── config/index.ts              # הגדרות (DB, Redis, AdsPower)
│   ├── utils/logger.ts              # Logger פשוט
│   ├── browser/
│   │   ├── etsyDiscountManager.ts  # *** הקובץ המרכזי *** — אוטומציית Etsy
│   │   └── humanBehavior.ts        # תנועות עכבר אנושיות
│   ├── adspower/
│   │   └── controller.ts           # API של AdsPower (פתיחה/סגירה של פרופיל)
│   ├── workers/
│   │   └── executeDiscount.ts      # BullMQ worker
│   ├── scheduler/
│   │   └── discountTaskExecutor.ts # Polls etsy_platform כל 5 דקות
│   ├── stores/
│   │   └── resolver.ts             # שליפת פרטי חנויות מה-DB
│   ├── api/
│   │   └── discounts.ts            # Fastify API routes
│   └── db/migrations/
│       └── discounts.sql           # SQL schema
├── .env                            # Variables (כבר מלא!)
├── package.json
├── tsconfig.json
└── DAILY_SUMMARY.md               # הקובץ הזה
```

---

## ⚙️ PM2 — שירות שרץ

ב-`הודעות` יש PM2 process בשם `etsy-messages` שעדיין מריץ את האוטומציה.
כשתעבוד מ-`הנחות`, תצטרך:

```powershell
# התקן dependencies
cd C:\etsy\הנחות
npm install

# Build
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\etsy\הנחות"
& ".\node_modules\.bin\tsc.cmd"

# הפעל כ-PM2 process חדש
node "C:\Users\Administrator\AppData\Roaming\npm\node_modules\pm2\bin\pm2" start dist/index.js --name etsy-discounts

# שמור שישרוד restart
node "C:\Users\Administrator\AppData\Roaming\npm\node_modules\pm2\bin\pm2" save
```

---

## 🐛 מצב נוכחי — הבאג שנעבד עליו

### מה עוד לא עובד
`EtsyDiscountManager.createSale()` — יוצר מבצע ב-Etsy אבל נכשל בשלבים שונים.

### בעיות שתוקנו (אל תחזור עליהן!)
| בעיה | תיקון |
|------|--------|
| סלקטור `data-datepickerInput` לא קיים | `input[data-datepicker-input]` (עם מקף) |
| פורמט תאריך MM/DD/YYYY | `DD/MM/YYYY` (UK Etsy locale) |
| לחיצת Escape מנווטת מהדף | **אסור ללחוץ Escape** בטופס! |
| כפתור Continue חסום על ידי overlay | לחיצה דרך JavaScript: `button.click()` |
| `h1:has-text("sale")` false positive | הצלחה = רק navigation מחוץ ל-createSale URL |
| Start date "בעבר" | Start = מחר (UK timezone, +1 יום) |

### הבאג הנוכחי שעובדים עליו
**תאריך הסיום שגוי** — הלוח שנה בוחר `30/03/2026` (March 30) במקום `30/04/2026` (April 30).

**סיבה שגילינו:**
- Etsy **לא** משתמשת בקלאסים עם מספרים (אין `.react-datepicker__day--030`!)
- aria-label הוא רק `day-30` (ולא `"April 30, 2026"`)
- שני הימים (March 30 outside-month + April 30) **נראים זהים בסלקטור**

**הפתרון הנכון** (כבר מקודד ב-`etsyDiscountManager.ts`):
```typescript
// JS iteration — מסנן לפי innerText + לא outside-month
const clicked = await this.page.evaluate((tDay) => {
  const days = Array.from(document.querySelectorAll('.react-datepicker__day'));
  const candidates = days.filter(d => {
    const text = (d as HTMLElement).innerText?.trim();
    const classes = d.getAttribute('class') || '';
    return text === String(tDay) && !classes.includes('outside-month');
  });
  if (candidates.length > 0) {
    (candidates[0] as HTMLElement).click();
    return { success: true, ... };
  }
  return { success: false, ... };
}, targetDay);
```

**למה JS click ולא Playwright click:**
- `react-datepicker__header` חוסם pointer events על תאי הימים
- Playwright נכשל בגלל ה-overlay
- JS `element.click()` עוקף את הבעיה

### בעיה נוספת — טופס לא נטען מיד
הטופס של createSale **טוען כ-modal עם spinner**. לוקח כמה שניות להיות מוכן.
- Timeout של `select[name="reward_type"]` הוגדל ל-**25 שניות**
- ה-select מאשר שהטופס נטען

### בעיית OOM (שריפת זיכרון)
PM2 קרס פעם אחת עם OOM. קשור כנראה ל-12+ restarts מצטברים.
התיקון: הסרנו screenshots מיותרות שנלקחו בזמן ריצה.

---

## 🔍 ממצאים חשובים מה-DOM (אומתו 2026-03-31)

```javascript
// מבנה תאי לוח השנה ב-Etsy (react-datepicker מותאם):
// יום רגיל:
"classes": "react-datepicker__day"
"aria": "day-30"    // רק המספר, לא "April 30, 2026"!

// יום מחוץ לחודש:
"classes": "react-datepicker__day react-datepicker__day--outside-month"
"aria": "day-30"    // גם הוא day-30!

// יום סוף שבוע:
"classes": "react-datepicker__day react-datepicker__day--weekend"

// יום נוכחי (היום):
"classes": "react-datepicker__day react-datepicker__day--today"

// Navigation buttons:
// Next month: .react-datepicker__navigation--next
// Prev month: .react-datepicker__navigation--previous

// Calendar header:
// .react-datepicker__current-month → "April 2026"

// Date inputs:
// input[data-datepicker-input] → 2 inputs (start + end)
// input[name="reward_type_percent_input"] → Custom percent input
// select[name="reward_type"] → dropdown לבחירת סוג הנחה
// select[name="reward_type_percent_dropdown"] → dropdown לאחוז
```

---

## 🧪 כלים לבדיקה (בתיקייה C:\etsy\)

```
debug-calendar-classes.js  — פותח AdsPower ובודק DOM של לוח השנה
test-full-sale-creation.js — מריץ תהליך מלא ושומר screenshots
force-reset-task.js        — מאפס task לסטטוס pending לבדיקה חוזרת
check-etsy-sales.js        — בודק אם המבצע קיים ב-Etsy
do-build.js                — מבנה TypeScript + restart PM2
reset-task-and-watch.js    — מאפס + מפעיל ריצה מהירה
```

### לבדיקה ידנית של AdsPower:
```javascript
// פתיחת פרופיל
http://127.0.0.1:50325/api/v1/browser/start?user_id=k16kmi55
// סגירה
http://127.0.0.1:50325/api/v1/browser/stop?user_id=k16kmi55
// סטטוס
http://127.0.0.1:50325/api/v1/browser/active?user_id=k16kmi55
```

---

## 📋 מאיפה ממשיכים

### הצעד הבא:
1. **בדוק אם task 4 הצליח** (ריצה אחרונה של PM2 מ-הודעות):
   ```sql
   -- ב-etsy_platform:
   SELECT id, status, error_message FROM discount_tasks WHERE id = 4;
   ```

2. **אם לא הצליח** — reset ובדיקת הריצה עם ה-build החדש:
   ```
   node C:\etsy\force-reset-task.js
   # ואז המתן 6 דקות ובדוק לוגים
   ```

3. **אם הצליח** — יצירת VCRHC קיים ב-Etsy. צריך לקחת screenshot מה-Etsy sales page ולאמת.

4. **לאחר אימות** — לעצור את ה-`etsy-messages` PM2 process עבור חלק ההנחות (אחרי שה-`etsy-discounts` process של `הנחות` יעבוד).

### צ'אט הבא צריך לבדוק:
- [ ] האם הבאג של תאריך הסיום תוקן? (ה-JS iteration של לוח השנה)
- [ ] האם ה-select timeout של 25s מספיק?
- [ ] האם PM2 עם `etsy-discounts` יכול לרוץ במקביל ל-`etsy-messages`?
- [ ] התקנת `npm install` ב-`C:\etsy\הנחות\`
- [ ] Build ו-PM2 start לפרויקט החדש

---

## 🚀 פקודות Build ו-PM2 (Windows VPS)

```powershell
# Build (חייב PowerShell כי Node לא ב-PATH)
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\etsy\הנחות"
& ".\node_modules\.bin\tsc.cmd"

# הפעלת PM2
$nodePath = "C:\Program Files\nodejs\node.exe"
$pm2 = "C:\Users\Administrator\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
& $nodePath $pm2 start "C:\etsy\הנחות\dist\index.js" --name "etsy-discounts"

# בדיקת לוגים
& $nodePath $pm2 logs etsy-discounts --lines 50 --nostream

# Restart
& $nodePath $pm2 restart etsy-discounts
```

---

## 💡 הערות חשובות

1. **AdsPower חייב לרוץ מקומית** — CDP connection הוא `ws://127.0.0.1:PORT`. לא עובד מרחוק.
2. **רק חנות אחת בזמן** — `concurrency: 1` ב-BullMQ worker. לא להריץ מספר פרופילים במקביל.
3. **אל תלחץ Escape** בטופס ה-createSale — זה מנווט מהדף!
4. **תאריך התחלה = מחר** תמיד. Etsy UK timezone דורש תאריך עתידי.
5. **שם המבצע = אלפאנומרי בלבד** (ללא רווחים, ללא עברית) — `VCRHC`, `SALE25` וכו'.
6. **DB port = 5433** (לא 5432!) — PostgreSQL על Ubuntu רץ על פורט לא סטנדרטי.

---

## 🔑 Credentials מרוכזים

| שירות | פרטים |
|-------|--------|
| DB (שני ה-DB) | `postgres:postgres_dev_password@185.241.4.225:5433` |
| DB שמות | `etsy_messages` / `etsy_platform` |
| Redis | `185.241.4.225:6380` |
| AdsPower API | `http://127.0.0.1:50325` |
| AdsPower Key | `c44cda0f358957f4a60bc8054504571400707d1cc0163261` |
| פרופיל בדיקה | `k16kmi55` (חנות 1 — חנות 1) |
| PM2 (ישן) | `etsy-messages` ב-`C:\etsy\הודעות\` |
| PM2 (חדש) | `etsy-discounts` ב-`C:\etsy\הנחות\` |
