"""
Unit tests for EtsyTokenBucket.
"""

import time
from typing import Dict, Tuple

import pytest

from app.services.token_bucket import EtsyTokenBucket, RateLimitExceeded


class FakeRedis:
    """Minimal fake Redis client implementing register_script()."""

    def __init__(self) -> None:
        self.state: Dict[str, Tuple[float, int]] = {}

    def register_script(self, _lua_source: str):
        def _script(*, keys, args):
            key = keys[0]
            capacity = float(args[0])
            refill_per_sec = float(args[1])
            now_ms = int(args[2])
            tokens_requested = float(args[3])

            tokens, last_refill_ms = self.state.get(key, (capacity, now_ms))

            if now_ms > last_refill_ms:
                elapsed_ms = now_ms - last_refill_ms
                tokens = min(capacity, tokens + (elapsed_ms / 1000.0) * refill_per_sec)
                last_refill_ms = now_ms

            if tokens >= tokens_requested:
                tokens -= tokens_requested
                self.state[key] = (tokens, last_refill_ms)
                return [1, 0]

            deficit = tokens_requested - tokens
            wait_ms = int((deficit / refill_per_sec) * 1000) if refill_per_sec > 0 else 30000
            self.state[key] = (tokens, last_refill_ms)
            return [0, wait_ms]

        return _script


def test_acquire_returns_true_when_tokens_available():
    bucket = EtsyTokenBucket(redis_client=FakeRedis(), capacity=2, refill_per_sec=1.0)
    assert bucket.acquire(shop_id=1, tokens=1) is True


def test_acquire_returns_false_when_bucket_empty():
    bucket = EtsyTokenBucket(redis_client=FakeRedis(), capacity=1, refill_per_sec=0.0)
    assert bucket.acquire(shop_id=1, tokens=1) is True
    assert bucket.acquire(shop_id=1, tokens=1) is False


def test_acquire_or_wait_blocks_then_succeeds():
    bucket = EtsyTokenBucket(redis_client=FakeRedis(), capacity=1, refill_per_sec=20.0)
    assert bucket.acquire(shop_id=1, tokens=1) is True  # empty bucket

    start = time.time()
    bucket.acquire_or_wait(shop_id=1, tokens=1, max_wait_ms=500)
    elapsed_ms = (time.time() - start) * 1000

    assert elapsed_ms >= 40


def test_acquire_or_wait_raises_when_max_wait_exceeded():
    bucket = EtsyTokenBucket(redis_client=FakeRedis(), capacity=1, refill_per_sec=0.0)
    assert bucket.acquire(shop_id=1, tokens=1) is True  # empty bucket

    with pytest.raises(RateLimitExceeded):
        bucket.acquire_or_wait(shop_id=1, tokens=1, max_wait_ms=10)

