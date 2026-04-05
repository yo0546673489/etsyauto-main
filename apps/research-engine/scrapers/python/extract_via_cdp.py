"""
Extracts cookies from running Chrome via CDP (remote debugging port).
"""
import asyncio, json, time, os, sys
sys.path.insert(0, ".")

TARGETS = {
    "erank": {
        "domains": [".erank.com", "erank.com", "members.erank.com"],
        "out": "sessions/erank_session.json",
        "origin": "https://members.erank.com"
    },
    "etsy": {
        "domains": [".etsy.com", "etsy.com", "www.etsy.com"],
        "out": "sessions/etsy_session.json",
        "origin": "https://www.etsy.com"
    },
    "alura": {
        "domains": [".alura.io", "alura.io", "app.alura.io"],
        "out": "sessions/alura_session.json",
        "origin": "https://app.alura.io"
    },
}

SM = {-1: "Unspecified", 0: "Lax", 1: "Strict", 2: "None",
      "unspecified": "Unspecified", "lax": "Lax", "strict": "Strict", "none": "None",
      "no_restriction": "None"}


async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        print("Connecting to Chrome via CDP...")
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        print(f"Connected! Contexts: {len(browser.contexts)}")

        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        cookies = await ctx.cookies()
        print(f"Total cookies: {len(cookies)}")

        # Show sample domains
        domains_seen = set(c["domain"] for c in cookies)
        print("Domains with cookies:", sorted(domains_seen)[:20])

        os.makedirs("sessions", exist_ok=True)

        for name, cfg in TARGETS.items():
            filtered = []
            for c in cookies:
                d = c.get("domain", "")
                if any(d == dom or d.endswith(dom) for dom in cfg["domains"]):
                    filtered.append(c)

            print(f"\n{name}: {len(filtered)} cookies")
            for c in filtered[:8]:
                print(f"  {c['name']} = {str(c.get('value', ''))[:50]}")

            # Convert to Playwright storage_state format
            out_cookies = []
            for c in filtered:
                ss = c.get("sameSite", "Lax")
                if isinstance(ss, int):
                    ss = SM.get(ss, "Lax")
                elif isinstance(ss, str):
                    ss = SM.get(ss.lower(), ss)

                exp = c.get("expires", -1)
                if exp == -1 or exp is None:
                    exp = int(time.time()) + 86400 * 30

                out_cookies.append({
                    "name": c["name"],
                    "value": c.get("value", ""),
                    "domain": c["domain"],
                    "path": c.get("path", "/"),
                    "expires": int(exp),
                    "httpOnly": c.get("httpOnly", False),
                    "secure": c.get("secure", False),
                    "sameSite": ss if ss in ("Strict", "Lax", "None") else "Lax",
                })

            state = {
                "cookies": out_cookies,
                "origins": [{"origin": cfg["origin"], "localStorage": []}]
            }
            with open(cfg["out"], "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            size = os.path.getsize(cfg["out"])
            print(f"  Saved: {cfg['out']} ({size:,} bytes)")

        await browser.close()
    print("\nDone!")


asyncio.run(main())
