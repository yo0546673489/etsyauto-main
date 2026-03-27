# סיכום יום עבודה - 2026-03-27

## ✅ מה בוצע היום:

### מערכת הודעות חדשה (Etsy Messages VPS)
- בנייה מאפס של מערכת עצמאית לסנכרון הודעות מ-Etsy
- Email Listener (Gmail IMAP IDLE) — מזהה התראות Etsy חדשות
- Browser Automation עם AdsPower + Playwright + HumanBehavior
- PostgreSQL DB עם 4 טבלאות: stores, conversations, messages, reply_queue
- BullMQ job queue עם 3 workers: syncConversation, initialSync, sendReply
- Fastify API server עם routes לחנויות, שיחות, הודעות, תגובות
- Socket.IO לעדכונים בזמן אמת
- 44 קבצים נוצרו בתיקיית `הודעות/`

### שילוב ממשק ההודעות ב-Profitly
- בניית React frontend עם WhatsApp Web style (split pane)
- רשימת שיחות 35% ימין + חלון צ'אט 65% שמאל
- Avatar צבעוני לפי שם, date separators, skeleton loaders
- Optimistic UI לשליחת הודעות (pending/sent/failed)
- עיצוב בסגנון Profitly (ירוק #006d43)
- Responsive למובייל

### שילוב ב-Sidebar
- הוספת כפתור "הודעות" עם אייקון MessageCircle לכל תפקידי המשתמשים

## 📁 קבצים שהשתנו:

### קבצים חדשים ב-apps/web:
- `apps/web/lib/messages-api.ts` — API client לשרת ההודעות (פורט 3500)
- `apps/web/app/messages/page.tsx` — עמוד הודעות מלא (WhatsApp Web layout)
- `apps/web/app/messages/[id]/page.tsx` — redirect לעמוד הראשי
- `apps/web/components/messages/MsgAvatar.tsx` — avatar עם צבע לפי שם
- `apps/web/components/messages/MsgBubble.tsx` — בועת הודעה (לקוח/חנות)
- `apps/web/components/messages/MsgConversationItem.tsx` — שורת שיחה
- `apps/web/components/messages/MsgDateSeparator.tsx` — הפרדת תאריכים
- `apps/web/components/messages/MsgSkeleton.tsx` — skeleton loader

### קבצים ששונו ב-apps/web:
- `apps/web/components/layout/Sidebar.tsx` — הוספת "הודעות" לכל nav lists

### מערכת עצמאית חדשה `הודעות/` (44 קבצים):
- `package.json`, `tsconfig.json`, `docker-compose.yml`, `.env.example`
- `src/index.ts` — entry point
- `src/config/index.ts`, `src/utils/logger.ts`, `src/utils/hash.ts`
- `src/db/connection.ts`, `src/db/migrations/001_initial.sql`
- `src/adspower/controller.ts`
- `src/browser/humanBehavior.ts`, `etsyScraper.ts`, `etsySender.ts`
- `src/email/listener.ts`, `src/email/parser.ts`
- `src/stores/resolver.ts`
- `src/queue/setup.ts`, workers: `syncConversation.ts`, `initialSync.ts`, `sendReply.ts`
- `src/sync/engine.ts`
- `src/api/server.ts`, routes: `stores.ts`, `conversations.ts`, `messages.ts`, `replies.ts`
- `scripts/seed-stores.ts` (24 חנויות), `scripts/inspect-selectors.ts`
- `web/` — React frontend עצמאי (פורט 3501)

## 🔗 חיבורים/אינטגרציות:
- מערכת ההודעות מאזינה לפורט **3500** (API) ו-**3501** (Frontend)
- Profitly מתחבר למערכת ההודעות דרך `NEXT_PUBLIC_MESSAGES_API_URL` (ברירת מחדל: `http://localhost:3500`)
- AdsPower Local API: `http://local.adspower.net:50325`
- Gmail IMAP IDLE לקבלת התראות Etsy
- Socket.IO לעדכונים בזמן אמת

## ⏳ מה נשאר לעשות:
- [ ] הפעלת שרת ההודעות: `cd הודעות && docker-compose up -d && npm install && npm run dev`
- [ ] זיהוי סלקטורים אמיתיים של Etsy: `npx tsx scripts/inspect-selectors.ts 1`
- [ ] עדכון סלקטורים ב-`src/browser/etsyScraper.ts` ו-`src/browser/etsySender.ts`
- [ ] הפעלת שרת VPS + העברת תיקיית `הודעות/` לשרת
- [ ] הגדרת `NEXT_PUBLIC_MESSAGES_API_URL` לכתובת ה-VPS
- [ ] סנכרון ראשוני לכל 24 החנויות
- [ ] Analytics dashboard מלא
- [ ] Celery Beat task לסנכרון לדג'ר אוטומטי כל שעה

## 📝 הערות חשובות:
- הסלקטורים ב-etsyScraper/etsySender הם **PLACEHOLDERS** — חייבים להריץ inspect-selectors.ts לפני שהמערכת עובדת
- Docker baked images — כל שינוי בקוד דורש `docker compose -p etsyauto up -d --build web`
- מערכת ההודעות רצה בנפרד מה-Docker הראשי של Profitly
- יתרת Etsy: ה-API מחזיר -₪9.38 (נכון), Etsy UI מציג -₪80.80 (כולל pending prolist)
