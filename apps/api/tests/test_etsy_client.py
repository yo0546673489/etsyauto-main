import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.etsy_client import EtsyClient, EtsyAPIError, EtsyRateLimitError
from app.services.token_bucket import RateLimitExceeded
from app.services.circuit_breaker import CircuitOpenError


class _FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload


@pytest.fixture
def fake_db():
    db = MagicMock()
    shop = MagicMock()
    shop.id = 1
    shop.tenant_id = 10
    db.query.return_value.filter.return_value.first.return_value = shop
    return db


@pytest.fixture
def client(fake_db):
    with patch("app.services.etsy_client.get_redis_client", return_value=MagicMock()), patch(
        "app.services.etsy_client.get_circuit_breaker", return_value=MagicMock()
    ):
        c = EtsyClient(fake_db)
        c.token_manager = MagicMock()
        c.token_manager.get_token = AsyncMock(return_value="token-a")
        c.token_manager.refresh_token = AsyncMock(return_value="token-b")
        return c


@pytest.mark.asyncio
async def test_token_refresh_flag_used_on_token_get(client):
    with patch("app.services.etsy_client.etsy_token_bucket") as bucket, patch(
        "app.services.etsy_client.httpx.AsyncClient"
    ) as async_client:
        bucket.acquire_or_wait.return_value = None
        cm = async_client.return_value.__aenter__.return_value
        cm.request = AsyncMock(return_value=_FakeResponse(status_code=200, payload={"ok": True}))

        await client.get_shop_info(shop_id=1, etsy_shop_id="123")

        client.token_manager.get_token.assert_awaited_once_with(
            tenant_id=10, shop_id=1, provider="etsy", auto_refresh=True
        )


@pytest.mark.asyncio
async def test_401_forces_refresh_and_retries_once(client):
    with patch("app.services.etsy_client.etsy_token_bucket") as bucket, patch(
        "app.services.etsy_client.httpx.AsyncClient"
    ) as async_client:
        bucket.acquire_or_wait.return_value = None
        cm = async_client.return_value.__aenter__.return_value
        cm.request = AsyncMock(
            side_effect=[
                _FakeResponse(status_code=401, payload={"err": "expired"}, text="expired"),
                _FakeResponse(status_code=200, payload={"ok": True}),
            ]
        )

        data = await client.get_shop_info(shop_id=1, etsy_shop_id="123")
        assert data == {"ok": True}
        client.token_manager.refresh_token.assert_awaited_once_with(10, 1, "etsy")
        assert cm.request.await_count == 2


@pytest.mark.asyncio
async def test_rate_limit_from_token_bucket_raises_etsy_rate_limit_error(client):
    with patch("app.services.etsy_client.etsy_token_bucket") as bucket:
        bucket.acquire_or_wait.side_effect = RateLimitExceeded("limited")
        with pytest.raises(EtsyRateLimitError):
            await client.get_shop_info(shop_id=1, etsy_shop_id="123")


@pytest.mark.asyncio
async def test_circuit_breaker_open_raises(client):
    client.circuit_breaker.before_request.side_effect = CircuitOpenError("open", retry_after=5)
    with pytest.raises(CircuitOpenError):
        await client.get_shop_info(shop_id=1, etsy_shop_id="123")


@pytest.mark.asyncio
async def test_successful_request_returns_json(client):
    with patch("app.services.etsy_client.etsy_token_bucket") as bucket, patch(
        "app.services.etsy_client.httpx.AsyncClient"
    ) as async_client:
        bucket.acquire_or_wait.return_value = None
        cm = async_client.return_value.__aenter__.return_value
        cm.request = AsyncMock(return_value=_FakeResponse(status_code=200, payload={"hello": "world"}))
        data = await client.get_shop_info(shop_id=1, etsy_shop_id="123")
        assert data == {"hello": "world"}


@pytest.mark.asyncio
async def test_non_200_raises_etsy_api_error(client):
    with patch("app.services.etsy_client.etsy_token_bucket") as bucket, patch(
        "app.services.etsy_client.httpx.AsyncClient"
    ) as async_client:
        bucket.acquire_or_wait.return_value = None
        cm = async_client.return_value.__aenter__.return_value
        cm.request = AsyncMock(return_value=_FakeResponse(status_code=500, payload={"e": "x"}, text="boom"))
        with pytest.raises(EtsyAPIError):
            await client.get_shop_info(shop_id=1, etsy_shop_id="123")

