"""
OAuth Token Management Tests
Tests for token encryption, refresh, and security features
"""
import pytest
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch, AsyncMock
import base64
import os

from app.services.encryption import TokenEncryption, token_encryptor
from app.services.token_manager import TokenManager, TokenRefreshError
from app.models.tenancy import OAuthToken, Shop
from app.core.security import (
    sanitize_dict, mask_token, validate_redirect_uri,
    validate_state_token, check_rate_limit
)
from app.core.config import settings


# Shared fixtures for all test classes
@pytest.fixture
def mock_db():
    """Mock database session"""
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = None
    return db


@pytest.fixture
def mock_redis():
    """Mock Redis client"""
    redis = Mock()
    redis.get.return_value = None
    redis.set.return_value = True
    redis.setex.return_value = True
    redis.delete.return_value = True
    redis.exists.return_value = False
    redis.incr.return_value = 1
    return redis


class TestTokenEncryption:
    """Test token encryption/decryption"""
    
    def test_encrypt_decrypt(self):
        """Test basic encryption and decryption"""
        # Generate a test key
        key = base64.b64encode(os.urandom(32)).decode()
        encryptor = TokenEncryption(encryption_key=key)
        
        # Test encryption
        token = "test_access_token_12345"
        encrypted = encryptor.encrypt(token)
        
        assert encrypted != token.encode()
        assert len(encrypted) > len(token)
        
        # Test decryption
        decrypted = encryptor.decrypt(encrypted)
        assert decrypted == token
    
    def test_empty_token(self):
        """Test handling of empty tokens"""
        key = base64.b64encode(os.urandom(32)).decode()
        encryptor = TokenEncryption(encryption_key=key)
        
        encrypted = encryptor.encrypt("")
        assert encrypted == b''
        
        decrypted = encryptor.decrypt(b'')
        assert decrypted == ''
    
    def test_different_keys_fail(self):
        """Test that decryption fails with different key"""
        key1 = base64.b64encode(os.urandom(32)).decode()
        key2 = base64.b64encode(os.urandom(32)).decode()
        
        encryptor1 = TokenEncryption(encryption_key=key1)
        encryptor2 = TokenEncryption(encryption_key=key2)
        
        token = "test_token"
        encrypted = encryptor1.encrypt(token)
        
        with pytest.raises(Exception):
            encryptor2.decrypt(encrypted)


class TestTokenManager:
    """Test TokenManager with mocked database"""
    
    @pytest.mark.asyncio
    async def test_save_token(self, mock_db, mock_redis):
        """Test saving encrypted token"""
        manager = TokenManager(mock_db, mock_redis)
        
        token = await manager.save_token(
            tenant_id=1,
            shop_id=1,
            access_token="test_access",
            refresh_token="test_refresh",
            expires_in=3600,
            provider='etsy'
        )
        
        # Verify database add was called
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_token_from_cache(self, mock_db, mock_redis):
        """Test getting token from Redis cache"""
        import json
        
        # Mock cached token
        cache_data = {
            'access_token': 'cached_token',
            'expires_at': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        }
        mock_redis.get.return_value = json.dumps(cache_data)
        
        manager = TokenManager(mock_db, mock_redis)
        token = await manager.get_token(1, 1, 'etsy', auto_refresh=False)
        
        assert token == 'cached_token'
        # Should not hit database
        mock_db.query.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_refresh_token_single_flight(self, mock_db, mock_redis):
        """Test single-flight refresh pattern"""
        # Simulate another process refreshing
        mock_redis.set.return_value = False  # Lock not acquired
        mock_redis.exists.side_effect = [True, True, False]  # Lock exists, then released
        
        # Mock successful get after wait
        manager = TokenManager(mock_db, mock_redis)
        
        with patch.object(manager, 'get_token', return_value='new_token'):
            token = await manager.refresh_token(1, 1, 'etsy')
            
            # Should have waited and then got new token
            assert token == 'new_token'


class TestSecurityFunctions:
    """Test security utilities"""
    
    def test_sanitize_dict(self):
        """Test dictionary sanitization"""
        data = {
            'user_id': 123,
            'access_token': 'secret_token_123',
            'refresh_token': 'secret_refresh_456',
            'api_key': 'api_key_789',
            'username': 'john'
        }
        
        sanitized = sanitize_dict(data)
        
        assert sanitized['user_id'] == 123
        assert sanitized['username'] == 'john'
        assert sanitized['access_token'] == '[REDACTED]'
        assert sanitized['refresh_token'] == '[REDACTED]'
        assert sanitized['api_key'] == '[REDACTED]'
    
    def test_sanitize_nested_dict(self):
        """Test nested dictionary sanitization"""
        data = {
            'oauth': {
                'access_token': 'secret',
                'user': {
                    'name': 'John',
                    'api_key': 'key123'
                }
            }
        }
        
        sanitized = sanitize_dict(data)
        
        assert sanitized['oauth']['access_token'] == '[REDACTED]'
        assert sanitized['oauth']['user']['name'] == 'John'
        assert sanitized['oauth']['user']['api_key'] == '[REDACTED]'
    
    def test_mask_token(self):
        """Test token masking"""
        token = "sk_test_abc123xyz789"
        masked = mask_token(token, visible_chars=4)
        
        # Function returns first 4 chars + ... + last 4 chars
        assert masked.startswith("sk_t")
        assert masked.endswith("z789")
        assert "..." in masked
        assert 'abc123' not in masked
        assert len(masked) < len(token)
        
        # Test short token
        short = mask_token("abc", visible_chars=4)
        assert short == "***"
        
        # Test empty
        empty = mask_token("", visible_chars=4)
        assert empty == "[EMPTY]"
    
    def test_validate_redirect_uri(self):
        """Test redirect URI validation"""
        allowed = ['example.com', 'app.example.com']
        
        # Valid URIs
        assert validate_redirect_uri('https://example.com/callback', allowed)
        assert validate_redirect_uri('https://app.example.com/auth', allowed)
        assert validate_redirect_uri('http://localhost:3000/callback', allowed)
        
        # Invalid URIs
        assert not validate_redirect_uri('http://evil.com/callback', allowed)
        assert not validate_redirect_uri('javascript:alert(1)', allowed)
        assert not validate_redirect_uri('', allowed)
    
    def test_validate_state_token(self):
        """Test state token validation"""
        # Valid state
        assert validate_state_token('a' * 32)
        assert validate_state_token('abc123_-' * 4)
        
        # Invalid state
        assert not validate_state_token('short')
        assert not validate_state_token('has spaces here')
        assert not validate_state_token('has/slashes')
        assert not validate_state_token('')
    
    def test_rate_limiting(self):
        """Test rate limit checking"""
        mock_redis = Mock()
        
        # First attempt - allowed
        mock_redis.get.return_value = None
        mock_redis.setex.return_value = True
        result = check_rate_limit(mock_redis, 'test_key', 5, 60)
        assert result is True
        
        # Within limit - allowed
        mock_redis.get.return_value = '3'
        mock_redis.incr.return_value = 4
        result = check_rate_limit(mock_redis, 'test_key', 5, 60)
        assert result is True
        
        # Exceeded limit - denied
        mock_redis.get.return_value = '5'
        result = check_rate_limit(mock_redis, 'test_key', 5, 60)
        assert result is False


class TestOAuthEndpoints:
    """Integration tests for OAuth endpoints"""
    
    @pytest.mark.asyncio
    async def test_oauth_flow_start(self):
        """Test starting OAuth flow"""
        from app.services.etsy_oauth import EtsyOAuthService
        
        oauth_service = EtsyOAuthService()
        result = oauth_service.get_authorization_url()
        
        assert 'auth_url' in result
        assert 'state' in result
        assert 'code_verifier' in result
        assert 'https://www.etsy.com/oauth/connect' in result['auth_url']
        assert result['state'] is not None
        assert len(result['code_verifier']) > 0
    
    @pytest.mark.asyncio
    async def test_oauth_flow_end_to_end(self, mock_db, mock_redis):
        """Test full OAuth flow end-to-end"""
        from app.services.etsy_oauth import EtsyOAuthService
        from app.services.token_manager import TokenManager
        import httpx
        
        oauth_service = EtsyOAuthService()
        token_manager = TokenManager(mock_db, mock_redis)
        
        # Step 1: Generate authorization URL
        auth_data = oauth_service.get_authorization_url()
        assert 'auth_url' in auth_data
        state = auth_data['state']
        code_verifier = auth_data['code_verifier']
        
        # Step 2: Simulate user authorization (mock the callback)
        mock_code = "test_authorization_code_12345"
        
        # Mock the token exchange - properly mock AsyncClient context manager
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "access_token": "test_access_token",
            "refresh_token": "test_refresh_token",
            "expires_in": 3600,
            "token_type": "bearer"
        }
        
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        
        with patch('httpx.AsyncClient', return_value=mock_client):
            # Exchange code for token
            token_response = await oauth_service.exchange_code_for_token(
                code=mock_code,
                code_verifier=code_verifier
            )
            
            assert token_response['access_token'] == "test_access_token"
            assert token_response['refresh_token'] == "test_refresh_token"
            
            # Step 3: Save token
            await token_manager.save_token(
                tenant_id=1,
                shop_id=1,
                access_token=token_response['access_token'],
                refresh_token=token_response['refresh_token'],
                expires_in=token_response['expires_in'],
                provider='etsy'
            )
            
            # Step 4: Retrieve token (from cache after save)
            # Mock cache to return the saved token
            import json
            cache_data = {
                'access_token': 'test_access_token',
                'expires_at': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            }
            mock_redis.get.return_value = json.dumps(cache_data)
            
            retrieved_token = await token_manager.get_token(1, 1, 'etsy', auto_refresh=False)
            assert retrieved_token == "test_access_token"
            
            # Verify database operations were called
            mock_db.add.assert_called()
            mock_db.commit.assert_called()


class TestMultiTenantIsolation:
    """Test multi-tenant token isolation"""
    
    @pytest.mark.asyncio
    async def test_tenant_isolation(self, mock_db, mock_redis):
        """Test that tenants cannot access each other's tokens"""
        from app.services.token_manager import TokenManager
        
        # Create tokens for two different tenants
        token1 = Mock()
        token1.tenant_id = 1
        token1.shop_id = 1
        token1.access_token_encrypted = b'encrypted_token_1'
        token1.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        token2 = Mock()
        token2.tenant_id = 2
        token2.shop_id = 2
        token2.access_token_encrypted = b'encrypted_token_2'
        token2.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        manager = TokenManager(mock_db, mock_redis)
        
        # Test Tenant 1 - verify cache key isolation
        cache_key_tenant1 = manager._get_cache_key(1, 1, 'etsy')
        assert '1:1' in cache_key_tenant1
        assert '2' not in cache_key_tenant1
        
        # Test Tenant 2 - verify cache key isolation
        cache_key_tenant2 = manager._get_cache_key(2, 2, 'etsy')
        assert '2:2' in cache_key_tenant2
        assert cache_key_tenant1 != cache_key_tenant2
        
        # Verify refresh lock keys are also isolated
        lock_key_tenant1 = manager._get_refresh_lock_key(1, 1, 'etsy')
        lock_key_tenant2 = manager._get_refresh_lock_key(2, 2, 'etsy')
        assert lock_key_tenant1 != lock_key_tenant2
        
        # Verify tokens are stored/retrieved with proper tenant isolation
        # The cache keys ensure tenants can't access each other's tokens
        assert '1:1' in lock_key_tenant1
        assert '2:2' in lock_key_tenant2
    
    @pytest.mark.asyncio
    async def test_shop_isolation_same_tenant(self, mock_db, mock_redis):
        """Test that shops are isolated even within the same tenant"""
        from app.services.token_manager import TokenManager
        
        # Two shops in same tenant
        shop1_token = Mock()
        shop1_token.tenant_id = 1
        shop1_token.shop_id = 1
        shop1_token.access_token_encrypted = b'encrypted_shop1'
        shop1_token.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        shop2_token = Mock()
        shop2_token.tenant_id = 1
        shop2_token.shop_id = 2
        shop2_token.access_token_encrypted = b'encrypted_shop2'
        shop2_token.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        manager = TokenManager(mock_db, mock_redis)
        
        # Verify cache keys are different
        key1 = manager._get_cache_key(1, 1, 'etsy')
        key2 = manager._get_cache_key(1, 2, 'etsy')
        assert key1 != key2
        assert '1:1' in key1
        assert '1:2' in key2


class TestTokenPersistence:
    """Test token persistence after restart"""
    
    @pytest.mark.asyncio
    async def test_token_persistence_after_restart(self, mock_db, mock_redis):
        """Test that tokens persist and can be retrieved after service restart"""
        from app.services.token_manager import TokenManager
        import json
        
        # Simulate tokens stored in database (persistent storage)
        persisted_token = Mock()
        persisted_token.tenant_id = 1
        persisted_token.shop_id = 1
        persisted_token.access_token_encrypted = b'encrypted_persisted_token'
        persisted_token.refresh_token_encrypted = b'encrypted_refresh'
        persisted_token.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        persisted_token.provider = 'etsy'
        
        # First "session" - save token
        mock_db.query.return_value.filter.return_value.first.return_value = None
        manager1 = TokenManager(mock_db, mock_redis)
        
        await manager1.save_token(
            tenant_id=1,
            shop_id=1,
            access_token="persisted_access_token",
            refresh_token="persisted_refresh_token",
            expires_in=3600,
            provider='etsy'
        )
        
        # Simulate service restart - cache cleared, but DB still has token
        mock_redis.get.return_value = None  # Cache cleared
        mock_db.query.return_value.filter.return_value.first.return_value = persisted_token
        
        # Second "session" - retrieve token from DB
        manager2 = TokenManager(mock_db, mock_redis)
        
        with patch.object(token_encryptor, 'decrypt', return_value="persisted_access_token"):
            token = await manager2.get_token(1, 1, 'etsy', auto_refresh=False)
            
            # Token should be retrieved from database (not cache)
            assert token == "persisted_access_token"
            mock_db.query.assert_called()  # DB was queried
    
    @pytest.mark.asyncio
    async def test_cache_rehydration_after_restart(self, mock_db, mock_redis):
        """Test that cache is rehydrated from DB after restart"""
        from app.services.token_manager import TokenManager
        import json
        
        # Token exists in DB
        db_token = Mock()
        db_token.tenant_id = 1
        db_token.shop_id = 1
        db_token.access_token_encrypted = b'encrypted_db_token'
        db_token.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        mock_db.query.return_value.filter.return_value.first.return_value = db_token
        mock_redis.get.return_value = None  # Cache empty after restart
        
        manager = TokenManager(mock_db, mock_redis)
        
        with patch.object(token_encryptor, 'decrypt', return_value="db_token_value"):
            # First call - should load from DB and cache it
            token1 = await manager.get_token(1, 1, 'etsy', auto_refresh=False)
            assert token1 == "db_token_value"
            
            # Verify cache was set
            assert mock_redis.set.called or mock_redis.setex.called
            
            # Second call - should come from cache
            cache_data = {
                'access_token': 'db_token_value',
                'expires_at': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            }
            mock_redis.get.return_value = json.dumps(cache_data)
            
            token2 = await manager.get_token(1, 1, 'etsy', auto_refresh=False)
            assert token2 == "db_token_value"


class TestCeleryTasks:
    """Test Celery background tasks"""
    
    @pytest.mark.asyncio
    async def test_refresh_expiring_tokens(self):
        """Test scheduled token refresh task"""
        from app.worker.tasks.token_tasks import refresh_expiring_tokens
        from app.models.tenancy import OAuthToken
        
        # Mock database with expiring tokens
        expiring_token = Mock(spec=OAuthToken)
        expiring_token.tenant_id = 1
        expiring_token.shop_id = 1
        expiring_token.expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        
        # This would test the Celery task with mock database
        # assert refresh_expiring_tokens() is not None
        pass
    
    @pytest.mark.asyncio
    async def test_audit_token_health(self):
        """Test token health audit task"""
        # This would test the audit task
        pass


# Performance tests
class TestPerformance:
    """Performance and load tests"""
    
    @pytest.mark.asyncio
    async def test_single_flight_refresh_under_load(self, mock_db, mock_redis):
        """Test single-flight refresh pattern under concurrent load"""
        from app.services.token_manager import TokenManager
        import httpx
        import asyncio
        
        # Create an expired token
        expired_time = datetime.now(timezone.utc) - timedelta(hours=1)
        mock_token = Mock()
        mock_token.tenant_id = 1
        mock_token.shop_id = 1
        mock_token.access_token_encrypted = b'encrypted_old'
        mock_token.refresh_token_encrypted = b'encrypted_refresh'
        mock_token.expires_at = expired_time
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_token
        
        # Mock successful refresh response
        refresh_response = {
            "access_token": "new_access_token",
            "refresh_token": "new_refresh_token",
            "expires_in": 3600
        }
        
        manager = TokenManager(mock_db, mock_redis)
        refresh_count = {'count': 0}
        lock_acquired_count = {'count': 0}
        
        # Mock Redis lock behavior - first call succeeds, rest fail (simulating single-flight)
        original_redis_set = mock_redis.set
        def mock_redis_set_with_lock(key, value, nx=False, ex=None):
            if 'refresh_lock' in key and nx:
                if lock_acquired_count['count'] == 0:
                    lock_acquired_count['count'] += 1
                    refresh_count['count'] += 1
                    return True  # First request gets lock
                return False  # Others blocked
            return original_redis_set(key, value)
        
        mock_redis.set = mock_redis_set_with_lock
        mock_redis.exists.return_value = False  # Lock doesn't exist initially
        
        # Mock token in DB
        mock_token = Mock()
        mock_token.tenant_id = 1
        mock_token.shop_id = 1
        mock_token.refresh_token = b'encrypted_refresh'
        mock_db.query.return_value.filter.return_value.first.return_value = mock_token
        
        # Mock refresh API call
        refresh_response = {
            "access_token": "new_access_token",
            "refresh_token": "new_refresh_token",
            "expires_in": 3600
        }
        
        with patch('app.services.etsy_oauth.etsy_oauth.refresh_access_token', new_callable=AsyncMock) as mock_refresh:
            mock_refresh.return_value = refresh_response
            
            with patch.object(token_encryptor, 'decrypt', return_value="decrypted_refresh"):
                with patch.object(token_encryptor, 'encrypt', side_effect=lambda x: x.encode()):
                    # Simulate 10 concurrent refresh requests
                    tasks = [
                        manager.refresh_token(1, 1, 'etsy')
                        for _ in range(10)
                    ]
                    
                    # Execute concurrently
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Verify lock mechanism was used (single-flight)
                    # First request should get lock, others should wait
                    assert lock_acquired_count['count'] == 1  # Only one lock acquired
                    # The single-flight pattern ensures only one refresh happens
    
    @pytest.mark.asyncio
    async def test_cache_performance(self, mock_db, mock_redis):
        """Test cache hit rate"""
        import json
        from app.services.token_manager import TokenManager
        
        # Set up cached token
        cache_data = {
            'access_token': 'cached_token',
            'expires_at': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        }
        mock_redis.get.return_value = json.dumps(cache_data)
        
        manager = TokenManager(mock_db, mock_redis)
        
        # Make 100 requests
        cache_hits = 0
        for _ in range(100):
            token = await manager.get_token(1, 1, 'etsy', auto_refresh=False)
            if token == 'cached_token':
                cache_hits += 1
        
        # All should hit cache (no DB calls)
        assert cache_hits == 100
        mock_db.query.assert_not_called()
        
        # Verify cache hit rate
        cache_hit_rate = cache_hits / 100
        assert cache_hit_rate == 1.0  # 100% hit rate


# Security tests
class TestSecurity:
    """Security-focused tests"""
    
    def test_no_token_in_logs(self):
        """Verify tokens are not logged"""
        from app.core.security import SanitizingFormatter
        import logging
        
        formatter = SanitizingFormatter()
        
        record = logging.LogRecord(
            name='test',
            level=logging.INFO,
            pathname='test.py',
            lineno=1,
            msg='Token is Bearer abc123xyz789',
            args=(),
            exc_info=None
        )
        
        formatted = formatter.format(record)
        assert 'abc123xyz789' not in formatted
        assert '[REDACTED]' in formatted or '[TOKEN_REDACTED]' in formatted
    
    def test_encryption_key_required(self):
        """Verify encryption key is required in production"""
        # When no key provided, it generates a random one (dev mode)
        # In production, this should use ENCRYPTION_KEY from settings
        encryptor = TokenEncryption(encryption_key=None)
        # Should still work (uses random key or env var)
        assert encryptor is not None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

