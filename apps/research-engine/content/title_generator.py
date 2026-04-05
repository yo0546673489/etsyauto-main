# apps/new-store/content/title_generator.py
"""
יצירת כותרות לפי כללי המנטור:
- 10-14 מילים
- 110-140 תווים
- מילת מפתח חזקה ראשונה
- לא לחזור על אותה כותרת
"""

import json
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL

with open("mentor_rules.json", "r", encoding="utf-8") as f:
    MENTOR_RULES = json.load(f)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)

# שומר כותרות שכבר נוצרו — למניעת כפילויות
_generated_titles = set()


class TitleGenerator:

    async def generate(self, product_data: dict, sub_niche: dict) -> str:
        """
        מייצר כותרת אופטימלית למוצר.
        """
        rules = MENTOR_RULES["title"]

        prompt = f"""
צור כותרת מושלמת למוצר Etsy.

## כללי המנטור (חובה):
- אורך: {rules['ideal_chars_min']}-{rules['ideal_chars_max']} תווים
- מילים: {rules['ideal_words_min']}-{rules['ideal_words_max']} מילים
- מילת המפתח החזקה חייבת להיות ראשונה
- באנגלית בלבד
- לא לכלול מחיר או "handmade" או "vintage"

## תת-נישה: {sub_niche['keyword']}

## פרטי מוצר:
{json.dumps(product_data, ensure_ascii=False)}

## כותרות שכבר נוצרו (לא לחזור עליהן):
{list(_generated_titles)[-10:]}

החזר רק את הכותרת, ללא הסברים.
"""

        response = model.generate_content(prompt)
        title = response.text.strip().strip('"')

        _generated_titles.add(title)
        return title
