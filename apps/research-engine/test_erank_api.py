import asyncio, sys, json
sys.path.insert(0, ".")
import httpx

with open("sessions/erank_session.json") as f:
    state = json.load(f)

cookies = {c["name"]: c["value"] for c in state["cookies"]}
xsrf = cookies.get("XSRF-TOKEN", "")

print(f"Cookies loaded: {len(cookies)}")
print(f"Has sid_er: {'sid_er' in cookies}")
print(f"Has XSRF: {bool(xsrf)}")

async def test():
    async with httpx.AsyncClient(
        cookies=cookies,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": xsrf,
            "Referer": "https://members.erank.com/keyword-tool",
        },
        timeout=15,
        follow_redirects=False
    ) as client:
        resp = await client.get(
            "https://members.erank.com/api/keywordlist/terms",
            params={"keywords": "ceramic bowl", "marketplace": "etsy", "country": "USA"}
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("value", [])
            if items:
                item = items[0]
                print(f"Keyword: {item.get('keyword')}")
                print(f"Searches: {item.get('avg_searches', {}).get('order_value')}")
                print(f"Competition: {item.get('competition', {}).get('order_value')}")
                print("API WORKS!")
            else:
                print(f"Empty response: {resp.text[:200]}")
        else:
            print(f"Response: {resp.text[:300]}")

asyncio.run(test())
