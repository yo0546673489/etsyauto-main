# apps/new-store/login_tools.py
"""
מריץ דפדפן נראה לעין — מתחברים ידנית לAlura ולeRank.
מריצים פעם אחת בלבד. Session נשמר לשימוש עתידי.
"""

import asyncio
import os
from playwright.async_api import async_playwright

TOOLS = [
    {
        "name": "Alura",
        "url": "https://www.alura.io/login",
        "session_path": "sessions/alura_session.json"
    },
    {
        "name": "eRank",
        "url": "https://erank.com/login",
        "session_path": "sessions/erank_session.json"
    },
    {
        "name": "Etsy",
        "url": "https://www.etsy.com/signin",
        "session_path": "sessions/etsy_session.json"
    }
]

async def login_tool(tool: dict):
    os.makedirs("sessions", exist_ok=True)

    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=False)
    context = await browser.new_context()
    page = await context.new_page()

    await page.goto(tool["url"])

    print(f"\n{'='*50}")
    print(f"היכנס ל-{tool['name']} ידנית בדפדפן שנפתח.")
    print("אחרי כניסה מוצלחת חזור לכאן ולחץ Enter.")
    print(f"{'='*50}")
    input("לחץ Enter אחרי הכניסה...")

    await context.storage_state(path=tool["session_path"])
    print(f"✅ Session של {tool['name']} נשמר")

    await browser.close()
    await playwright.stop()

async def main():
    for tool in TOOLS:
        await login_tool(tool)
    print("\n✅ כל הסessionים נשמרו בהצלחה!")

if __name__ == "__main__":
    asyncio.run(main())
