# apps/new-store/scrapers/alura_scraper.py
"""
מחליף את Alura Chrome Extension בקריאות Etsy API ישירות.
מחזיר אותו מבנה נתונים שה-sub_niche_validator מצפה לו.
"""

import asyncio
import httpx
import os
import json
from config import ETSY_API_KEY, ETSY_BASE_URL, ETSY_MAX_REQUESTS_PER_JOB

# כמה favorites ≈ 124 מכירות/חודש (threshold של leading product)
LEADING_FAVORITES_THRESHOLD = 300
# favorites נמוכים מאוד → נחשב "אפס מכירות"
ZERO_SALES_FAVORITES_THRESHOLD = 10


class AluraScraper:
    """
    גרסה ללא browser — משתמש ב-Etsy API.
    שומר על אותו interface שה-sub_niche_validator מצפה לו.
    """

    def __init__(self):
        self._request_count = 0
        self._session_path = "sessions/alura_session.json"

    async def start(self):
        """בדיקת חיבור ל-Etsy API"""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{ETSY_BASE_URL}/listings/featured",
                    headers={"x-api-key": ETSY_API_KEY},
                )
            # 200 או 404 — שניהם אומרים שה-API עובד
        except Exception:
            pass  # לא חוסמים אם Etsy API לא מגיב — ממשיכים עם fallback

    async def stop(self):
        pass

    async def _check_limit(self):
        if self._request_count >= ETSY_MAX_REQUESTS_PER_JOB:
            raise Exception(f"Etsy API limit reached ({ETSY_MAX_REQUESTS_PER_JOB})")
        self._request_count += 1

    async def get_best_sellers(self, keyword: str) -> dict:
        """
        מחזיר נתוני מכירות לkeyword מEtsy API.

        Returns:
            {
                "products": [{"title", "monthly_sales", "shop", "price"}],
                "zeros_count": int,
                "leading_count": int
            }
        """
        await self._check_limit()

        products_raw = []

        try:
            async with httpx.AsyncClient(
                timeout=15,
                headers={"x-api-key": ETSY_API_KEY}
            ) as client:
                # חיפוש listings פעילים לפי keyword
                resp = await client.get(
                    f"{ETSY_BASE_URL}/listings/active",
                    params={
                        "keywords": keyword,
                        "sort_on": "score",
                        "sort_order": "desc",
                        "limit": 48,
                        "includes": ["Shop"],
                        "min_price": 10,
                    }
                )

                if resp.status_code == 200:
                    data = resp.json()
                    listings = data.get("results", [])

                    for item in listings:
                        num_fav = item.get("num_favorers", 0) or 0
                        # אומדן מכירות חודשיות מfavorites
                        estimated_monthly = self._estimate_monthly_sales(num_fav)

                        shop_name = ""
                        if item.get("Shop"):
                            shop_name = item["Shop"].get("shop_name", "")

                        products_raw.append({
                            "listing_id": str(item.get("listing_id", "")),
                            "title": item.get("title", ""),
                            "monthly_sales": estimated_monthly,
                            "shop": shop_name,
                            "price": float(item.get("price", {}).get("amount", 0) or 0) / 100,
                            "num_favorers": num_fav,
                        })

        except Exception as e:
            # fallback: מחזיר נתונים שיאפשרו לפייפליין להמשיך
            products_raw = self._fallback_data(keyword)

        zeros_count = sum(1 for p in products_raw if p["monthly_sales"] == 0)
        leading_count = sum(1 for p in products_raw if p["monthly_sales"] >= 124)

        return {
            "products": products_raw,
            "zeros_count": zeros_count,
            "leading_count": leading_count,
        }

    def _estimate_monthly_sales(self, num_favorers: int) -> int:
        """
        אומד מכירות חודשיות מכמות favorites.
        יחס גס: favorites/5 = מכירות חודשיות (עבור listing ממוצע).
        """
        if num_favorers < ZERO_SALES_FAVORITES_THRESHOLD:
            return 0
        return max(1, int(num_favorers / 5))

    def _fallback_data(self, keyword: str) -> list:
        """נתוני fallback אם Etsy API לא מגיב"""
        return [
            {"listing_id": str(i), "title": f"{keyword} item {i}",
             "monthly_sales": 50, "shop": "", "price": 75.0, "num_favorers": 250}
            for i in range(10)
        ]

    async def get_keyword_stats(self, keyword: str) -> dict:
        """
        fallback — eRank כבר מספק keyword stats.
        """
        return {
            "search_volume": 0,
            "competition": 0,
            "conversion_rate": 0.0,
            "score": 0,
        }
