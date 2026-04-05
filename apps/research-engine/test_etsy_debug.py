import asyncio, sys
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")

async def test():
    from playwright.async_api import async_playwright
    from config import CHROMIUM_EXECUTABLE, ETSY_SESSION_PATH
    import os

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            executable_path=CHROMIUM_EXECUTABLE,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        ctx = await browser.new_context(
            storage_state=ETSY_SESSION_PATH if os.path.exists(ETSY_SESSION_PATH) else None,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await ctx.new_page()

        print("Navigating to Etsy...")
        url = "https://www.etsy.com/search?q=home+decor&min=50&max=150&explicit=1&order=most_relevant"
        await page.goto(url, wait_until="domcontentloaded")
        await asyncio.sleep(3)

        final_url = page.url
        print(f"Final URL: {final_url}")

        # Check page title
        title = await page.title()
        print(f"Title: {title}")

        # Count listing items
        count = await page.evaluate("() => document.querySelectorAll('[data-listing-id]').length")
        print(f"Listings found: {count}")

        # Check if blocked/captcha
        body_text = await page.evaluate("() => document.body?.innerText?.substring(0, 200)")
        print(f"Body preview: {body_text}")

        # Take screenshot for inspection
        await page.screenshot(path="etsy_test.png")
        print("Screenshot saved: etsy_test.png")

        await browser.close()

asyncio.run(test())
