from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from prometheus_client import Counter, Histogram


etsy_token_bucket_allowed_total = Counter(
    "etsy_token_bucket_allowed_total",
    "Number of Etsy token bucket acquisitions allowed",
    labelnames=("shop_id",),
)

etsy_token_bucket_rejected_total = Counter(
    "etsy_token_bucket_rejected_total",
    "Number of Etsy token bucket acquisitions rejected",
    labelnames=("shop_id",),
)

etsy_token_bucket_wait_ms = Histogram(
    "etsy_token_bucket_wait_ms",
    "Time spent waiting for Etsy token bucket tokens (milliseconds)",
    labelnames=("shop_id",),
    buckets=(
        1,
        5,
        10,
        20,
        50,
        100,
        200,
        500,
        1000,
        2000,
        5000,
        10000,
        30000,
    ),
)


class RateLimitExceeded(Exception):
    """Raised when waiting for a token exceeds the configured max wait."""


@dataclass
class EtsyTokenBucket:
    redis_client: Any
    capacity: int
    refill_per_sec: float

    def __post_init__(self) -> None:
        # Load the Lua script and keep a reference to the registered script
        from importlib.resources import files

        lua_source = files(__package__).joinpath("redis_lua/token_bucket.lua").read_text()
        self._script = self.redis_client.register_script(lua_source)

    def _bucket_key(self, shop_id: int) -> str:
        return f"etsy:bucket:{shop_id}"

    def acquire(self, shop_id: int, tokens: int = 1) -> bool:
        """
        Attempt to acquire tokens without waiting.

        Returns True if allowed, False if rate limited.
        """
        now_ms = int(time.time() * 1000)
        key = self._bucket_key(shop_id)

        allowed, wait_ms = self._script(
            keys=[key],
            args=[
                str(self.capacity),
                str(self.refill_per_sec),
                str(now_ms),
                str(tokens),
            ],
        )

        shop_label = str(shop_id)
        if int(allowed) == 1:
            etsy_token_bucket_allowed_total.labels(shop_id=shop_label).inc()
            return True

        etsy_token_bucket_rejected_total.labels(shop_id=shop_label).inc()
        # Record the recommended wait time even for non-waiting acquisitions
        etsy_token_bucket_wait_ms.labels(shop_id=shop_label).observe(float(wait_ms))
        return False

    def acquire_or_wait(
        self,
        shop_id: int,
        tokens: int = 1,
        max_wait_ms: int = 30000,
    ) -> None:
        """
        Block (synchronously) until tokens are available or raise RateLimitExceeded.
        """
        shop_label = str(shop_id)
        start_ms = int(time.time() * 1000)

        while True:
            now_ms = int(time.time() * 1000)
            elapsed_ms = now_ms - start_ms
            if elapsed_ms >= max_wait_ms:
                raise RateLimitExceeded(
                    f"Etsy rate limit exceeded for shop {shop_id} after waiting {elapsed_ms} ms"
                )

            key = self._bucket_key(shop_id)
            allowed, wait_ms = self._script(
                keys=[key],
                args=[
                    str(self.capacity),
                    str(self.refill_per_sec),
                    str(now_ms),
                    str(tokens),
                ],
            )

            if int(allowed) == 1:
                etsy_token_bucket_allowed_total.labels(shop_id=shop_label).inc()
                total_wait_ms = int(time.time() * 1000) - start_ms
                etsy_token_bucket_wait_ms.labels(shop_id=shop_label).observe(
                    float(total_wait_ms)
                )
                return

            etsy_token_bucket_rejected_total.labels(shop_id=shop_label).inc()

            sleep_ms = int(wait_ms)
            if sleep_ms <= 0:
                # Minimal backoff to avoid tight spinning
                sleep_ms = 5

            # Ensure we never sleep beyond the remaining budget
            remaining_ms = max_wait_ms - elapsed_ms
            if sleep_ms > remaining_ms:
                sleep_ms = remaining_ms

            time.sleep(sleep_ms / 1000.0)

