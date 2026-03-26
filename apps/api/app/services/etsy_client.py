""" 
Etsy API Client with OAuth 2.0 and Rate Limiting
Handles all interactions with Etsy Open API v3
"""
import httpx
import json
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import redis
from app.core.config import settings
from app.models.tenancy import Shop, OAuthToken
from app.services.token_manager import TokenManager, TokenRefreshError
from app.services.circuit_breaker import get_circuit_breaker, CircuitOpenError
from app.services.token_bucket import RateLimitExceeded
from app.core.redis import get_redis_client, etsy_token_bucket
import logging

logger = logging.getLogger(__name__)


class EtsyAPIError(Exception):
    """Base exception for Etsy API errors"""
    def __init__(self, message: str, status_code: Optional[int] = None, response: Optional[Dict] = None, headers: Optional[Dict] = None):
        self.message = message
        self.status_code = status_code
        self.response = response
        self.headers = headers or {}
        super().__init__(self.message)


class EtsyRateLimitError(EtsyAPIError):
    """Raised when rate limit is exceeded"""
    pass


class EtsyClient:
    """
    Etsy Open API v3 Client with automatic token refresh, rate limiting, and retry logic.
    """

    def __init__(self, db: Session):
        self.db = db
        self.base_url = settings.ETSY_API_BASE_URL
        self.client_id = settings.ETSY_CLIENT_ID
        self.client_secret = settings.ETSY_CLIENT_SECRET

        # Initialize token manager
        redis_client = get_redis_client()
        self.token_manager = TokenManager(db, redis_client)

        # Initialize circuit breaker
        self.circuit_breaker = get_circuit_breaker()

    def _mark_shop_revoked(self, shop_id: int) -> None:
        """Mark a shop as revoked when its OAuth token is permanently invalid."""
        try:
            shop = self.db.query(Shop).filter(Shop.id == shop_id).first()
            if shop and shop.status != "revoked":
                shop.status = "revoked"
                self.db.commit()
                logger.warning(f"Shop {shop_id} ({shop.display_name}) marked as revoked — token refresh permanently failed")
                # Notify tenant admins
                try:
                    from app.services.notification_service import notify_tenant_admins
                    from app.models.notifications import NotificationType
                    notify_tenant_admins(
                        db=self.db,
                        tenant_id=shop.tenant_id,
                        notification_type=NotificationType.ERROR,
                        title=f"Shop \"{shop.display_name}\" disconnected",
                        message="Etsy API access was revoked or the OAuth token expired permanently. Reconnect your shop from Settings to restore syncing.",
                        action_url="/settings?tab=shops",
                        action_label="Reconnect Shop",
                    )
                except Exception as notify_err:
                    logger.error(f"Failed to send revocation notification for shop {shop_id}: {notify_err}")
        except Exception as e:
            logger.error(f"Failed to mark shop {shop_id} as revoked: {e}")
            self.db.rollback()

    async def _get_access_token(self, shop_id: int, tenant_id: int) -> str:
        """
        Get valid access token for a shop, automatically refreshing if needed.
        
        Uses TokenManager for automatic refresh with single-flight pattern.
        
        Args:
            shop_id: Shop ID
            tenant_id: Tenant ID
        
        Returns:
            Valid access token
        
        Raises:
            EtsyAPIError: If token not found or refresh failed
        """
        try:
            token = await self.token_manager.get_token(
                tenant_id=tenant_id,
                shop_id=shop_id,
                provider='etsy',
                auto_refresh=True
            )
            
            if not token:
                raise EtsyAPIError("No valid OAuth token found. Please reconnect your shop.")
            
            return token
            
        except TokenRefreshError as e:
            logger.error(f"Token refresh failed for shop {shop_id}: {e}")
            self._mark_shop_revoked(shop_id)
            raise EtsyAPIError("Reconnect your Etsy shop to restore access.")
        except Exception as e:
            logger.error(f"Failed to get access token for shop {shop_id}: {e}")
            err_msg = str(e).lower()
            if "token" in err_msg or "reconnect" in err_msg or "401" in err_msg or "expired" in err_msg:
                self._mark_shop_revoked(shop_id)
                raise EtsyAPIError("Reconnect your Etsy shop to restore access.")
            raise EtsyAPIError(f"Token retrieval failed: {str(e)}")

    async def _make_request(
        self,
        shop_id: int,
        method: str,
        endpoint: str,
        retry_on_401: bool = True,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make rate-limited request to Etsy API with automatic token refresh on 401.

        Args:
            shop_id: Shop ID for rate limiting
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            retry_on_401: Retry request after refreshing token on 401 (default: True)
            **kwargs: Additional arguments for httpx request

        Returns:
            dict: API response JSON
        """
        # Circuit breaker check — reject early if circuit is open
        self.circuit_breaker.before_request(shop_id)

        # Get shop to retrieve tenant_id
        shop = self.db.query(Shop).filter(Shop.id == shop_id).first()
        if not shop:
            raise EtsyAPIError("Shop not found")
        
        tenant_id = shop.tenant_id

        # Per-shop Redis token bucket (synchronous, blocks until allowed or raises)
        try:
            etsy_token_bucket.acquire_or_wait(shop_id=shop_id)
        except RateLimitExceeded as exc:
            raise EtsyRateLimitError(str(exc), status_code=429) from exc


        # Get access token (automatically refreshes if expired)
        access_token = await self._get_access_token(shop_id, tenant_id)

        # Make request
        headers = kwargs.pop("headers", {})
        headers["x-api-key"] = f"{self.client_id}:{self.client_secret}" if self.client_secret else self.client_id
        headers["Authorization"] = f"Bearer {access_token}"

        url = f"{self.base_url}{endpoint}"
        timeout = httpx.Timeout(30.0, connect=15.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                **kwargs
            )

            # Handle 401 - token might have expired between check and request
            if response.status_code == 401 and retry_on_401:
                logger.warning(f"Got 401 from Etsy API, forcing token refresh for shop {shop_id}")
                
                # Force token refresh
                try:
                    new_token = await self.token_manager.refresh_token(tenant_id, shop_id, 'etsy')
                    
                    # Retry request with new token
                    headers["Authorization"] = f"Bearer {new_token}"
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        **kwargs
                    )
                    
                    if response.status_code == 401:
                        # Still 401 after refresh - token is invalid
                        raise EtsyAPIError(
                            "Authentication failed. Please reconnect your Etsy shop.",
                            status_code=401
                        )
                        
                except Exception as e:
                    logger.error(f"Token refresh after 401 failed: {e}")
                    raise EtsyAPIError(
                        "Authentication failed. Please reconnect your Etsy shop.",
                        status_code=401
                    )

            if response.status_code == 429:
                self.circuit_breaker.record_failure(shop_id, 429)
                raise EtsyRateLimitError("Etsy API rate limit exceeded")

            if response.status_code >= 500:
                self.circuit_breaker.record_failure(shop_id, response.status_code)
                raise EtsyAPIError(
                    f"Etsy API error: {response.text}",
                    status_code=response.status_code,
                    response=response.json() if response.text else None
                )

            if response.status_code >= 400:
                # 4xx client errors — don't trip the breaker
                self.circuit_breaker.record_failure(shop_id, response.status_code)
                raise EtsyAPIError(
                    f"Etsy API error: {response.text}",
                    status_code=response.status_code,
                    response=response.json() if response.text else None
                )

            # Success — reset consecutive failure counter
            self.circuit_breaker.record_success(shop_id)
            return response.json()

    # ==================== Shop Methods ====================

    async def get_shop_info(self, shop_id: int, etsy_shop_id: str) -> Dict[str, Any]:
        """Get shop information from Etsy."""
        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}"
        )

    async def get_shipping_profiles(self, shop_id: int, etsy_shop_id: str) -> list:
        response = await self._make_request(
            shop_id=shop_id,
            method="GET",
            endpoint=f"/application/shops/{etsy_shop_id}/shipping-profiles",
        )
        return response.get("results", [])

    # ==================== Listing Methods ====================

    async def create_draft_listing(
        self,
        shop_id: int,
        etsy_shop_id: str,
        listing_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a draft listing on Etsy.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            listing_data: Listing details (title, description, price, etc.)

        Returns:
            dict: Created listing data
        """
        logger.info(
            f"[create_draft_listing] Payload for shop {etsy_shop_id}: "
            f"{json.dumps(listing_data, default=str)}"
        )
        return await self._make_request(
            shop_id,
            "POST",
            f"/application/shops/{etsy_shop_id}/listings",
            json=listing_data
        )

    async def get_shop_listings(
        self,
        shop_id: int,
        etsy_shop_id: str,
        limit: int = 25,
        offset: int = 0,
        state: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get listings for a shop with pagination.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            limit: Number of listings to return (max 100)
            offset: Pagination offset
            state: Optional listing state (active, draft, inactive, expired, sold_out)

        Returns:
            dict: Listing data with results array and count
        """
        params = {
            "limit": min(limit, 100),
            "offset": offset,
        }
        if state:
            params["state"] = state

        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/listings",
            params=params
        )

    async def update_listing(
        self,
        shop_id: int,
        listing_id: str,
        listing_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update an existing listing."""
        return await self._make_request(
            shop_id,
            "PUT",
            f"/application/listings/{listing_id}",
            json=listing_data
        )

    async def upload_listing_image(
        self,
        shop_id: int,
        etsy_shop_id: str,
        listing_id: str,
        image_data: bytes,
        rank: int = 1
    ) -> Dict[str, Any]:
        """
        Upload an image to a listing.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            listing_id: Listing ID
            image_data: Image file bytes
            rank: Image position (1 = primary)

        Returns:
            dict: Uploaded image data
        """
        files = {"image": image_data}
        data = {"rank": rank}

        return await self._make_request(
            shop_id,
            "POST",
            f"/application/shops/{etsy_shop_id}/listings/{listing_id}/images",
            files=files,
            data=data
        )

    async def publish_listing(
        self,
        shop_id: int,
        listing_id: str
    ) -> Dict[str, Any]:
        """
        Activate/publish a draft listing.
        """
        return await self._make_request(
            shop_id,
            "PUT",
            f"/application/listings/{listing_id}",
            json={"state": "active"}
        )

    async def get_listing(
        self,
        shop_id: int,
        listing_id: str
    ) -> Dict[str, Any]:
        """Get listing details."""
        return await self._make_request(
            shop_id,
            "GET",
            f"/application/listings/{listing_id}"
        )

    async def get_listing_images(
        self,
        shop_id: int,
        listing_id: str,
        limit: int = 10,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get listing images.
        """
        params = {
            "limit": min(limit, 100),
            "offset": offset,
        }

        return await self._make_request(
            shop_id,
            "GET",
            f"/application/listings/{listing_id}/images",
            params=params
        )

    async def delete_listing(
        self,
        shop_id: int,
        listing_id: str
    ) -> None:
        """Delete a listing."""
        await self._make_request(
            shop_id,
            "DELETE",
            f"/application/listings/{listing_id}"
        )

    # ==================== Transaction/Order Methods ====================

    async def get_shop_receipts(
        self,
        shop_id: int,
        etsy_shop_id: str,
        limit: int = 25,
        offset: int = 0,
        min_created: Optional[int] = None,
        max_created: Optional[int] = None,
        min_last_modified: Optional[int] = None,
        max_last_modified: Optional[int] = None,
        was_paid: Optional[bool] = None,
        was_shipped: Optional[bool] = None,
        include_transactions: bool = True
    ) -> Dict[str, Any]:
        """
        Get shop receipts (orders) with filtering and pagination.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            limit: Number of receipts to return (max 100)
            offset: Pagination offset
            min_created: Minimum created timestamp (Unix epoch)
            max_created: Maximum created timestamp (Unix epoch)
            min_last_modified: Minimum last modified timestamp (Unix epoch)
            max_last_modified: Maximum last modified timestamp (Unix epoch)
            was_paid: Filter by payment status
            was_shipped: Filter by shipping status

        Returns:
            dict: Receipt data with results array and count
        """
        params = {
            "limit": min(limit, 100),  # Etsy max is 100
            "offset": offset,
        }
        if include_transactions:
            params["includes"] = "Transactions"
        
        # Add optional time filters
        if min_created is not None:
            params["min_created"] = min_created
        if max_created is not None:
            params["max_created"] = max_created
        if min_last_modified is not None:
            params["min_last_modified"] = min_last_modified
        if max_last_modified is not None:
            params["max_last_modified"] = max_last_modified
        if was_paid is not None:
            params["was_paid"] = str(was_paid).lower()
        if was_shipped is not None:
            params["was_shipped"] = str(was_shipped).lower()

        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/receipts",
            params=params
        )

    async def get_receipt(
        self,
        shop_id: int,
        etsy_shop_id: str,
        receipt_id: str
    ) -> Dict[str, Any]:
        """Get a specific receipt/order."""
        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/receipts/{receipt_id}"
        )

    async def create_receipt_shipment(
        self,
        shop_id: int,
        etsy_shop_id: str,
        receipt_id: str,
        tracking_code: str,
        carrier_name: Optional[str] = None,
        ship_date: Optional[int] = None,
        note: Optional[str] = None,
        send_bcc: bool = False,
    ) -> Dict[str, Any]:
        """
        Submit shipment tracking information for a receipt.

        Args:
            tracking_code: Tracking number
            carrier_name: Carrier name (optional)
            ship_date: Unix timestamp (seconds) for shipment date (optional)
            note: Optional note to buyer
            send_bcc: If true, sends a BCC email to the shop owner
        """
        payload: Dict[str, Any] = {
            "tracking_code": tracking_code,
            "send_bcc": send_bcc,
        }
        if carrier_name:
            payload["carrier_name"] = carrier_name
        if ship_date:
            payload["ship_date"] = ship_date
        if note:
            payload["note"] = note

        return await self._make_request(
            shop_id,
            "POST",
            f"/application/shops/{etsy_shop_id}/receipts/{receipt_id}/tracking",
            json=payload,
        )

    # ==================== Financial / Ledger Methods ====================

    async def get_shop_ledger_entries(
        self,
        shop_id: int,
        etsy_shop_id: str,
        limit: int = 100,
        offset: int = 0,
        min_created: Optional[int] = None,
        max_created: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get shop payment account ledger entries (chronological debits/credits).

        Each entry includes an amount (positive = credit, negative = debit)
        and a running balance.  Required scope: ``billing_r``.

        Args:
            shop_id: Internal shop ID (for rate-limiter / circuit-breaker)
            etsy_shop_id: Etsy shop ID
            limit: Results per page (max 100)
            offset: Pagination offset
            min_created: Minimum created timestamp (Unix epoch)
            max_created: Maximum created timestamp (Unix epoch)

        Returns:
            dict with ``results`` array and ``count``
        """
        params: Dict[str, Any] = {
            "limit": min(limit, 100),
            "offset": offset,
        }
        if min_created is not None:
            params["min_created"] = min_created
        if max_created is not None:
            params["max_created"] = max_created

        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/payment-account/ledger-entries",
            params=params,
        )

    async def get_payment_account(
        self,
        shop_id: int,
        etsy_shop_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get shop payment account (balance, available_for_payout, reserve).
        May not exist in Etsy API; returns None on 404/error.
        Required scope: billing_r or transactions_r.
        """
        try:
            data = await self._make_request(
                shop_id,
                "GET",
                f"/application/shops/{etsy_shop_id}/payment-account",
            )
            if isinstance(data, dict) and "results" in data:
                results = data.get("results", [])
                return results[0] if results else None
            return data if isinstance(data, dict) else None
        except EtsyAPIError as exc:
            if exc.status_code in (404, 400, 500):
                return None
            raise

    async def get_ledger_entry_payments(
        self,
        shop_id: int,
        etsy_shop_id: str,
        ledger_entry_ids: List[int],
    ) -> Dict[str, Any]:
        """
        Get payments for given ledger entry IDs (getPaymentAccountLedgerEntryPayments).

        Etsy returns payment details for ledger entries that reference payments.
        Required scope: ``transactions_r``.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            ledger_entry_ids: List of Etsy ledger entry IDs (entry_id)

        Returns:
            dict with ``results`` array and ``count``
        """
        if not ledger_entry_ids:
            return {"count": 0, "results": []}
        # Etsy expects comma-separated ledger_entry_ids
        ids_str = ",".join(str(i) for i in ledger_entry_ids)
        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/payment-account/ledger-entries/payments",
            params={"ledger_entry_ids": ids_str},
        )

    async def get_shop_payments(
        self,
        shop_id: int,
        etsy_shop_id: str,
        limit: int = 25,
        offset: int = 0,
        min_created: Optional[int] = None,
        max_created: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get shop-level payment records (getPayments).
        NOTE: Etsy's getPayments endpoint requires payment_ids and does NOT support
        min_created/max_created date filtering. Use get_shop_ledger_entries or
        get_ledger_entry_payments for date-range payment data.
        Required scope: transactions_r.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            limit: Results per page (max 25)
            offset: Pagination offset
            min_created: Minimum created timestamp (Unix epoch)
            max_created: Maximum created timestamp (Unix epoch)

        Returns:
            dict with ``results`` array and ``count``
        """
        params: Dict[str, Any] = {
            "limit": min(limit, 25),
            "offset": offset,
        }
        if min_created is not None:
            params["min_created"] = min_created
        if max_created is not None:
            params["max_created"] = max_created

        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/payments",
            params=params,
        )

    async def get_shop_stats(
        self,
        shop_id: int,
        etsy_shop_id: str,
        start_date: Optional[int] = None,
        end_date: Optional[int] = None,
        granularity: str = "day",
    ) -> Dict[str, Any]:
        """
        Get shop-level visit/stats data from Etsy (visits, orders, revenue).

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            start_date: Unix timestamp for start of range (defaults to 30 days ago)
            end_date: Unix timestamp for end of range (defaults to now)
            granularity: "day" or "week" or "month"

        Returns:
            dict with visit, order, revenue stats per period
        """
        from datetime import datetime, timezone, timedelta
        if end_date is None:
            end_date = int(datetime.now(timezone.utc).timestamp())
        if start_date is None:
            start_date = int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp())

        params = {
            "start_date": start_date,
            "end_date": end_date,
            "granularity": granularity,
        }
        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/stats",
            params=params,
        )

    async def get_payment_by_receipt(
        self,
        shop_id: int,
        etsy_shop_id: str,
        receipt_id: str,
    ) -> Dict[str, Any]:
        """
        Get payment details for a specific receipt/order.

        Returns the payment breakdown for a single order including
        gross, fees, net, posted, and adjusted amounts.

        Args:
            shop_id: Internal shop ID
            etsy_shop_id: Etsy shop ID
            receipt_id: Etsy receipt ID

        Returns:
            dict with payment detail fields
        """
        return await self._make_request(
            shop_id,
            "GET",
            f"/application/shops/{etsy_shop_id}/receipts/{receipt_id}/payments",
        )

