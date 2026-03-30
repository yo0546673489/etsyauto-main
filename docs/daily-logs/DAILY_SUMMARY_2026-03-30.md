# סיכום יום עבודה - 2026-03-30

## ✅ מה בוצע היום:

### 🚀 העלאה לשרת (Deployment)
- תוקנה בעיית ufw שחסמה SSH (port 22) — נפתחה גישה דרך Remote Console של Kamatera
- הותקן ו-הוגדר nginx על השרת `185.241.4.225`
- הופעל SSL דרך Let's Encrypt עבור `https://yaroncohen.cc`
- עודכן `.env` בשרת עם הדומיין החדש

### 🔧 תיקוני קישורים ו-OAuth
- עודכן `FRONTEND_URL` מ-`http://185.241.4.225:3000` ל-`https://yaroncohen.cc`
- עודכן `NEXTAUTH_URL`, `ETSY_REDIRECT_URI`, `GOOGLE_REDIRECT_URI`
- הוסף `https://yaroncohen.cc` ל-Google Cloud Console (Authorized JavaScript origins + redirect URIs)
- הוסף `https://yaroncohen.cc/oauth/etsy/callback` ל-Etsy Developer Console
- נמחק A record ישן (2.57.91.91) ב-Hostinger DNS, נשמר הנכון (185.241.4.225)

### 🎨 תיקוני UI — RTL
- `NotificationPanel.tsx`: שונה `right-0` ל-`end-0`, `ml-auto` ל-`ms-auto`
- `TopBar.tsx`: שונו כל 3 dropdown menus מ-`right-0` ל-`end-0` לתמיכה נכונה ב-RTL

### 🔄 Docker Rebuilds על השרת
- `docker compose -p etsyauto up -d --build web` — x3 פעמים
- `docker compose -p etsyauto up -d --build api` — x1

## 📁 קבצים שהשתנו:

### בשרת `/opt/profitly/`
- `.env` — עודכנו כל ה-URL variables לדומיין החדש

### בקוד המקומי + שרת
- `apps/web/components/layout/NotificationPanel.tsx` — תיקוני RTL
- `apps/web/components/layout/TopBar.tsx` — תיקוני RTL בכל dropdown menus

## 🔗 תשתית:

| רכיב | כתובת |
|------|--------|
| אתר ראשי | https://yaroncohen.cc |
| API | http://185.241.4.225:8080 |
| IP שרת | 185.241.4.225 |
| SSH | root@185.241.4.225 (סיסמה: aA@05466734890) |
| SSL | תקף עד 27/06/2026, מתחדש אוטומטית |

## ⏳ מה נשאר לעשות:

- [ ] **חנויות** — לחבר מחדש FigurineeHaven ו-CoreBags דרך `https://yaroncohen.cc/settings`
- [ ] **Google OAuth** — לבדוק שעובד אחרי השינויים (לפעמים לוקח 5 דקות להיות פעיל)
- [ ] **הרשמה** — ליצור חשבון ראשי דרך `/register` אם עדיין לא נעשה
- [ ] **SSL ל-www** — להוסיף `www.yaroncohen.cc` לאחר שה-DNS יתפשט
- [ ] **מיגרציה של DB** — להעביר נתונים מהדאטהבייס המקומי לשרת (הזמנות, מוצרים)
- [ ] **בדיקת www redirect** — להגדיר nginx לעשות redirect מ-www ל-apex domain

## 📝 הערות חשובות:

- הדאטהבייס בשרת הוא **חדש וריק** — כל הנתונים (חנויות, הזמנות, מוצרים) צריכים לסנכרן מ-Etsy מחדש
- סיסמת השרת: `aA@05466734890` — נשמרה ב-CloudWM
- Private Key של Kamatera שמור במייל (נשלח ל-a0583226155@gmail.com)
- nginx config נמצא ב: `/etc/nginx/sites-available/profitly`
- כל קבצי הפרויקט בשרת נמצאים ב: `/opt/profitly/`
