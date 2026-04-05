# apps/new-store/scrapers/etsy_scraper.py
"""
סריקת Etsy עם Playwright ישירות — ללא AdsPower.
נכנסים עם session שמור של חשבון Etsy.
"""

import asyncio
import random
import os
from playwright.async_api import async_playwright
from config import DELAY_BETWEEN_ETSY_SCRAPES, ETSY_SESSION_PATH, CHROMIUM_EXECUTABLE

ETSY_CATEGORIES = [
    "home decor", "kitchen dining", "bath beauty",
    "outdoor garden", "storage organization",
    "art collectibles", "craft supplies",
    "bags purses", "clothing accessories"
]

class EtsyScraper:

    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

    async def start(self):
        """פותח Chromium ישירות עם session שמור של Etsy"""
        self.playwright = await async_playwright().start()

        self.browser = await self.playwright.chromium.launch(
            headless=True,
            executable_path=CHROMIUM_EXECUTABLE,
            args=[
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        )

        self.context = await self.browser.new_context(
            storage_state=ETSY_SESSION_PATH if os.path.exists(ETSY_SESSION_PATH) else None,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800}
        )

        self.page = await self.context.new_page()

    async def stop(self):
        """שומר session וסוגר"""
        if self.context:
            os.makedirs("sessions", exist_ok=True)
            await self.context.storage_state(path=ETSY_SESSION_PATH)
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def _delay(self):
        """השהייה אנושית"""
        min_d, max_d = DELAY_BETWEEN_ETSY_SCRAPES
        await asyncio.sleep(random.uniform(min_d, max_d))

    async def search_niche(
        self,
        keyword: str,
        price_min: int,
        price_max: int,
        max_results: int = 48
    ) -> list:
        """
        מחפש ב-Etsy לפי keyword + טווח מחיר.
        מחזיר רשימת מוצרים עם: title, shop, price, sales_count
        """
        url = (
            f"https://www.etsy.com/search"
            f"?q={keyword.replace(' ', '+')}"
            f"&min={price_min}&max={price_max}"
            f"&explicit=1"           # Physical Items
            f"&order=most_relevant"
        )

        await self.page.goto(url, wait_until="domcontentloaded")
        await self._delay()

        # גולל לאט כמו בן אדם
        for _ in range(3):
            await self.page.evaluate("window.scrollBy(0, 600)")
            await asyncio.sleep(random.uniform(1, 2))

        products = await self.page.evaluate("""
            () => {
                const items = document.querySelectorAll('[data-listing-id]');
                return Array.from(items).slice(0, 48).map(item => ({
                    listing_id: item.dataset.listingId,
                    title: item.querySelector('h3')?.innerText || '',
                    price: item.querySelector('[data-currency-value]')?.dataset.currencyValue || '0',
                    shop_name: item.querySelector('.shop-name')?.innerText || '',
                    image_url: item.querySelector('img')?.src || ''
                }));
            }
        """)

        await self._delay()
        return products[:max_results]

    async def get_shop_info(self, shop_name: str) -> dict:
        """
        מחזיר פרטי חנות: כמה מכירות, מתי נפתחה.
        משתמש ב-Etsy API ולא scraping — יותר אמין וזול.
        """
        # ← זה יטופל ב-etsy_api.py
        pass

    async def get_shop_top_listings(self, shop_name: str) -> list:
        """
        שולף המוצרים הטובים של חנות.
        מוריד גם את תמונות המוצרים.
        """
        url = f"https://www.etsy.com/shop/{shop_name}"
        await self.page.goto(url, wait_until="domcontentloaded")
        await self._delay()

        listings = await self.page.evaluate("""
            () => {
                const items = document.querySelectorAll('[data-listing-id]');
                return Array.from(items).slice(0, 10).map(item => ({
                    listing_id: item.dataset.listingId,
                    title: item.querySelector('h3')?.innerText || '',
                    price: item.querySelector('[data-currency-value]')?.dataset.currencyValue || '0',
                    images: Array.from(item.querySelectorAll('img')).map(img => img.src)
                }));
            }
        """)

        return listings

    async def count_shops_on_page(self, keyword: str) -> int:
        """
        סופר כמה חנויות שונות מופיעות בעמוד ראשון.
        לפי כללי המנטור: מקסימום 15 אידיאלי, 20 נסבל.
        """
        url = f"https://www.etsy.com/search?q={keyword.replace(' ', '+')}"
        await self.page.goto(url, wait_until="domcontentloaded")
        await self._delay()

        shop_names = await self.page.evaluate("""
            () => {
                const shops = document.querySelectorAll('.shop-name-link');
                return [...new Set(Array.from(shops).map(s => s.innerText))];
            }
        """)

        return len(shop_names)
