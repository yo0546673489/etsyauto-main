# apps/new-store/research/niche_finder.py
"""
שלב 1: מחקר נישה כללית.
משתמש ב: Gemini (לרעיונות) + eRank (לוולידציה).
Etsy scraping הוסר — מחליפים ב-API approach.
"""

import json
import random
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL
from scrapers.erank_scraper import ERankScraper

# טוען כללי המנטור
with open("mentor_rules.json", "r", encoding="utf-8") as f:
    MENTOR_RULES = json.load(f)

# קטגוריות רנדומליות אם המשתמש לא בחר
DEFAULT_CATEGORIES = [
    "home decor", "kitchen dining", "bath beauty",
    "outdoor garden", "storage organization",
    "art prints", "candles", "plant pots",
    "desk accessories", "wall art"
]

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


class NicheFinder:

    async def find_niches(
        self,
        price_min: int,
        price_max: int,
        category: str = None
    ) -> list:
        """
        מחפש נישות פוטנציאליות.

        Returns:
            [
                {
                    "keyword": "japanese ceramic bowls",
                    "score": 85,
                    "reasons": ["ביקוש גבוה", "תחרות בינונית"]
                },
                ...
            ]
        """

        # אם לא נבחרה קטגוריה — רנדומלי
        if not category:
            category = random.choice(DEFAULT_CATEGORIES)

        erank = ERankScraper()

        try:
            await erank.start()

            # Gemini מציע מילות מפתח פוטנציאליות לקטגוריה
            candidate_keywords = await self._generate_keyword_ideas(
                category=category,
                price_min=price_min,
                price_max=price_max
            )

            # בדיקת כל keyword ב-eRank
            keyword_data = {}
            for kw in candidate_keywords[:12]:
                data = await erank.get_keyword_data(kw)
                keyword_data[kw] = data

            # Gemini מנתח ומדרג לפי נתוני eRank
            niches = await self._analyze_with_gemini(
                category=category,
                keyword_data=keyword_data,
                price_min=price_min,
                price_max=price_max
            )

            return niches

        finally:
            await erank.stop()

    async def _generate_keyword_ideas(
        self,
        category: str,
        price_min: int,
        price_max: int
    ) -> list:
        """Gemini מייצר רשימת keyword רעיונות לבדיקה ב-eRank"""
        prompt = f"""
אתה מומחה Etsy. צור 12 מילות מפתח ספציפיות לחיפוש ב-Etsy בקטגוריה: "{category}"
טווח מחיר: ${price_min}-${price_max}

כללים:
- מילות מפתח ספציפיות ובנישות (לא כלליות)
- באנגלית בלבד
- 2-4 מילים כל אחת
- מתאימות לחנות חדשה עם מוצרים מודפסים/מיוצרים

נישות אסורות: {json.dumps(MENTOR_RULES["forbidden_niches"])}

החזר JSON בלבד — מערך של מחרוזות:
["keyword1", "keyword2", ...]
"""
        response = model.generate_content(prompt)
        text = response.text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        keywords = json.loads(text)
        return [k.strip() for k in keywords if isinstance(k, str)]

    async def _analyze_with_gemini(
        self,
        category: str,
        keyword_data: dict,
        price_min: int,
        price_max: int
    ) -> list:
        """Gemini מנתח ובוחר נישות לפי כללי המנטור"""

        prompt = f"""
אתה מומחה מחקר נישות לEtsy. נתח את הנתונים הבאים ומצא 5 נישות פוטנציאליות.

## כללי המנטור (חובה לעקוב):
{json.dumps(MENTOR_RULES["niche_validation"], ensure_ascii=False, indent=2)}

## טווח מחיר: {price_min}-{price_max} ₪

## קטגוריה: {category}

## נתוני eRank למילות מפתח:
{json.dumps(keyword_data, ensure_ascii=False)}

## נישות שאסור לבחור:
{json.dumps(MENTOR_RULES["forbidden_niches"])}

החזר JSON בלבד — מערך של 5 נישות:
[
  {{
    "keyword": "מילת המפתח הראשית באנגלית",
    "name": "שם הנישה בעברית",
    "score": 85,
    "reasons": ["סיבה 1", "סיבה 2"],
    "search_volume_estimate": 5000,
    "competition_level": "low"
  }}
]
"""

        response = model.generate_content(prompt)

        # פרסור JSON
        text = response.text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text)
