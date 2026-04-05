# Research Engine — מנוע מחקר Etsy

מודול מחקר אוטומטי שמוצא נישות, מאמת אותן ומייצר מוצרים מוכנים לאטסי.

## מבנה התיקייה

```
research-engine/
├── scrapers/
│   ├── js/          — סקרייפרי JavaScript: eRank, Alura, Koalanda
│   └── python/      — סקרייפרי Python + כלי session
├── analysis/        — מחקר ואימות נישות (Python + TypeScript)
├── content/         — יצירת כותרת, תגים ותיאור
├── images/          — הורדת תמונות מ-Etsy + עיבוד Photoroom
├── db/              — מודלי PostgreSQL ותשתית DB
├── utils/           — כלי עזר (Python + TypeScript)
├── config/          — קבצי הגדרות (categories, tools)
├── data/            — קבצי session (ללא מפתחות!)
├── dashboard/       — דשבורד ניטור
├── web_files/       — קבצי Next.js לפריסה בשרת
├── server.py        — שרת FastAPI ראשי (רץ על Venus port 8001)
├── start_server.ps1 — הרצת השרת על Windows
└── .env.example     — תבנית משתני סביבה
```

## הרצה

```powershell
# Windows (Venus)
.\start_server.ps1
```

## משתני סביבה נדרשים

ראה `.env.example` — העתק ל-`.env` ומלא את הערכים.

## חשוב

- **אסור** להעלות `.env` ל-GitHub
- **אסור** לגעת בשרת ישירות — ראה `DEPLOY_REQUEST.md` לפרוצדורת עדכון
- לפני עבודה: `git pull`
- אחרי עבודה: `git add . && git commit && git push`
