# apps/new-store/utils/etsy_api.py
"""
Etsy API helper — רק קריאות הכרחיות.
לא לבצע יותר מ-200 קריאות בJob אחד.
"""

import httpx
from config import ETSY_API_KEY, ETSY_BASE_URL, ETSY_MAX_REQUESTS_PER_JOB

class EtsyAPI:

    def __init__(self):
        self.headers = {"x-api-key": ETSY_API_KEY}
        self.request_count = 0

    def _check_limit(self):
        if self.request_count >= ETSY_MAX_REQUESTS_PER_JOB:
            raise Exception(f"הגענו למגבלת {ETSY_MAX_REQUESTS_PER_JOB} קריאות לJob")
        self.request_count += 1

    async def get_shop_info(self, shop_name: str) -> dict:
        """
        שולף פרטי חנות: מכירות כוללות, תאריך פתיחה.
        """
        self._check_limit()

        async with httpx.AsyncClient() as client:
            # קודם מוצא את ה-shop_id
            resp = await client.get(
                f"{ETSY_BASE_URL}/shops",
                params={"shop_name": shop_name},
                headers=self.headers
            )
            data = resp.json()

            if not data.get("results"):
                return {}

            shop = data["results"][0]
            return {
                "shop_id": shop["shop_id"],
                "shop_name": shop["shop_name"],
                "total_sales": shop.get("transaction_sold_count", 0),
                "created_date": shop.get("create_date", 0),
                "listing_count": shop.get("listing_active_count", 0)
            }

    async def get_listing_tags(self, listing_id: str) -> list:
        """
        שולף תגים של listing ספציפי.
        חשוב למחקר — ללמוד מהמתחרים.
        """
        self._check_limit()

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ETSY_BASE_URL}/listings/{listing_id}",
                headers=self.headers
            )
            data = resp.json()
            return data.get("tags", [])

    async def get_shop_top_listings(self, shop_id: int, limit: int = 10) -> list:
        """
        שולף מוצרים של חנות — מוגבל ל-10 כדי לחסוך quota.
        """
        self._check_limit()

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ETSY_BASE_URL}/shops/{shop_id}/listings/active",
                params={"limit": limit, "sort_on": "score"},
                headers=self.headers
            )
            data = resp.json()
            return data.get("results", [])
