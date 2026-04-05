# apps/new-store/content/tags_generator.py
"""
יצירת 13 תגים לפי כללי המנטור.
משתמש בנתוני Alura ו-eRank שנאספו.
"""

import json
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL

with open("mentor_rules.json", "r", encoding="utf-8") as f:
    MENTOR_RULES = json.load(f)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


class TagsGenerator:

    async def generate(self, product_data: dict, sub_niche: dict) -> list:
        """
        מייצר 13 תגים מדויקים.

        Returns: list של 13 strings
        """
        rules = MENTOR_RULES["tags"]

        # תגים שנמצאו במחקר (אם יש)
        research_tags = sub_niche.get("validated_tags", [])

        prompt = f"""
צור בדיוק 13 תגים למוצר Etsy.

## כללי המנטור (חובה לכל תג):
- אורך מקסימלי: {rules['max_chars_per_tag']} תווים
- search volume מינימלי: {rules['min_search_volume']}/חודש
- competition מקסימלי: {rules['max_competition']}
- לא לחזור על מילים מהכותרת עצמה
- לשלב תגים קצרים (2-3 מילים) וארוכים (3-5 מילים)

## תת-נישה: {sub_niche['keyword']}

## תגים שנמצאו במחקר (עדיפות לאלה):
{json.dumps(research_tags, ensure_ascii=False)}

## פרטי מוצר:
{json.dumps(product_data, ensure_ascii=False)}

החזר JSON בלבד — מערך של בדיוק 13 strings באנגלית:
["tag1", "tag2", ..., "tag13"]
"""

        response = model.generate_content(prompt)
        text = response.text.strip()

        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        tags = json.loads(text)

        # ולידציה — חייב להיות בדיוק 13
        tags = [t[:20] for t in tags]  # חיתוך ל-20 תווים
        tags = tags[:13]               # מקסימום 13

        while len(tags) < 13:
            tags.append(sub_niche["keyword"].split()[-1])

        return tags
