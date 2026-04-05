# apps/new-store/scrapers/erank_scraper.py
"""
eRank API — קריאת API ישירה עם cookies שמורים.
לא צריך Playwright — eRank חושף API מסודר.
קצב: 5-12 שניות בין בקשות.
"""

import asyncio
import random
import json
import os
import httpx
from config import DELAY_BETWEEN_ERANK_REQUESTS, ERANK_SESSION_PATH

ERANK_API_BASE = "https://members.erank.com"
ERANK_KEYWORD_ENDPOINT = "/api/keyword-tool/stats"


class ERankScraper:

    def __init__(self):
        self._cookies = {}
        self._xsrf = ""
        self._headers = {}

    async def start(self):
        """טוען session שמור"""
        session_file = ERANK_SESSION_PATH
        if not os.path.exists(session_file):
            raise Exception(
                "eRank session לא נמצא. "
                "הרץ את login_tools.py ידנית."
            )

        with open(session_file, "r", encoding="utf-8") as f:
            state = json.load(f)

        # חילוץ cookies
        self._cookies = {
            c["name"]: c["value"]
            for c in state.get("cookies", [])
        }

        # חילוץ XSRF
        xsrf_cookie = self._cookies.get("XSRF-TOKEN", "")
        # XSRF token מה-localStorage אם יש
        for origin in state.get("origins", []):
            for item in origin.get("localStorage", []):
                if item.get("name") == "XSRF-TOKEN":
                    xsrf_cookie = item["value"]

        self._xsrf = xsrf_cookie
        self._headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/146.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": self._xsrf,
            "X-User-Agent": "erank-app/3.0",
            "Referer": "https://members.erank.com/keyword-tool",
        }

        # בדיקת חיבור
        await self._verify_logged_in()

    async def _verify_logged_in(self):
        """בודק שה-API עובד עם ה-session"""
        try:
            data = await self.get_keyword_data("handmade")
            if data and data.get("search_volume", 0) > 0:
                return  # עובד
        except Exception:
            pass

        raise Exception(
            "eRank session פג תוקף. "
            "הרץ את login_tools.py ידנית."
        )

    async def stop(self):
        """כלום לסגור — אין browser"""
        pass

    async def _delay(self):
        min_d, max_d = DELAY_BETWEEN_ERANK_REQUESTS
        await asyncio.sleep(random.uniform(min_d, max_d))

    async def get_keyword_data(self, keyword: str) -> dict:
        """
        מחזיר נתוני keyword מeRank API.

        Returns:
            {
                "search_volume": int,
                "competition": int,
                "trend": str,
            }
        """
        await self._delay()

        try:
            async with httpx.AsyncClient(
                cookies=self._cookies,
                headers=self._headers,
                timeout=20,
                follow_redirects=True
            ) as client:
                resp = await client.get(
                    f"{ERANK_API_BASE}{ERANK_KEYWORD_ENDPOINT}",
                    params={"keyword": keyword, "marketplace": "etsy", "country": "USA"}
                )

                if resp.status_code != 200:
                    return {"search_volume": 0, "competition": 0, "trend": "unknown"}

                data = resp.json()
                search_vol = data.get("avg_searches", {}).get("order_value", 0)
                competition = data.get("competition", {}).get("order_value", 0)

                # trend מהsearch_trend_bar_graph
                trend_data = data.get("search_trend_bar_graph", [])
                trend = "stable"
                if len(trend_data) >= 3:
                    recent_val = trend_data[-1].get("value", 0)
                    prev_val = trend_data[-3].get("value", 0)
                    if prev_val > 0:
                        if recent_val > prev_val * 1.2:
                            trend = "rising"
                        elif recent_val < prev_val * 0.8:
                            trend = "falling"

                return {
                    "search_volume": search_vol,
                    "competition": competition,
                    "trend": trend
                }

        except Exception as e:
            print(f"eRank API error for '{keyword}': {e}")
            return {"search_volume": 0, "competition": 0, "trend": "unknown"}

    async def get_shop_age(self, shop_name: str) -> dict:
        """
        מחזיר גיל חנות מeRank.
        fallback: Etsy API (עדיף) — זה משמש רק אם אין אלטרנטיבה.
        """
        await self._delay()

        try:
            async with httpx.AsyncClient(
                cookies=self._cookies,
                headers=self._headers,
                timeout=20,
                follow_redirects=True
            ) as client:
                resp = await client.get(
                    f"{ERANK_API_BASE}/api/shop-analyzer",
                    params={"shop": shop_name}
                )

                if resp.status_code != 200:
                    return {"age_days": 9999, "total_sales": 0, "is_young": False}

                data = resp.json()
                age_days = data.get("age_days", 9999)
                total_sales = data.get("total_sales", 0)

                return {
                    "age_days": age_days,
                    "total_sales": total_sales,
                    "is_young": age_days < 60
                }

        except Exception as e:
            print(f"eRank shop-age error for '{shop_name}': {e}")
            return {"age_days": 9999, "total_sales": 0, "is_young": False}
