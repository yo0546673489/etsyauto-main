# apps/new-store/images/photoroom_processor.py
"""
עיבוד תמונות עם Photoroom API.
שלב 1: הסרת רקע ($0.02/תמונה)
שלב 2: יצירת רקע AI חדש ($0.10/תמונה)
סה"כ: $0.12 לתמונה × 5 = $0.60 למוצר
"""

import httpx
import asyncio
import base64
from config import PHOTOROOM_API_KEY, PHOTOROOM_BASE_URL, IMAGES_PER_PRODUCT


class PhotoroomProcessor:

    def __init__(self):
        self.headers = {
            "x-api-key": PHOTOROOM_API_KEY,
            "Content-Type": "application/json"
        }

    async def process(
        self,
        images: list,        # URLs של תמונות מקוריות
        style_prompt: str,   # סגנון הרקע מניתוח המתחרים
        count: int = 5
    ) -> list:
        """
        מעבד תמונות:
        1. מסיר רקע מכל תמונה
        2. מייצר רקע AI חדש

        Returns: רשימת URLs של תמונות מוכנות
        """

        results = []
        source_images = images[:count]  # מקסימום count תמונות

        # רקעים שונים לכל תמונה
        backgrounds = self._generate_background_prompts(style_prompt, count)

        for i, (img_url, bg_prompt) in enumerate(zip(source_images, backgrounds)):
            try:
                # שלב 1: הסרת רקע
                no_bg = await self._remove_background(img_url)

                # שלב 2: רקע AI חדש
                final_img = await self._add_background(no_bg, bg_prompt)

                results.append(final_img)

                # השהייה קטנה בין תמונות
                await asyncio.sleep(0.5)

            except Exception as e:
                print(f"שגיאה בתמונה {i}: {e}")
                continue

        return results

    async def _remove_background(self, image_url: str) -> bytes:
        """מסיר רקע — $0.02"""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PHOTOROOM_BASE_URL}/segment",
                headers=self.headers,
                json={"imageUrl": image_url}
            )
            resp.raise_for_status()
            return resp.content  # PNG ללא רקע

    async def _add_background(self, image_bytes: bytes, bg_prompt: str) -> str:
        """מייצר רקע AI — $0.10"""

        # מקודד לBase64
        img_b64 = base64.b64encode(image_bytes).decode()

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PHOTOROOM_BASE_URL}/edit",
                headers=self.headers,
                json={
                    "imageBase64": img_b64,
                    "background": {
                        "prompt": bg_prompt,
                        "scaling": "fill"
                    },
                    "outputSize": {
                        "width": 1024,
                        "height": 1024
                    }
                }
            )
            resp.raise_for_status()
            data = resp.json()
            return data["resultUrl"]

    def _generate_background_prompts(
        self, base_style: str, count: int
    ) -> list:
        """
        יוצר וריאציות של הרקע — כל תמונה קצת שונה.
        """
        variations = [
            f"{base_style}, hero shot",
            f"{base_style}, from above flat lay",
            f"{base_style}, close up detail",
            f"{base_style}, lifestyle setting",
            f"{base_style}, clean white studio"
        ]
        return variations[:count]
