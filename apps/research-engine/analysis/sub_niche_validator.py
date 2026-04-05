# apps/new-store/research/sub_niche_validator.py
"""
שלב 2: ולידציה תת-נישה לפי כללי המנטור.
משתמש ב: Alura API + eRank (ללא Etsy scraping — חסום בשרת).
"""

import json
from config import GEMINI_API_KEY, GEMINI_MODEL
from scrapers.alura_scraper import AluraScraper
from scrapers.erank_scraper import ERankScraper
import google.generativeai as genai

with open("mentor_rules.json", "r", encoding="utf-8") as f:
    MENTOR_RULES = json.load(f)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


class SubNicheValidator:

    async def validate_and_select(self, niches: list) -> dict:
        """
        בודק כל נישה לפי כללי המנטור ובוחר הטובה ביותר.
        """
        alura = AluraScraper()
        erank = ERankScraper()

        results = []

        try:
            await alura.start()
            await erank.start()

            for niche in niches:
                keyword = niche["keyword"]
                validation = await self._validate_niche(
                    keyword=keyword,
                    alura=alura,
                    erank=erank,
                )

                results.append({
                    **niche,
                    "validation": validation,
                    "passed": validation["all_checks_passed"]
                })

            # בוחר הנישה הטובה ביותר
            passed = [r for r in results if r["passed"]]

            if not passed:
                best = max(results, key=lambda x: x["score"])
            else:
                best = max(passed, key=lambda x: x["score"])

            # ניתוח סגנון ויזואלי עם Gemini (ללא Etsy scraping)
            best["visual_style"] = await self._analyze_visual_style(best["keyword"])

            return best

        finally:
            await alura.stop()
            await erank.stop()

    async def _validate_niche(self, keyword, alura, erank) -> dict:
        rules = MENTOR_RULES["niche_validation"]
        checks = {}

        # 1. תחרות מ-eRank (proxy לכמות חנויות)
        erank_data = await erank.get_keyword_data(keyword)
        competition = erank_data.get("competition", 0)
        # competition > 50000 ≈ יותר מ-15 חנויות שונות
        shops_estimate = min(30, max(1, competition // 5000))
        checks["shops_count"] = {
            "value": shops_estimate,
            "passed": shops_estimate <= rules["max_different_shops_first_page"],
            "ideal": shops_estimate <= 15
        }

        # 2. נתוני Alura — אפסים + מוצרים מובילים
        alura_data = await alura.get_best_sellers(keyword)
        checks["zeros"] = {
            "value": alura_data["zeros_count"],
            "passed": alura_data["zeros_count"] <= rules["max_zeros_on_page_alura"]
        }
        checks["leading_products"] = {
            "value": alura_data["leading_count"],
            "passed": alura_data["leading_count"] >= rules["min_leading_products_on_page"]
        }

        # 3. חנות צעירה מצליחה — מבוסס על eRank trend
        trend = erank_data.get("trend", "stable")
        search_vol = erank_data.get("search_volume", 0)
        young_shop_proxy = 1 if (trend == "rising" and search_vol > 500) else 0
        checks["young_shop_exists"] = {
            "value": young_shop_proxy,
            "passed": young_shop_proxy >= 1
        }

        all_passed = all(c["passed"] for c in checks.values())

        return {
            "checks": checks,
            "all_checks_passed": all_passed,
            "shops_on_first_page": shops_estimate,
            "zeros_on_page": alura_data["zeros_count"],
            "leading_products": alura_data["leading_count"]
        }

    async def _analyze_visual_style(self, keyword: str) -> str:
        """
        Gemini מציע סגנון ויזואלי לפי מילת המפתח.
        """
        prompt = f"""
אתה מומחה צילום מוצרים לEtsy.
עבור מוצר בנישה: "{keyword}"

תאר סגנון צילום אחד מתאים באנגלית — משפט אחד בלבד.
דוגמה: "product on marble surface, soft natural light, minimalist clean background"
החזר רק את המשפט.
"""
        response = model.generate_content(prompt)
        return response.text.strip().strip('"').strip("'")
