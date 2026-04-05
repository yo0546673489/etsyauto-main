# apps/new-store/research/tag_researcher.py
"""
מחקר תגים עם eRank + Alura.
בונה בנק תגים של 30-40 תגים מאומתים לנישה.
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


class TagResearcher:

    async def build_tag_bank(self, sub_niche: dict) -> list:
        """
        בונה בנק תגים מאומת לנישה.

        Returns:
            [
                {
                    "tag": "ceramic plant pot",
                    "search_volume": 5200,
                    "competition": 18000,
                    "conversion_rate": 3.1,
                    "score": 74,
                    "source": "alura" | "erank"
                },
                ...
            ]  # מינימום 30, אידיאלי 40
        """
        alura = AluraScraper()
        erank = ERankScraper()

        tag_bank = []
        keyword = sub_niche["keyword"]

        try:
            await alura.start()
            await erank.start()

            # מילות מפתח ראשוניות
            seed_keywords = self._generate_seed_keywords(keyword)

            for kw in seed_keywords:
                # בדיקה ב-Alura
                try:
                    alura_stats = await alura.get_keyword_stats(kw)
                    if alura_stats and self._passes_alura_filter(alura_stats):
                        tag_bank.append({
                            "tag": kw[:20],  # מקסימום 20 תווים
                            "search_volume": alura_stats.get("search_volume", 0),
                            "competition": alura_stats.get("competition", 0),
                            "conversion_rate": alura_stats.get("conversion_rate", 0),
                            "score": alura_stats.get("score", 0),
                            "source": "alura"
                        })
                except Exception:
                    pass

                # בדיקה ב-eRank (אם Alura לא הספיק)
                if len(tag_bank) < MENTOR_RULES["tags"]["min_tags_in_bank"]:
                    try:
                        erank_data = await erank.get_keyword_data(kw)
                        if erank_data and self._passes_erank_filter(erank_data):
                            tag_bank.append({
                                "tag": kw[:20],
                                "search_volume": erank_data.get("search_volume", 0),
                                "competition": erank_data.get("competition", 0),
                                "conversion_rate": 0,
                                "score": 0,
                                "source": "erank"
                            })
                    except Exception:
                        pass

                if len(tag_bank) >= MENTOR_RULES["tags"]["ideal_tags_in_bank"]:
                    break

            # מיון לפי ציון
            tag_bank.sort(key=lambda x: (x["score"], x["search_volume"]), reverse=True)
            return tag_bank

        finally:
            await alura.stop()
            await erank.stop()

    def _generate_seed_keywords(self, base_keyword: str) -> list:
        """מייצר מילות מפתח ראשוניות לבדיקה"""
        words = base_keyword.split()
        seeds = [base_keyword]

        # וריאציות בסיסיות
        if len(words) >= 2:
            seeds.append(f"{words[-1]} {words[0]}")  # היפוך
            seeds.append(f"best {base_keyword}")
            seeds.append(f"{base_keyword} gift")
            seeds.append(f"unique {base_keyword}")
            seeds.append(f"{base_keyword} set")
            seeds.append(f"modern {base_keyword}")
            seeds.append(f"vintage {words[-1]}")
            seeds.append(f"minimalist {base_keyword}")

        return seeds[:15]  # מקסימום 15 מילות זרע

    def _passes_alura_filter(self, stats: dict) -> bool:
        rules = MENTOR_RULES["tags"]
        return (
            stats.get("search_volume", 0) >= rules["min_search_volume"] and
            stats.get("competition", 999999999) <= rules["max_competition"] and
            stats.get("score", 0) >= rules["min_alura_score"]
        )

    def _passes_erank_filter(self, data: dict) -> bool:
        rules = MENTOR_RULES["tags"]
        return (
            data.get("search_volume", 0) >= rules["min_search_volume"] and
            data.get("competition", 999999999) <= rules["max_competition"]
        )
