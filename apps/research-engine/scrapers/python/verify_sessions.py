"""
בדיקת sessions — מפעיל Playwright ובודק שמחוברים לכל כלי.
"""
import asyncio
import sys
import os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, ".")
from playwright.async_api import async_playwright
from config import CHROMIUM_EXECUTABLE

async def check_alura():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=CHROMIUM_EXECUTABLE, args=['--no-sandbox'])
        ctx = await browser.new_context(
            storage_state="sessions/alura_session.json",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        )
        page = await ctx.new_page()
        await page.goto("https://www.alura.io/app/dashboard", wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(3)
        url = page.url
        title = await page.title()
        await browser.close()

        logged_in = "login" not in url and "signin" not in url
        return logged_in, url, title

async def check_erank():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=CHROMIUM_EXECUTABLE, args=['--no-sandbox'])
        ctx = await browser.new_context(
            storage_state="sessions/erank_session.json",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        )
        page = await ctx.new_page()
        await page.goto("https://erank.com/dashboard", wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(3)
        url = page.url
        title = await page.title()
        await browser.close()

        logged_in = "login" not in url.lower() and "signin" not in url.lower()
        return logged_in, url, title

async def check_etsy():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=CHROMIUM_EXECUTABLE, args=['--no-sandbox'])
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        )
        page = await ctx.new_page()
        await page.goto("https://www.etsy.com/search?q=ceramic+bowl", wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(2)
        url = page.url
        # בדיקה שהתוצאות טענו
        items = await page.query_selector_all('[data-listing-id]')
        await browser.close()
        return len(items) > 0, url, f"{len(items)} items found"

async def main():
    print("Checking sessions...\n")

    print("1. Alura...")
    try:
        ok, url, title = await check_alura()
        status = "LOGGED IN" if ok else "NOT LOGGED IN"
        print(f"   {status} | {url[:60]} | {title[:40]}")
    except Exception as e:
        print(f"   ERROR: {e}")

    print("2. eRank...")
    try:
        ok, url, title = await check_erank()
        status = "LOGGED IN" if ok else "NOT LOGGED IN"
        print(f"   {status} | {url[:60]} | {title[:40]}")
    except Exception as e:
        print(f"   ERROR: {e}")

    print("3. Etsy (no login needed)...")
    try:
        ok, url, title = await check_etsy()
        status = "WORKING" if ok else "BLOCKED"
        print(f"   {status} | {url[:60]} | {title}")
    except Exception as e:
        print(f"   ERROR: {e}")

asyncio.run(main())
