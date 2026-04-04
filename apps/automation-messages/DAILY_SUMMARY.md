# סיכום יומי — 04/04/2026

## תיקייה: `apps/automation-messages/` + `apps/web/components/messages/`
## מחשב: מחשב 2 (VPS Windows — `185.241.4.225`)

---

## מה נעשה היום:

### 🔧 תיקון שמות לקוחות ("read message" → שמות אמיתיים)
- **בעיה**: `InboxScraper` היה לוקח את כל טקסט הלינק כגיבוי, כולל טקסט נגישות "read message" → 92 שיחות עם שם גרוע בDB
- **תיקון `apps/automation-messages/src/browser/inboxScraper.ts`**:
  - סלקטורים ממוקדים בשלושה שלבים לחילוץ שם קונה
  - רשימת `GARBAGE_PATTERNS` שמסננת טקסטי אקססיביליטי
  - לא משתמש בfallback של כל טקסט הלינק
- **תיקון `apps/automation-messages/src/browser/etsyScraper.ts`**:
  - הוסף `isGarbageName()` — מתעלם מ-`knownCustomerName` אם הוא גרבג'
  - מחפש `scraped.customerName` מדף השיחה כהחלפה
- **תיקון `apps/automation-messages/src/sync/engine.ts`**:
  - הוסף `'read message'`, `'unread message'`, `'mark as%'` לרשימת שמות אסורים ב-UPDATE

### 🗄️ תיקון DB — שמות קיימים
- 92 שיחות עודכנו מ-"read message" ל-"Unknown Customer" (Node.js script דרך pg)
- **חילוץ שמות מ-IMAP emails** (`הודעות/fix-names-from-email.js`):
  - חיבור ל-Gmail IMAP, קריאת 491 אימיילים
  - חילוץ שם קונה מנושא ("Etsy Conversation with [Name]")
  - התאמה לפי store_id + קרבת תאריכים → 41 שיחות עודכנו
- **חילוץ שמות מהודעות** (`הודעות/fix-names-remaining.js`):
  - regex על הודעות החנות: "Hello [Name]", "Yes![Name]", "Dear [Name]" → 2 שמות נוספים
- **ניקוי שמות** — הסרת סיומות "about Order #XXX", "from StoreName"
- **תוצאה סופית: 86/106 שיחות עם שמות אמיתיים**

### 🎨 תיקון צבעי אווטארים
- **`apps/web/components/messages/MsgAvatar.tsx`**: prop `id`, seed `${id}::${name}`, 15 צבעים
- **`apps/web/components/messages/MsgConversationItem.tsx`**: מעביר `conv.id`
- **`apps/web/app/messages/page.tsx`**: מעביר `selectedConv.id`

### 🐳 Docker rebuild על שרת הלינוקס
- גישה דרך `scripts/ssh-read.js` (ssh2 + root@185.241.4.225 / `aA@05466734890`)
- `git pull` + `docker compose -p etsyauto up -d --build web` — 45 שניות ✅
- `etsy-web` ו-`etsy-api` הורצו מחדש בהצלחה

### 📤 GitHub sync
- 25 קבצים חדשים הועלו מה-VPS (screenshots, scripts, watchdog, הנחות config)

---

## תקלות שהיו:

| תקלה | פתרון |
|------|--------|
| `git push rejected` | `git pull --rebase && git push` |
| SSH key נכשל | שימוש ב-`ssh2` Node module עם password |
| IMAP — 0 results (ablink URLs) | התאמה לפי תאריך+חנות במקום URL |
| Regex בלי `i` flag — שמות גרועים | הפעלה עם `i` flag + skip list מורחבת |
| `docker` לא על VPS Windows | Docker על Linux server (185.241.4.225) דרך SSH |

---

## מה עבד בהצלחה:

- ✅ PM2 `etsy-messages` — online
- ✅ IMAP Listener — מאזין
- ✅ 86/106 שיחות עם שמות אמיתיים (Jessica Comin, Danielle, Kim, Naomi, Jennifer, Greg...)
- ✅ צבעי אווטארים מגוונים לפי ID שיחה
- ✅ Docker rebuilt — `https://yaroncohen.cc/messages` 200 OK

---

## חיבורים ושרתים:

| שרת | פרטים |
|-----|--------|
| Linux Ubuntu (Docker) | `185.241.4.225` / SSH: `root` / `aA@05466734890` |
| DB Messages | `postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_messages` |
| DB Platform | `postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_platform` |
| IMAP | `imap.gmail.com` / `a05832261551@gmail.com` / `ovmp vyok huwe qjkz` |
| Automation API | `http://localhost:3500` → `yaroncohen.cc/messages-api/` |
| PM2 process | `C:\etsy\הודעות\dist\index.js` — `etsy-messages` |

---

## מה נשאר לעשות:

1. **חנויות needs_reauth (6, 8, 10, 18, 21, 23, 24)** — חיבור מחדש ב-AdsPower + initial sync
2. **20 שיחות "Unknown Customer"** — יתעדכנו אוטומטית עם הודעה הבאה
3. **Machine 1** — `git pull` לקבל שינויי web

---

## מאיפה ממשיכים:

**הצעד הבא**: חיבור חנויות needs_reauth (6, 8, 10, 18, 21, 23, 24) ב-AdsPower + initial sync.

```bash
# initial sync לחנות ספציפית:
curl -X POST http://localhost:3500/api/sync/initial \
  -H 'Content-Type: application/json' \
  -d '{"storeId": 6}'
```
