import asyncio, sys, json
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")

async def test():
    from scrapers.etsy_scraper import EtsyScraper
    etsy = EtsyScraper()
    await etsy.start()
    products = await etsy.search_niche("home decor", 50, 150, max_results=5)
    print(f"Etsy products: {len(products)}")
    for p in products[:3]:
        print(f"  title={p.get('title','')[:60]}")
    await etsy.stop()
    return len(products)

result = asyncio.run(test())
print(f"Done: {result} products")
