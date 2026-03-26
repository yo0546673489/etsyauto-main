"""
Circuit Breaker for Etsy API calls.

Three-state circuit breaker (closed / open / half-open) that tracks
consecutive failures per shop and prevents cascading API calls when
Etsy is returning errors.

    CLOSED  ──(N consecutive failures)──>  OPEN
    OPEN    ──(cooldown elapsed)──────>    HALF_OPEN
    HALF_OPEN ──(probe succeeds)──────>   CLOSED
    HALF_OPEN ──(probe fails)─────────>   OPEN
"""
import time
import logging
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when a request is rejected because the circuit is open."""

    def __init__(self, shop_id: int, retry_after: float):
        self.shop_id = shop_id
        self.retry_after = retry_after
        super().__init__(
            f"Circuit breaker OPEN for shop {shop_id}. "
            f"Retry after {retry_after:.0f}s."
        )


class _ShopCircuit:
    """Internal per-shop state."""

    __slots__ = (
        "state",
        "consecutive_failures",
        "last_failure_time",
        "last_success_time",
    )

    def __init__(self) -> None:
        self.state: CircuitState = CircuitState.CLOSED
        self.consecutive_failures: int = 0
        self.last_failure_time: float = 0.0
        self.last_success_time: float = 0.0


class CircuitBreaker:
    """
    In-process circuit breaker keyed by ``shop_id``.

    Parameters
    ----------
    failure_threshold : int
        Number of consecutive 429 / 5xx errors before the circuit opens.
    cooldown_seconds : float
        How long the circuit stays open before moving to half-open.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        cooldown_seconds: float = 60.0,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._circuits: dict[int, _ShopCircuit] = {}

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def _get(self, shop_id: int) -> _ShopCircuit:
        if shop_id not in self._circuits:
            self._circuits[shop_id] = _ShopCircuit()
        return self._circuits[shop_id]

    def state(self, shop_id: int) -> CircuitState:
        """Return current state for a shop."""
        return self._get(shop_id).state

    # ------------------------------------------------------------------
    # Call-site API
    # ------------------------------------------------------------------

    def before_request(self, shop_id: int) -> None:
        """
        Call **before** making an Etsy API request.
        Raises ``CircuitOpenError`` if the circuit is open and cooldown
        has not elapsed.  Transitions OPEN -> HALF_OPEN when cooldown
        expires (allowing one probe request through).
        """
        circuit = self._get(shop_id)

        if circuit.state == CircuitState.CLOSED:
            return  # all good

        if circuit.state == CircuitState.OPEN:
            elapsed = time.monotonic() - circuit.last_failure_time
            if elapsed >= self.cooldown_seconds:
                # Transition to half-open — let one probe through
                circuit.state = CircuitState.HALF_OPEN
                logger.info(
                    "Circuit breaker HALF_OPEN for shop %s (cooldown elapsed)",
                    shop_id,
                )
                return
            raise CircuitOpenError(
                shop_id=shop_id,
                retry_after=self.cooldown_seconds - elapsed,
            )

        # HALF_OPEN — allow the probe request
        return

    def record_success(self, shop_id: int) -> None:
        """Call after a **successful** Etsy API response (2xx)."""
        circuit = self._get(shop_id)
        circuit.consecutive_failures = 0
        circuit.last_success_time = time.monotonic()

        if circuit.state != CircuitState.CLOSED:
            logger.info(
                "Circuit breaker CLOSED for shop %s (success)",
                shop_id,
            )
            circuit.state = CircuitState.CLOSED

    def record_failure(self, shop_id: int, status_code: Optional[int] = None) -> None:
        """
        Call after a **failed** Etsy API response (429 or 5xx).

        Only 429 and 5xx bump the failure counter.  4xx client errors
        (other than 429) are NOT counted — they indicate bad input,
        not an Etsy outage.
        """
        if status_code is not None and 400 <= status_code < 500 and status_code != 429:
            # Client error — don't trip the breaker
            return

        circuit = self._get(shop_id)
        circuit.consecutive_failures += 1
        circuit.last_failure_time = time.monotonic()

        if circuit.state == CircuitState.HALF_OPEN:
            # Probe failed — go back to open
            circuit.state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker OPEN for shop %s (probe failed, status=%s)",
                shop_id,
                status_code,
            )
            return

        if circuit.consecutive_failures >= self.failure_threshold:
            circuit.state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker OPEN for shop %s (%d consecutive failures)",
                shop_id,
                circuit.consecutive_failures,
            )

    def reset(self, shop_id: int) -> None:
        """Manually reset the circuit (e.g. admin override)."""
        if shop_id in self._circuits:
            del self._circuits[shop_id]
            logger.info("Circuit breaker RESET for shop %s", shop_id)


# ── Module-level singleton ───────────────────────────────────────
_circuit_breaker: Optional[CircuitBreaker] = None


def get_circuit_breaker() -> CircuitBreaker:
    """Get or create the circuit breaker singleton."""
    global _circuit_breaker
    if _circuit_breaker is None:
        _circuit_breaker = CircuitBreaker()
    return _circuit_breaker
