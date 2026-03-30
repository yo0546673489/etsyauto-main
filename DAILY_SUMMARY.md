# סיכום יומי — 30/03/2026

## תיקייה ספציפית: apps/web + apps/api

---

## מה נעשה היום:

### 1. תיקון עמודת צפיות במוצרים (views)
- **בעיה:** עמודת הצפיות הציגה `—` על כל המוצרים למרות שהנתונים קיימים ב-DB (44 מוצרים עם צפיות)
- **סיבה:** ה-API ב-`list_products` endpoint בנה dict ידני שלא כלל את שדה `views`
- **תיקון:** הוספת `"views": getattr(p, "views", 0) or 0` ב-`apps/api/app/api/endpoints/products.py`
- **קובץ:** `apps/api/app/api/endpoints/products.py` (שורה ~410)

### 2. עיצוב מחדש של דף ההזמנות
- עיצוב חדש לחלוטין לפי mockup שהמשתמש שלח
- **כותרת:** "ניהול הזמנות" + תת-כותרת + כפתור "סנכרן הזמנות"
- **כרטיסי סטטיסטיקה:** שורה אחת עם 5 כרטיסים: שולמו / לא שולמו / בתהליך / בוטלו / הוחזרו
- **טבלה:** כותרת "עסקאות אחרונות" + כפתורי "ייצא נתונים" ו"סינון מתקדם"
- **עמודות:** מספר הזמנה / לקוח / תאריך / סכום / מעקב / תשלום / סטטוס / פעולות
- כל הטקסטים בעברית + RTL מלא
- **קובץ:** `apps/web/app/orders/page.tsx`

### 3. תרגום עברית מלא בעמוד פרטי הזמנה + הסרת שדות
- תרגום כל הטקסטים לעברית (כפתורים, כרטיסים, שדות, הודעות)
- **הסרת שדה "תאריך משלוח"** מטופס המעקב
- **הסרת שדה "פתק"** מטופס המעקב
- נשארו רק 2 שדות: מספר מעקב + חברת שליחויות
- **קובץ:** `apps/web/app/orders/[id]/page.tsx`

### 4. החלפת מפתחות Etsy API
- **מפתח ישן:** `111vgjj2jj473fdrua428twk`
- **מפתח חדש:** `2cervnvhc9e9kkrhyenwu09u` / Secret: `bme4ns6soo`
- עודכן ישירות ב-`/opt/profitly/.env` בשרת
- הופעל מחדש etsy-api container
- נוספה כתובת Callback ב-Etsy Developers: `https://yaroncohen.cc/oauth/etsy/callback`
- **בדיקה:** Ping ל-Etsy API מחזיר `{"application_id":1476950078347}` ✅

### 5. בדיקת מגבלות API
- **בקשות לשנייה:** 150
- **בקשות ליום:** 100,000
- **נשאר היום:** 99,998

---

## מה עבד בהצלחה:
- ✅ עמודת צפיות מציגה נתונים אמיתיים על מוצרים
- ✅ דף הזמנות עיצוב חדש עברי — עלה לשרת
- ✅ עמוד פרטי הזמנה — תרגום עברי + הסרת שדות מיותרים
- ✅ מפתח Etsy API חדש פעיל בשרת
- ✅ Callback URL עודכן ב-Etsy Developers

---

## חיבורים ושרתים:
- **שרת:** `185.241.4.225` (Linux VPS)
- **אתר:** `https://yaroncohen.cc`
- **SSH Key:** `C:/Users/yossf/.ssh/profitly_server`
- **Project dir:** `/opt/profitly/`
- **Docker:** `docker compose -p etsyauto`
- **DB:** PostgreSQL בתוך `etsy-db` container
- **Etsy Client ID:** `2cervnvhc9e9kkrhyenwu09u`
- **Etsy App ID:** `1476950078347`

---

## תקלות שהיו:
1. **"The requested redirect URL is not permitted"** — Callback URL לא היה רשום בEtsy Developers. נפתר על ידי הוספת `https://yaroncohen.cc/oauth/etsy/callback`
2. **עמודת צפיות הציגה `—`** — dict ידני ב-API לא כלל `views`. נפתר.

---

## מה נשאר לעשות:
- [ ] לבדוק שחיבור חנות חדשה עובד מקצה לקצה עם המפתח החדש
- [ ] חיבור שרת Windows (אוטומציות) — חסר IP של השרת
- [ ] SSL ל-`www.yaroncohen.cc`
- [ ] Analytics dashboard עם נתונים אמיתיים
- [ ] סנכרון לדג'ר אוטומטי כל שעה (Celery Beat)

---

## מאיפה ממשיכים:
- הצעד הבא: לבדוק שחיבור חנות עם המפתח החדש עובד מקצה לקצה
- אם לא עובד — לבדוק logs: `docker logs etsy-api --tail 50`
- IP של שרת Windows עדיין חסר לחיבור מודול האוטומציות
