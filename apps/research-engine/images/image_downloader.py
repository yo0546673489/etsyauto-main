# apps/new-store/images/image_downloader.py
"""
הורדת תמונות דרך Etsy API הציבורי.
קריאה אחת לחיפוש listing, קריאה שנייה לתמונות שלו.
"""

import httpx
import os
from typing import List

ETSY_AUTH = f"{os.environ.get('ETSY_API_KEY', '')}:{os.environ.get('ETSY_API_SECRET', '')}"
ETSY_BASE = "https://openapi.etsy.com/v3/application"


class ImageDownloader:

    async def download(self, source_url: str, title: str = "") -> List[str]:
        """
        מחזיר URLs של תמונות אמיתיות מ-Etsy לפי כותרת המוצר.
        2 קריאות API: חיפוש listing + שליפת תמונות.
        """
        keyword = title or self._extract_keyword(source_url)
        if not keyword:
            return []

        return await self._fetch_etsy_images(keyword)

    def _extract_keyword(self, url: str) -> str:
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            return params.get("q", [""])[0].replace("+", " ")
        except Exception:
            return ""

    async def _fetch_etsy_images(self, keyword: str, count: int = 5) -> List[str]:
        """
        1. מחפש listing לפי keyword
        2. שולף תמונות של ה-listing הראשון
        """
        headers = {"x-api-key": ETSY_AUTH}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # שלב 1: חיפוש listing
                search_resp = await client.get(
                    f"{ETSY_BASE}/listings/active",
                    params={"keywords": keyword, "limit": 1, "sort_on": "score"},
                    headers=headers
                )

                if search_resp.status_code != 200:
                    print(f"Etsy search error {search_resp.status_code} for: {keyword}")
                    return []

                results = search_resp.json().get("results", [])
                if not results:
                    return []

                listing_id = results[0]["listing_id"]

                # שלב 2: שליפת תמונות
                img_resp = await client.get(
                    f"{ETSY_BASE}/listings/{listing_id}/images",
                    headers=headers
                )

                if img_resp.status_code != 200:
                    return []

                images = img_resp.json().get("results", [])
                urls = []
                for img in images:
                    url = img.get("url_fullxfull") or img.get("url_570xN")
                    if url and url not in urls:
                        urls.append(url)
                    if len(urls) >= count:
                        break

                return urls

        except Exception as e:
            print(f"שגיאה בשליפת תמונות Etsy ל-{keyword}: {e}")
            return []
