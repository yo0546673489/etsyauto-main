# apps/new-store/research/product_selector.py
"""
שלב 3: בחירת 30 מוצרים לחנות החדשה.
משתמש ב: Alura API + Gemini (ללא Etsy scraping).
"""

import json
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL, PRODUCTS_PER_STORE
from scrapers.alura_scraper import AluraScraper

with open("mentor_rules.json", "r", encoding="utf-8") as f:
    MENTOR_RULES = json.load(f)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


class ProductSelector:

    async def select_products(self, sub_niche: dict) -> list:
        """
        בוחר 30 מוצרים לחנות החדשה.

        Returns:
            [
                {
                    "title": "...",
                    "source_url": "...",
                    "source_images": [...],
                    "suggested_price": 80,
                    "listing_id": "..."
                },
                ...
            ]
        """
        alura = AluraScraper()

        try:
            await alura.start()
            keyword = sub_niche["keyword"]

            # שולף מוצרים מצליחים מהנישה
            alura_data = await alura.get_best_sellers(keyword)
            top_products = sorted(
                alura_data["products"],
                key=lambda x: x.get("monthly_sales", 0),
                reverse=True
            )[:20]

            # Gemini מגוון ויוצר 30 מוצרים
            selected = await self._select_with_gemini(top_products, sub_niche)
            return selected[:PRODUCTS_PER_STORE]

        finally:
            await alura.stop()

    async def _select_with_gemini(
        self, products: list, sub_niche: dict
    ) -> list:
        """Gemini בוחר 30 מוצרים מגוונים"""

        price_min = MENTOR_RULES['price_range']['recommended_min_ils']
        price_max = MENTOR_RULES['price_range']['recommended_max_ils']

        prompt = f"""
אתה מומחה Etsy. צור רשימה של 30 מוצרים מגוונים לחנות חדשה בנישה: "{sub_niche['keyword']}".

## נתוני מוצרים מובילים בנישה:
{json.dumps(products[:10], ensure_ascii=False, indent=2)}

## כללי הבחירה:
- גיוון מקסימלי — לא לחזור על אותו סוג מוצר
- מחיר מוצע: {price_min}-{price_max} ₪
- לכלול וריאציות (צבעים שונים, גדלים שונים)
- התמקד בנישה: {sub_niche['keyword']}

החזר JSON בלבד — מערך של 30 מוצרים:
[
  {{
    "listing_id": "generated_{{}}",
    "title": "כותרת המוצר באנגלית",
    "source_url": "https://www.etsy.com/search?q={sub_niche['keyword'].replace(' ', '+')}",
    "source_images": [],
    "suggested_price": 80,
    "variation_hint": "תיאור קצר של הוריאציה או הייחוד"
  }}
]

השתמש ב-listing_id בפורמט: "gen_1", "gen_2", וכו'.
"""

        response = model.generate_content(prompt)
        text = response.text.strip()

        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        products_list = json.loads(text)
        return products_list
