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

### 📝 מיזוג CLAUDE.md (סוף יום)
- מוזגו שני קבצי CLAUDE.md לאחד:
  - **חלק 1** (חדש מ-`D:\הורדות\CLAUDE.md`): הוראות כלליות — מחשבים, טריגרים, סגנון, כללי התנהגות אנושית לאוטומציות, פרוטוקול סגירת יום
  - **חלק 2** (קיים): תיעוד מלא של הפרויקט — טכנולוגיות, מבנה, מה נעשה, מאיפה להמשיך
- הקובץ עלה ל-GitHub בהצלחה: commit `17d5fa0`

## 📁 קבצים שהשתנו:

### בשרת `/opt/profitly/`
- `.env` — עודכנו כל ה-URL variables לדומיין החדש

### בקוד המקומי + שרת
- `apps/web/components/layout/NotificationPanel.tsx` — תיקוני RTL
- `apps/web/components/layout/TopBar.tsx` — תיקוני RTL בכל dropdown menus
- `CLAUDE.md` — מוזג: הוראות כלליות + תיעוד מלא של הפרויקט

## 🔄 מאיפה ממשיכים (צ'אט הבא):

**הצעד הראשון**: היכנס ל-`https://yaroncohen.cc/settings` וחבר מחדש את שתי החנויות (FigurineeHaven + CoreBags) דרך Etsy OAuth.

**אחרי חיבור החנויות**: הפעל sync כדי לטעון מוצרים + הזמנות מ-Etsy לדאטהבייס החדש בשרת.

**CLAUDE.md מוזג** — הצ'אט הבא יקרא גם הוראות כלליות וגם תיעוד מלא מאותו קובץ אחד.

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
