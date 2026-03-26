# Cursor Prompt: Add Keyword Research Feature

## Context
We are adding a new feature to our existing Etsy automation platform
(FastAPI + Celery + PostgreSQL + Next.js).

Currently, when a user creates a product, it goes straight to AI generation
with no keyword data — the AI generates titles and tags blind.

We want to add a keyword research step that runs automatically before AI
generation, so the AI receives demand-validated keywords as structured
context. This improves listing quality without adding API costs.

The research uses two free data sources:
- Etsy public API (already integrated) — competition: listing counts + top tags
- Google Trends via pytrends — demand: relative search score 0–100

No paid APIs. No AI used in the research step itself.


---

## Stack additions
- `pytrends` (Google Trends, free)
- Etsy public API (existing)
- New DB table + Celery task + FastAPI endpoint

---

## DB Schema

```sql
CREATE TABLE keyword_research (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  product_id BIGINT REFERENCES products(id),
  seed_keyword TEXT NOT NULL,
  primary_keyword TEXT,
  longtail_keywords JSONB,
  top_tags JSONB,
  raw_scores JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_kw_research_product ON keyword_research(product_id);
```

---

## Service: `apps/api/app/services/keyword_research.py`

```python
from pytrends.request import TrendReq
import httpx, asyncio
from collections import Counter

ETSY_BASE = "https://openapi.etsy.com/v3/application"

async def research_keyword(seed: str, etsy_token: str) -> dict:
    loop = asyncio.get_event_loop()
    variants = generate_variants(seed)
    competition_data = await get_etsy_competition(seed, etsy_token)
    trend_score = await loop.run_in_executor(None, get_trend_score, seed)
    demand = trend_score
    competition = min(competition_data["listing_count"] / 1000, 100)
    opportunity = round(demand / max(competition, 1), 2)
    longtails = score_variants(variants, competition_data["top_tags"])
    return {
        "primary_keyword": seed,
        "longtail_keywords": longtails[:20],
        "top_tags": competition_data["top_tags"][:13],
        "raw_scores": {"demand": demand, "competition": round(competition, 2), "opportunity": opportunity}
    }

def generate_variants(seed: str) -> list[str]:
    modifiers = ["personalized","custom","handmade","unique","gift for",
                 "birthday gift","anniversary gift","for women","for men",
                 "minimalist","boho","vintage","aesthetic"]
    words = seed.lower().split()
    variants = [seed]
    for m in modifiers:
        variants.append(f"{m} {seed}")
        if len(words) > 1:
            variants.append(f"{words[0]} {m} {' '.join(words[1:])}")
    return list(set(variants))[:30]

async def get_etsy_competition(keyword: str, token: str) -> dict:
    params = {"keywords": keyword, "limit": 20, "sort_on": "score"}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{ETSY_BASE}/listings/active",
            headers={"x-api-key": token}, params=params, timeout=10)
    data = r.json()
    listings = data.get("results", [])
    all_tags = [tag for l in listings for tag in l.get("tags", [])]
    top_tags = [{"tag": t, "frequency": c} for t, c in Counter(all_tags).most_common(20)]
    return {"listing_count": data.get("count", 0), "top_tags": top_tags}

def get_trend_score(keyword: str) -> float:
    try:
        pt = TrendReq(hl="en-US", tz=360)
        pt.build_payload([keyword], timeframe="today 3-m")
        df = pt.interest_over_time()
        return float(df[keyword].mean()) if not df.empty else 30.0
    except Exception:
        return 30.0

def score_variants(variants: list, top_tags: list) -> list:
    tag_set = {t["tag"].lower() for t in top_tags}
    scored = [{"keyword": v, "score": len(set(v.lower().split()) & tag_set)*2 + len(v.split())} for v in variants]
    return sorted(scored, key=lambda x: -x["score"])
```

---

## Celery Task: `apps/api/app/worker/tasks/keyword_tasks.py`

```python
from app.worker.celery_app import app
from app.services.keyword_research import research_keyword
from app.db.models import KeywordResearch
from app.db.session import SessionLocal
import asyncio

@app.task(bind=True, max_retries=2)
def run_keyword_research(self, research_id: int, seed: str, etsy_token: str):
    db = SessionLocal()
    try:
        result = asyncio.run(research_keyword(seed, etsy_token))
        rec = db.query(KeywordResearch).get(research_id)
        rec.primary_keyword = result["primary_keyword"]
        rec.longtail_keywords = result["longtail_keywords"]
        rec.top_tags = result["top_tags"]
        rec.raw_scores = result["raw_scores"]
        rec.status = "done"
        db.commit()
    except Exception as exc:
        db.query(KeywordResearch).filter_by(id=research_id).update({"status": "failed"})
        db.commit()
        raise self.retry(exc=exc, countdown=10)
    finally:
        db.close()
```

---

## API Endpoints: add to `apps/api/app/api/endpoints/products.py`

```python
@router.post("/{product_id}/keyword-research", tags=["Products"])
async def start_keyword_research(
    product_id: int,
    body: KeywordResearchRequest,
    context: UserContext = Depends(require_permission(Permission.GENERATE)),
    db: Session = Depends(get_db),
):
    shop = db.query(Shop).filter(Shop.tenant_id == context.tenant_id).first()
    token = decrypt_token(shop.oauth_token.access_token)
    rec = KeywordResearch(tenant_id=context.tenant_id, product_id=product_id,
                          seed_keyword=body.seed_keyword, status="pending")
    db.add(rec); db.flush(); db.commit()
    run_keyword_research.delay(rec.id, body.seed_keyword, token)
    return {"research_id": rec.id, "status": "pending"}

@router.get("/{product_id}/keyword-research/{research_id}", tags=["Products"])
async def get_keyword_research(
    product_id: int, research_id: int,
    context: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db),
):
    rec = db.query(KeywordResearch).filter_by(
        id=research_id, product_id=product_id, tenant_id=context.tenant_id).first()
    if not rec: raise HTTPException(404)
    return rec
```

---

## AI Prompt Integration: update `apps/api/app/services/ai_generation.py`

```python
def build_prompt(product: dict, research: dict | None = None) -> str:
    base = f"Product: {product['title_raw']}\n"
    if research and research["status"] == "done":
        kws = [k["keyword"] for k in (research["longtail_keywords"] or [])[:10]]
        tags = [t["tag"] for t in (research["top_tags"] or [])[:13]]
        base += f"Primary keyword: {research['primary_keyword']}\n"
        base += f"Target keywords: {', '.join(kws)}\n"
        base += f"Common tags: {', '.join(tags)}\n"
    base += "Generate: title (max 140 chars), description (3 paragraphs), 13 tags."
    return base
```

---

## Frontend Flow

1. User types product idea → `POST /products/{id}/keyword-research`
2. Poll `GET /products/{id}/keyword-research/{id}` every 2s
3. On `status=done` → show scores + tag preview
4. User clicks Generate → AI uses keyword data automatically
5. Opportunity score badge: green=high, yellow=medium, red=low

---

## Install

Add to `apps/api/requirements.txt`:
```
pytrends>=4.9.0
```

```powershell
docker compose build --no-cache api worker && docker compose up -d api worker
```

## Cost: $0 (Etsy API + Google Trends both free)
