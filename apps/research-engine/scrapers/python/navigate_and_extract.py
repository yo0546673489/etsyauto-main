"""
Navigate to eRank in the running Chrome, wait for auth, then extract cookies.
"""
import asyncio, json, time, os, sys
sys.path.insert(0, ".")


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        print("Connecting to Chrome via CDP...")
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = browser.contexts[0]

        # Navigate to eRank members area
        page = await ctx.new_page()
        print("Navigating to eRank...")
        await page.goto("https://members.erank.com/keyword-tool", wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)

        url = page.url
        print(f"Final URL: {url}")
        if "login" in url or "plans" in url:
            print("NOT logged in! eRank session expired.")
            await browser.close()
            return

        print("Logged in to eRank!")
        cookies = await ctx.cookies(["https://members.erank.com", "https://erank.com"])
        print(f"eRank cookies: {len(cookies)}")
        for c in cookies:
            print(f"  {c['name']} = {str(c.get('value',''))[:50]}")

        SM = {"unspecified": "Unspecified", "lax": "Lax", "strict": "Strict",
              "none": "None", "no_restriction": "None"}

        out_cookies = []
        for c in cookies:
            ss = c.get("sameSite", "Lax")
            if isinstance(ss, str):
                ss = SM.get(ss.lower(), "Lax")
            exp = c.get("expires", -1)
            if exp == -1 or exp is None:
                exp = int(time.time()) + 86400 * 30
            out_cookies.append({
                "name": c["name"], "value": c.get("value", ""),
                "domain": c["domain"], "path": c.get("path", "/"),
                "expires": int(exp), "httpOnly": c.get("httpOnly", False),
                "secure": c.get("secure", False),
                "sameSite": ss if ss in ("Strict", "Lax", "None") else "Lax",
            })

        state = {
            "cookies": out_cookies,
            "origins": [{"origin": "https://members.erank.com", "localStorage": []}]
        }
        os.makedirs("sessions", exist_ok=True)
        with open("sessions/erank_session.json", "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        print(f"Saved erank_session.json ({os.path.getsize('sessions/erank_session.json'):,} bytes)")

        await page.close()
        await browser.close()
    print("Done!")


asyncio.run(main())
