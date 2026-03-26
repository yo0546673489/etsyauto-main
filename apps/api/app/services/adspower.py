"""
AdsPower client for managing browser profiles used in customer messaging automation.
"""

from typing import Any, Dict, List

import httpx
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class AdsPowerError(Exception):
    """Raised when an AdsPower API call fails."""

    pass


class AdsPowerService:
    """Simple AdsPower API service wrapper for health checks."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key or ""

    def check_status(self) -> bool:
        """
        Return True when AdsPower active endpoint is reachable and returns success.
        """
        if not self.base_url:
            raise AdsPowerError("ADSPOWER_BASE_URL is not configured")
        if not self.api_key:
            raise AdsPowerError("ADSPOWER_API_KEY is not configured")

        url = f"{self.base_url}/api/v1/browser/active"
        response = httpx.get(url, params={"api_key": self.api_key}, timeout=15.0)
        if response.status_code != 200:
            return False

        try:
            payload: Dict[str, Any] = response.json()
        except ValueError:
            return False

        return payload.get("code") in (0, "0", None)


def _get_base_url() -> str:
    base_url = (settings.ADSPOWER_BASE_URL or "").rstrip("/")
    if not base_url:
        raise AdsPowerError("ADSPOWER_BASE_URL is not configured")
    return base_url


def _get_api_key() -> str:
    api_key = settings.ADSPOWER_API_KEY or ""
    if not api_key:
        raise AdsPowerError("ADSPOWER_API_KEY is not configured")
    return api_key


def open_profile(profile_id: str) -> str:
    """
    Start an AdsPower browser profile and return the CDP WebSocket URL (data.ws.puppeteer).
    """
    base_url = _get_base_url()
    api_key = _get_api_key()

    url = f"{base_url}/api/v1/browser/start"
    params = {"user_id": profile_id, "api_key": api_key}

    logger.info("AdsPower: opening profile %s at %s", profile_id, url)

    try:
        response = httpx.get(url, params=params, timeout=30.0)
    except Exception as exc:
        logger.exception("AdsPower: request failed when opening profile %s", profile_id)
        raise AdsPowerError(f"Failed to open AdsPower profile {profile_id}: {exc}") from exc

    if response.status_code != 200:
        body_snippet = response.text[:500] if response.text else ""
        logger.error(
            "AdsPower: failed to open profile %s (status=%s, body=%s)",
            profile_id,
            response.status_code,
            body_snippet,
        )
        raise AdsPowerError(
            f"AdsPower start failed for profile {profile_id}: status {response.status_code}"
        )

    try:
        payload: Dict[str, Any] = response.json()
    except ValueError as exc:
        logger.error(
            "AdsPower: invalid JSON when opening profile %s: %s",
            profile_id,
            response.text[:500],
        )
        raise AdsPowerError(f"Invalid AdsPower response for profile {profile_id}") from exc

    if payload.get("code") not in (0, "0", None):
        logger.error(
            "AdsPower: non-success code when opening profile %s: %s",
            profile_id,
            payload,
        )
        raise AdsPowerError(
            f"AdsPower reported error when opening profile {profile_id}: {payload!r}"
        )

    try:
        ws_url = payload["data"]["ws"]["puppeteer"]
    except (KeyError, TypeError) as exc:
        logger.error(
            "AdsPower: missing data.ws.puppeteer in response when opening profile %s: %s",
            profile_id,
            payload,
        )
        raise AdsPowerError(
            f"AdsPower response missing CDP WebSocket URL for profile {profile_id}"
        ) from exc

    logger.info(
        "AdsPower: successfully opened profile %s and obtained WebSocket endpoint",
        profile_id,
    )
    return ws_url


def close_profile(profile_id: str) -> None:
    """
    Stop an AdsPower browser profile.

    This function never raises; it only logs failures because cleanup
    must not break the caller's flow.
    """
    try:
        base_url = _get_base_url()
        api_key = _get_api_key()
    except AdsPowerError as exc:
        # Log misconfiguration but do not raise during cleanup.
        logger.warning(
            "AdsPower: configuration error when closing profile %s: %s",
            profile_id,
            exc,
        )
        return

    url = f"{base_url}/api/v1/browser/stop"
    params = {"user_id": profile_id, "api_key": api_key}

    logger.info("AdsPower: closing profile %s at %s", profile_id, url)

    try:
        response = httpx.get(url, params=params, timeout=30.0)
    except Exception:
        logger.exception("AdsPower: request failed when closing profile %s", profile_id)
        return

    if response.status_code != 200:
        logger.warning(
            "AdsPower: non-200 status when closing profile %s: %s %s",
            profile_id,
            response.status_code,
            response.text[:500],
        )
        return

    logger.info("AdsPower: successfully closed profile %s", profile_id)


def profile_is_active(profile_id: str) -> bool:
    """
    Check if an AdsPower browser profile is currently active.
    """
    base_url = _get_base_url()
    api_key = _get_api_key()

    url = f"{base_url}/api/v1/browser/active"
    params = {"api_key": api_key}

    logger.info("AdsPower: checking active profiles at %s", url)

    try:
        response = httpx.get(url, params=params, timeout=30.0)
    except Exception as exc:
        logger.exception("AdsPower: request failed when checking profile %s active state", profile_id)
        raise AdsPowerError(f"Failed to query AdsPower active profiles: {exc}") from exc

    if response.status_code != 200:
        logger.error(
            "AdsPower: failed to query active profiles (status=%s, body=%s)",
            response.status_code,
            response.text[:500],
        )
        raise AdsPowerError(
            f"AdsPower active query failed: status {response.status_code}"
        )

    try:
        payload: Dict[str, Any] = response.json()
    except ValueError as exc:
        logger.error(
            "AdsPower: invalid JSON from active profiles endpoint: %s",
            response.text[:500],
        )
        raise AdsPowerError("Invalid AdsPower active profiles response") from exc

    # AdsPower typically returns {"data": {"list": [ { "user_id": "...", ... }, ... ]}, ...}
    data = payload.get("data") or {}
    active_list: List[Dict[str, Any]] = data.get("list") or []

    is_active = any(item.get("user_id") == profile_id for item in active_list)

    logger.info(
        "AdsPower: profile %s active = %s (count=%d)",
        profile_id,
        is_active,
        len(active_list),
    )

    return is_active

