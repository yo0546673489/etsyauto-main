"""
Redis Connection Management
Provides Redis client for rate limiting and caching
"""
from typing import Generator
import redis
from app.core.config import settings


# Global Redis client
_redis_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    """
    Get or create Redis client singleton.
    """
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )

    return _redis_client


def close_redis():
    """
    Close Redis connection (call on app shutdown).
    """
    global _redis_client
    if _redis_client is not None:
        _redis_client.close()
        _redis_client = None


def get_redis() -> Generator[redis.Redis, None, None]:
    """
    FastAPI dependency for Redis client.
    """
    client = get_redis_client()
    try:
        yield client
    finally:
        # Connection pooling handles cleanup
        pass


# Etsy token bucket singleton for per-shop rate limiting
from app.services.token_bucket import EtsyTokenBucket

etsy_token_bucket = EtsyTokenBucket(
    redis_client=get_redis_client(),
    capacity=settings.ETSY_RATE_LIMIT_CAPACITY,
    refill_per_sec=settings.ETSY_RATE_LIMIT_REFILL_PER_SEC,
)

