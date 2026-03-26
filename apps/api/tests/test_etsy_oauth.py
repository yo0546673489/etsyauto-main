"""
Integration Tests for Etsy OAuth Flow
Tests PKCE authorization, code exchange, token storage, and shop creation
"""
import pytest
import json
import hashlib
import base64
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.models.tenancy import Shop, OAuthToken
from app.services.encryption import token_encryptor


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def auth_token(db):
    """Create a test user and return auth token"""
    from app.core.security import create_access_token
    from app.models.tenancy import User, Tenant, Membership
    
    # Create tenant
    tenant = Tenant(name="Test Tenant", status="active")
    db.add(tenant)
    db.flush()
    
    # Create user
    user = User(
        email="test@example.com",
        password_hash="hashed",
        email_verified=True
    )
    db.add(user)
    db.flush()
    
    # Create membership
    membership = Membership(
        user_id=user.id,
        tenant_id=tenant.id,
        role="owner"
    )
    db.add(membership)
    db.commit()
    
    # Create token
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        tenant_id=tenant.id,
        role="owner"
    )
    
    return token, tenant.id, user.id


class TestEtsyOAuth:
    """Test Etsy OAuth PKCE flow"""
    
    def test_get_authorization_url(self, client, auth_token):
        """Test getting Etsy authorization URL with PKCE"""
        token, tenant_id, user_id = auth_token
        
        response = client.get(
            "/api/shops/etsy/connect",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "authorization_url" in data
        assert "www.etsy.com/oauth/connect" in data["authorization_url"]
        assert "code_challenge" in data["authorization_url"]
        assert "code_challenge_method=S256" in data["authorization_url"]
        assert "state=" in data["authorization_url"]
    
    def test_rate_limit_oauth_start(self, client, auth_token):
        """Test OAuth start rate limiting (10 attempts per hour)"""
        token, tenant_id, user_id = auth_token
        
        # Make 11 requests (limit is 10)
        for i in range(11):
            response = client.get(
                "/api/shops/etsy/connect",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if i < 10:
                assert response.status_code == 200
            else:
                assert response.status_code == 429
                assert "Too many OAuth attempts" in response.json()["detail"]
    
    @patch('app.services.etsy_oauth.EtsyOAuthService.exchange_code_for_token')
    @patch('app.services.etsy_oauth.EtsyOAuthService.get_shop_info')
    def test_oauth_callback_success(self, mock_get_shop, mock_exchange, client, auth_token, db):
        """Test successful OAuth callback and token storage"""
        token, tenant_id, user_id = auth_token
        
        # Mock responses
        mock_exchange.return_value = AsyncMock(return_value={
            "access_token": "test_access_token",
            "refresh_token": "test_refresh_token",
            "expires_in": 3600,
            "token_type": "Bearer"
        })
        
        mock_get_shop.return_value = AsyncMock(return_value={
            "shop_id": "12345",
            "shop_name": "Test Shop"
        })
        
        # First, get state by starting OAuth flow
        redis_client = MagicMock()
        state_value = "test_state_123"
        code_verifier = "test_verifier"
        
        # Mock Redis to return state data
        with patch('app.api.endpoints.shops.redis_client', redis_client):
            redis_client.get.return_value = json.dumps({
                "code_verifier": code_verifier,
                "user_id": user_id,
                "tenant_id": tenant_id
            })
            
            response = client.post(
                "/api/shops/etsy/callback",
                json={
                    "code": "test_code",
                    "state": state_value
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Idempotency-Key": "oauth-callback-1",
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["message"] == "Shop connected successfully"
        assert "shop" in data
        assert data["shop"]["etsy_shop_id"] == "12345"
        
        # Verify shop created
        shop = db.query(Shop).filter(Shop.etsy_shop_id == "12345").first()
        assert shop is not None
        assert shop.tenant_id == tenant_id
        assert shop.status == "connected"
        
        # Verify token stored (encrypted)
        oauth_token = db.query(OAuthToken).filter(
            OAuthToken.shop_id == shop.id
        ).first()
        assert oauth_token is not None
        assert oauth_token.provider == "etsy"
        
        # Verify token is encrypted
        decrypted = token_encryptor.decrypt(oauth_token.access_token)
        assert decrypted == "test_access_token"
    
    def test_oauth_callback_invalid_state(self, client, auth_token):
        """Test OAuth callback with invalid/expired state"""
        token, tenant_id, user_id = auth_token
        
        redis_client = MagicMock()
        redis_client.get.return_value = None  # No state found
        
        with patch('app.api.endpoints.shops.redis_client', redis_client):
            response = client.post(
                "/api/shops/etsy/callback",
                json={
                    "code": "test_code",
                    "state": "invalid_state"
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Idempotency-Key": "oauth-callback-2",
                }
            )
        
        assert response.status_code == 400
        assert "Invalid or expired OAuth state" in response.json()["detail"]
    
    def test_oauth_callback_existing_shop(self, client, auth_token, db):
        """Test OAuth callback updates existing shop"""
        token, tenant_id, user_id = auth_token
        
        # Create existing shop
        shop = Shop(
            tenant_id=tenant_id,
            etsy_shop_id="12345",
            display_name="Old Name",
            status="revoked"
        )
        db.add(shop)
        db.commit()
        
        # Mock OAuth flow
        redis_client = MagicMock()
        redis_client.get.return_value = json.dumps({
            "code_verifier": "test_verifier",
            "user_id": user_id,
            "tenant_id": tenant_id
        })
        
        with patch('app.services.etsy_oauth.EtsyOAuthService.exchange_code_for_token') as mock_exchange, \
             patch('app.services.etsy_oauth.EtsyOAuthService.get_shop_info') as mock_get_shop, \
             patch('app.api.endpoints.shops.redis_client', redis_client):
            
            mock_exchange.return_value = AsyncMock(return_value={
                "access_token": "new_token",
                "refresh_token": "new_refresh",
                "expires_in": 3600
            })
            
            mock_get_shop.return_value = AsyncMock(return_value={
                "shop_id": "12345",
                "shop_name": "Updated Shop Name"
            })
            
            response = client.post(
                "/api/shops/etsy/callback",
                json={"code": "test_code", "state": "test_state"},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Idempotency-Key": "oauth-callback-3",
                }
            )
        
        assert response.status_code == 200
        
        # Verify shop updated
        db.refresh(shop)
        assert shop.display_name == "Updated Shop Name"
        assert shop.status == "connected"
    
    def test_manual_token_refresh(self, client, auth_token, db):
        """Test manual token refresh endpoint"""
        token, tenant_id, user_id = auth_token
        
        # Create shop with token
        shop = Shop(
            tenant_id=tenant_id,
            etsy_shop_id="12345",
            display_name="Test Shop",
            status="connected"
        )
        db.add(shop)
        db.flush()
        
        oauth_token = OAuthToken(
            shop_id=shop.id,
            tenant_id=tenant_id,
            provider="etsy",
            access_token=token_encryptor.encrypt("old_token"),
            refresh_token=token_encryptor.encrypt("refresh_token"),
            expires_at=datetime.utcnow() - timedelta(minutes=10),  # Expired
            scopes="listings_r listings_w"
        )
        db.add(oauth_token)
        db.commit()
        
        with patch('app.services.etsy_oauth.EtsyOAuthService.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = AsyncMock(return_value={
                "access_token": "new_token",
                "refresh_token": "new_refresh",
                "expires_in": 3600
            })
            
            response = client.post(
                f"/api/shops/{shop.id}/refresh-token",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Idempotency-Key": "oauth-refresh-1",
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["message"] == "Token refreshed successfully"
        assert "expires_at" in data
        assert "refresh_count" in data
        
        # Verify token updated
        db.refresh(oauth_token)
        decrypted = token_encryptor.decrypt(oauth_token.access_token)
        assert decrypted == "new_token"
    
    def test_manual_refresh_rate_limit(self, client, auth_token, db):
        """Test manual refresh rate limiting (5 per 10 minutes)"""
        token, tenant_id, user_id = auth_token
        
        shop = Shop(
            tenant_id=tenant_id,
            etsy_shop_id="12345",
            display_name="Test Shop",
            status="connected"
        )
        db.add(shop)
        db.flush()
        
        oauth_token = OAuthToken(
            shop_id=shop.id,
            tenant_id=tenant_id,
            provider="etsy",
            access_token=token_encryptor.encrypt("token"),
            refresh_token=token_encryptor.encrypt("refresh"),
            expires_at=datetime.utcnow() + timedelta(hours=1),
            scopes="listings_r"
        )
        db.add(oauth_token)
        db.commit()
        
        with patch('app.services.etsy_oauth.EtsyOAuthService.refresh_access_token') as mock_refresh:
            mock_refresh.return_value = AsyncMock(return_value={
                "access_token": "new",
                "refresh_token": "new_refresh",
                "expires_in": 3600
            })
            
            # Make 6 requests (limit is 5)
            for i in range(6):
                response = client.post(
                    f"/api/shops/{shop.id}/refresh-token",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Idempotency-Key": f"oauth-refresh-{i}",
                    }
                )
                
                if i < 5:
                    assert response.status_code == 200
                else:
                    assert response.status_code == 429
    
    def test_disconnect_shop(self, client, auth_token, db):
        """Test shop disconnection and token revocation"""
        token, tenant_id, user_id = auth_token
        
        shop = Shop(
            tenant_id=tenant_id,
            etsy_shop_id="12345",
            display_name="Test Shop",
            status="connected"
        )
        db.add(shop)
        db.flush()
        
        oauth_token = OAuthToken(
            shop_id=shop.id,
            tenant_id=tenant_id,
            provider="etsy",
            access_token=token_encryptor.encrypt("token"),
            refresh_token=token_encryptor.encrypt("refresh"),
            expires_at=datetime.utcnow() + timedelta(hours=1),
            scopes="listings_r"
        )
        db.add(oauth_token)
        db.commit()
        
        response = client.delete(
            f"/api/shops/{shop.id}",
            headers={
                "Authorization": f"Bearer {token}",
                "Idempotency-Key": "oauth-disconnect-1",
            }
        )
        
        assert response.status_code == 200
        
        # Verify shop marked as revoked
        db.refresh(shop)
        assert shop.status == "revoked"
        
        # Verify token deleted
        token_exists = db.query(OAuthToken).filter(
            OAuthToken.shop_id == shop.id
        ).first()
        assert token_exists is None

