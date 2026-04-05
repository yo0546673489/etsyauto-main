# apps/new-store/content/description_generator.py
"""
יצירת תיאורי מוצר לפי כללי המנטור.
תיאור מלא, משכנע, עם מילות מפתח.
"""

import json
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL

with open("mentor_rules.json", "r", encoding="utf-8") as f:
    MENTOR_RULES = json.load(f)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


class DescriptionGenerator:

    async def generate(self, product_data: dict, sub_niche: dict) -> str:
        """
        מייצר תיאור מוצר מלא ומשכנע.

        Returns: string — HTML או plain text
        """

        prompt = f"""
כתוב תיאור מוצר מושלם לEtsy.

## כללי:
- באנגלית בלבד
- 150-300 מילים
- פותח עם מילת המפתח הראשית
- כולל: תיאור המוצר, שימושים, גודל/חומרים, מה מקבלים בחבילה
- משפט אחרון: "Perfect gift for..." או "Ships within 3-5 business days"
- טון: חם, מקצועי, לא מכירתי מדי

## תת-נישה: {sub_niche['keyword']}

## פרטי מוצר:
{json.dumps(product_data, ensure_ascii=False)}

## כותרת המוצר:
{product_data.get('title', sub_niche['keyword'])}

החזר רק את התיאור, ללא הסברים.
"""

        response = model.generate_content(prompt)
        description = response.text.strip()

        return description
