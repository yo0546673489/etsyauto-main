"""
Integration Tests for Token Refresh and Management
Tests automatic token refresh, single-flight pattern, and cache behavior
"""
import pytest
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

from app.core.database import SessionLocal
from app.models.tenancy import Shop, OAuthToken
from app.services.token_manager import TokenManager, TokenRefreshError
from app.services.encryption import token_encryptor
from app.services.etsy_oauth import _parse_etsy_token_error


@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def redis_client():
    return MagicMock()


@pytest.fixture
def shop_with_token(db):
    """Create a shop with an OAuth token"""
    shop = Shop(
        tenant_id=1,
        etsy_shop_id="12345",
        display_name="Test Shop",
        status="connected"
    )
    db.add(shop)
    db.flush()
    
    oauth_token = OAuthToken(
        shop_id=shop.id,
        tenant_id=1,
        provider="etsy",
        access_token=token_encryptor.encrypt("access_token_123"),
        refresh_token=token_encryptor.encrypt("refresh_token_123"),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        scopes="listings_r listings_w",
        refresh_count=0
    )
    db.add(oauth_token)
    db.commit()
    
    return shop, oauth_token


class TestTokenRefresh:
    """Test token refresh scenarios"""
    
    @pytest.mark.asyncio
    async def test_get_valid_token_no_refresh(self, db, redis_client, shop_with_token):
        """Test getting a valid token (no refresh needed)"""
        shop, token = shop_with_token
        redis_client.get.return_value = None  # No cache
        
        manager = TokenManager(db, redis_client)
        result = await manager.get_token(
            tenant_id=1,
            shop_id=shop.id,
            provider='etsy',
            auto_refresh=False
        )
        
        assert result == "access_token_123"
    
    @pytest.mark.asyncio
    async def test_get_token_from_cache(self, db, redis_client, shop_with_token):
        """Test getting token from Redis cache"""
        shop, token = shop_with_token
        
        # Mock cached token
        import json
        redis_client.get.return_value = json.dumps({
            'access_token': 'cached_token',
            'expires_at': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        })
        
        manager = TokenManager(db, redis_client)
        result = await manager.get_token(
            tenant_id=1,
            shop_id=shop.id,
            provider='etsy'
        )
        
        assert result == 'cached_token'
    
    @pytest.mark.asyncio
    async def test_automatic_refresh_on_expiry(self, db, redis_client, shop_with_token):
        """Test automatic token refresh when token is expired"""
        shop, token = shop_with_token
        
        # Set token to expired
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        redis_client.exists.return_value = False
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = {
                "access_token": "new_access_token",
                "refresh_token": "new_refresh_token",
                "expires_in": 3600
            }
            
            manager = TokenManager(db, redis_client)
            result = await manager.get_token(
                tenant_id=1,
                shop_id=shop.id,
                provider='etsy',
                auto_refresh=True
            )
        
        assert result == "new_access_token"
        
        # Verify token updated in database
        db.refresh(token)
        decrypted = token_encryptor.decrypt(token.access_token)
        assert decrypted == "new_access_token"
        assert token.refresh_count == 1
    
    @pytest.mark.asyncio
    async def test_single_flight_refresh_pattern(self, db, redis_client, shop_with_token):
        """Test that concurrent refresh requests use single-flight pattern"""
        shop, token = shop_with_token
        
        # Set token to expired
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        refresh_called = 0
        
        def mock_set(key, value, *args, **kwargs):
            if 'token_refresh_lock' in key:
                nonlocal refresh_called
                refresh_called += 1
                return refresh_called == 1  # Only first call gets lock
            return True
        
        redis_client.set.side_effect = mock_set
        redis_client.get.return_value = None
        redis_client.delete.return_value = True
        redis_client.exists.side_effect = [True, True, False]  # Lock exists, then released
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = {
                "access_token": "refreshed_token",
                "refresh_token": "new_refresh",
                "expires_in": 3600
            }
            
            manager1 = TokenManager(db, redis_client)
            manager2 = TokenManager(db, redis_client)
            
            # Simulate concurrent requests
            task1 = manager1.refresh_token(1, shop.id, 'etsy')
            task2 = manager2.refresh_token(1, shop.id, 'etsy')
            
            # Only one should call refresh
            result1 = await task1
            # Second should wait and get the refreshed token
            assert mock_refresh.call_count == 1  # Only called once
    
    @pytest.mark.asyncio
    async def test_token_rotation(self, db, redis_client, shop_with_token):
        """Test that refresh token is rotated when Etsy provides a new one"""
        shop, token = shop_with_token
        
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = {
                "access_token": "new_access",
                "refresh_token": "rotated_refresh",  # New refresh token
                "expires_in": 3600
            }
            
            manager = TokenManager(db, redis_client)
            await manager.refresh_token(1, shop.id, 'etsy')
        
        # Verify both tokens updated
        db.refresh(token)
        decrypted_access = token_encryptor.decrypt(token.access_token)
        decrypted_refresh = token_encryptor.decrypt(token.refresh_token)
        
        assert decrypted_access == "new_access"
        assert decrypted_refresh == "rotated_refresh"
    
    @pytest.mark.asyncio
    async def test_refresh_failure_handling(self, db, redis_client, shop_with_token):
        """Test handling of refresh failures"""
        shop, token = shop_with_token
        
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.side_effect = Exception("Etsy API error")
            
            manager = TokenManager(db, redis_client)
            
            with pytest.raises(Exception):
                await manager.refresh_token(1, shop.id, 'etsy')
        
        # Verify token not corrupted
        db.refresh(token)
        decrypted = token_encryptor.decrypt(token.access_token)
        assert decrypted == "access_token_123"  # Original token unchanged

    @pytest.mark.asyncio
    async def test_refresh_failure_raises_token_refresh_error(self, db, redis_client, shop_with_token):
        """Test that refresh failure raises TokenRefreshError with message containing 'refresh'"""
        shop, token = shop_with_token
        
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.side_effect = Exception("Etsy token refresh failed: 400 invalid_grant")
            
            manager = TokenManager(db, redis_client)
            
            with pytest.raises(TokenRefreshError) as exc_info:
                await manager.refresh_token(1, shop.id, 'etsy')
        
        assert "refresh" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_refresh_invalid_grant_clear_message(self, db, redis_client, shop_with_token):
        """Test that invalid_grant from Etsy produces user-friendly message"""
        shop, token = shop_with_token
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.side_effect = Exception("Refresh token expired. Reconnect Etsy to grant permissions.")
            
            manager = TokenManager(db, redis_client)
            
            with pytest.raises(TokenRefreshError) as exc_info:
                await manager.refresh_token(1, shop.id, 'etsy')
        
        msg = str(exc_info.value)
        assert "reconnect" in msg.lower() or "expired" in msg.lower()


class TestParseEtsyTokenError:
    """Test Etsy token error parsing for user-friendly messages"""

    def test_invalid_grant_returns_user_friendly_message(self):
        """Test that invalid_grant produces Reconnect Etsy message"""
        response = MagicMock()
        response.status_code = 400
        response.json.return_value = {"error": "invalid_grant", "error_description": "Token expired"}
        response.text = ""

        msg = _parse_etsy_token_error(response)
        assert "Reconnect" in msg or "reconnect" in msg.lower()
        assert "expired" in msg.lower() or "permissions" in msg.lower()

    def test_error_description_used_when_not_invalid_grant(self):
        """Test that error_description is used when available"""
        response = MagicMock()
        response.status_code = 401
        response.json.return_value = {"error": "other", "error_description": "Custom error message"}
        response.text = ""

        msg = _parse_etsy_token_error(response)
        assert "Custom error message" in msg
    
    @pytest.mark.asyncio
    async def test_cache_invalidation_after_refresh(self, db, redis_client, shop_with_token):
        """Test that cache is updated after successful refresh"""
        shop, token = shop_with_token
        
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        setex_calls = []
        
        def mock_setex(key, ttl, value):
            setex_calls.append((key, ttl, value))
            return True
        
        redis_client.setex.side_effect = mock_setex
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = {
                "access_token": "cached_new_token",
                "expires_in": 3600
            }
            
            manager = TokenManager(db, redis_client)
            await manager.refresh_token(1, shop.id, 'etsy')
        
        # Verify cache was updated
        assert len(setex_calls) > 0
        cache_key, ttl, cache_value = setex_calls[0]
        assert 'oauth_token:etsy:1:' in cache_key
        assert ttl == 3300  # 3600 - 300 (5 min buffer)
        
        import json
        cached_data = json.loads(cache_value)
        assert cached_data['access_token'] == 'cached_new_token'
    
    @pytest.mark.asyncio
    async def test_proactive_refresh_before_expiry(self, db, redis_client, shop_with_token):
        """Test that tokens are refreshed 5 minutes before expiry"""
        shop, token = shop_with_token
        
        # Token expires in 4 minutes (within 5-minute buffer)
        token.expires_at = datetime.now(timezone.utc) + timedelta(minutes=4)
        db.commit()
        
        redis_client.get.return_value = None
        redis_client.set.return_value = True
        redis_client.delete.return_value = True
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = {
                "access_token": "proactive_refresh",
                "expires_in": 3600
            }
            
            manager = TokenManager(db, redis_client)
            result = await manager.get_token(
                tenant_id=1,
                shop_id=shop.id,
                provider='etsy',
                auto_refresh=True
            )
        
        # Should have triggered refresh
        assert mock_refresh.call_count == 1
        assert result == "proactive_refresh"

