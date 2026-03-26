"""
Keyword Research Service
Runs keyword research using Etsy API (competition, top tags) and Google Trends (demand).
"""
import asyncio
import logging
from collections import Counter
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ETSY_BASE = "https://openapi.etsy.com/v3/application"


def _get_etsy_api_key() -> str:
    """Build Etsy API key header value (client_id or client_id:client_secret)."""
    if settings.ETSY_CLIENT_SECRET:
        return f"{settings.ETSY_CLIENT_ID}:{settings.ETSY_CLIENT_SECRET}"
    return settings.ETSY_CLIENT_ID


async def research_keyword(seed: str, etsy_token: str | None = None) -> dict[str, Any]:
    """
    Run keyword research for a seed keyword.
    Uses Etsy API for competition/top tags and Google Trends for demand.

    Args:
        seed: Seed keyword to research
        etsy_token: OAuth access token (optional; if not provided, uses API key only)

    Returns:
        Dict with primary_keyword, longtail_keywords, top_tags, raw_scores
    """
    variants = generate_variants(seed)
    competition_data = await get_etsy_competition(seed, etsy_token)
    trend_score = await _get_trend_score_async(seed)
    demand = trend_score
    competition = min(competition_data["listing_count"] / 1000, 100)
    opportunity = round(demand / max(competition, 1), 2)
    longtails = score_variants(variants, competition_data["top_tags"])
    return {
        "primary_keyword": seed,
        "longtail_keywords": longtails[:20],
        "top_tags": competition_data["top_tags"][:13],
        "raw_scores": {
            "demand": demand,
            "competition": round(competition, 2),
            "opportunity": opportunity,
        },
    }


def generate_variants(seed: str) -> list[str]:
    """Generate keyword variants with modifiers."""
    modifiers = [
        "personalized",
        "custom",
        "handmade",
        "unique",
        "gift for",
        "birthday gift",
        "anniversary gift",
        "for women",
        "for men",
        "minimalist",
        "boho",
        "vintage",
        "aesthetic",
    ]
    words = seed.lower().split()
    variants = [seed]
    for m in modifiers:
        variants.append(f"{m} {seed}")
        if len(words) > 1:
            variants.append(f"{words[0]} {m} {' '.join(words[1:])}")
    return list(set(variants))[:30]


async def get_etsy_competition(keyword: str, token: str | None = None) -> dict[str, Any]:
    """
    Fetch Etsy listing count and top tags for a keyword.

    Args:
        keyword: Search keyword
        token: OAuth access token (optional; uses API key if not provided)

    Returns:
        Dict with listing_count and top_tags
    """
    params = {"keywords": keyword, "limit": 20, "sort_on": "score"}
    headers = {"x-api-key": _get_etsy_api_key()}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{ETSY_BASE}/listings/active",
            headers=headers,
            params=params,
            timeout=10,
        )
    r.raise_for_status()
    data = r.json()
    listings = data.get("results", [])
    all_tags = [tag for listing in listings for tag in listing.get("tags", [])]
    top_tags = [{"tag": t, "frequency": c} for t, c in Counter(all_tags).most_common(20)]
    return {"listing_count": data.get("count", 0), "top_tags": top_tags}


def _get_trend_score(keyword: str) -> float:
    """Synchronous Google Trends score (0–100)."""
    try:
        from pytrends.request import TrendReq
        pt = TrendReq(hl="en-US", tz=360)
        pt.build_payload([keyword], timeframe="today 3-m")
        df = pt.interest_over_time()
        return float(df[keyword].mean()) if not df.empty else 30.0
    except Exception as e:
        logger.warning("Google Trends failed for %s: %s", keyword, e)
        return 30.0


async def _get_trend_score_async(keyword: str) -> float:
    """Run Google Trends in thread pool (blocking call)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _get_trend_score, keyword)


def score_variants(variants: list[str], top_tags: list[dict]) -> list[dict]:
    """Score variants by overlap with top tags."""
    tag_set = {t["tag"].lower() for t in top_tags}
    scored = [
        {
            "keyword": v,
            "score": len(set(v.lower().split()) & tag_set) * 2 + len(v.split()),
        }
        for v in variants
    ]
    return sorted(scored, key=lambda x: -x["score"])
