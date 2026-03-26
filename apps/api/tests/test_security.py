"""
Security Hardening Tests
Validates JWT, encryption, API keys, and cookie security
"""
import pytest
from datetime import datetime, timedelta
import jwt as pyjwt

from app.core.jwt_manager import JWTManager, TokenType
from app.core.encryption_manager import EncryptionManager
from app.core.api_key_manager import APIKeyManager, APIKeyScope
from app.core.cookie_manager import CookieManager
from app.core.secrets_manager import SecretsManager


class TestJWTSecurity:
    """Test JWT RS256 security"""
    
    def test_jwt_rs256_signing(self):
        """Test that JWT uses RS256 algorithm"""
        manager = JWTManager()
        
        token = manager.create_access_token(
            user_id=1,
            tenant_id=1,
            role="admin",
            shop_ids=[1, 2]
        )
        
        # Decode without verification to check algorithm
        unverified = pyjwt.decode(token, options={"verify_signature": False})
        
        # Get header
        header = pyjwt.get_unverified_header(token)
        assert header["alg"] == "RS256", "JWT must use RS256 algorithm"
    
    def test_jwt_has_required_claims(self):
        """Test that JWT has all required claims"""
        manager = JWTManager()
        
        token = manager.create_access_token(
            user_id=123,
            tenant_id=456,
            role="creator"
        )
        
        payload = manager.verify_token(token, expected_type=TokenType.ACCESS)
        
        # Standard claims
        assert "iss" in payload, "Missing issuer claim"
        assert "aud" in payload, "Missing audience claim"
        assert "sub" in payload, "Missing subject claim"
        assert "iat" in payload, "Missing issued-at claim"
        assert "exp" in payload, "Missing expiration claim"
        assert "nbf" in payload, "Missing not-before claim"
        
        # Custom claims
        assert payload["type"] == TokenType.ACCESS
        assert payload["tenant_id"] == 456
        assert payload["role"] == "creator"
    
    def test_jwt_short_lived_access_token(self):
        """Test that access tokens are short-lived (15 min)"""
        manager = JWTManager()
        
        token = manager.create_access_token(
            user_id=1,
            tenant_id=1,
            role="viewer"
        )
        
        payload = manager.verify_token(token)
        
        exp = datetime.utcfromtimestamp(payload["exp"])
        iat = datetime.utcfromtimestamp(payload["iat"])
        lifetime = exp - iat
        
        # Should be 15 minutes
        assert lifetime.total_seconds() == 15 * 60, "Access token must be 15 minutes"
    
    def test_jwt_verify_expiration(self):
        """Test that expired tokens are rejected"""
        manager = JWTManager()
        
        # Create token that expires immediately
        manager.ACCESS_TOKEN_LIFETIME = timedelta(seconds=-1)
        token = manager.create_access_token(user_id=1, tenant_id=1, role="admin")
        manager.ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)  # Reset
        
        # Should raise ExpiredSignatureError
        with pytest.raises(pyjwt.ExpiredSignatureError):
            manager.verify_token(token, verify_exp=True)
    
    def test_jwt_verify_issuer_and_audience(self):
        """Test that issuer and audience are verified"""
        manager = JWTManager()
        
        token = manager.create_access_token(user_id=1, tenant_id=1, role="admin")
        payload = manager.verify_token(token)
        
        assert payload["iss"] == "etsy-automation-api"
        assert payload["aud"] == "etsy-automation-platform"


class TestEncryptionSecurity:
    """Test encryption at rest"""
    
    def test_encryption_decrypt_cycle(self):
        """Test basic encryption and decryption"""
        manager = EncryptionManager()
        
        plaintext = "sensitive_data_12345"
        encrypted = manager.encrypt(plaintext)
        decrypted = manager.decrypt(encrypted)
        
        assert decrypted == plaintext
        assert encrypted != plaintext, "Encrypted data must differ from plaintext"
    
    def test_encryption_handles_empty_strings(self):
        """Test that empty strings are handled correctly"""
        manager = EncryptionManager()
        
        assert manager.encrypt("") == ""
        assert manager.decrypt("") == ""
    
    def test_encryption_dict_fields(self):
        """Test encrypting specific dictionary fields"""
        manager = EncryptionManager()
        
        data = {
            "username": "john_doe",
            "password": "secret123",
            "api_key": "sk-test-key",
            "safe_field": "public_data"
        }
        
        encrypted = manager.encrypt_dict(data, ["password", "api_key"])
        
        # Safe fields unchanged
        assert encrypted["username"] == "john_doe"
        assert encrypted["safe_field"] == "public_data"
        
        # Sensitive fields encrypted
        assert encrypted["password"] != "secret123"
        assert encrypted["api_key"] != "sk-test-key"
        
        # Decrypt
        decrypted = manager.decrypt_dict(encrypted, ["password", "api_key"])
        assert decrypted["password"] == "secret123"
        assert decrypted["api_key"] == "sk-test-key"
    
    def test_encryption_key_rotation_support(self):
        """Test that key rotation is supported"""
        manager = EncryptionManager()
        
        # Encrypt with current key
        plaintext = "data_before_rotation"
        encrypted = manager.encrypt(plaintext)
        
        # Rotate to new key
        new_key = EncryptionManager.generate_key()
        manager.rotate_key(new_key)
        
        # Should still be able to decrypt old data
        decrypted = manager.decrypt(encrypted)
        assert decrypted == plaintext
        
        # New data encrypted with new key
        new_plaintext = "data_after_rotation"
        new_encrypted = manager.encrypt(new_plaintext)
        new_decrypted = manager.decrypt(new_encrypted)
        assert new_decrypted == new_plaintext


class TestAPIKeySecurity:
    """Test API key security"""
    
    def test_api_key_generation(self):
        """Test that API keys are generated securely"""
        manager = APIKeyManager()
        
        key_data = manager.generate_api_key(
            service_name="test-service",
            scopes=[APIKeyScope.READ_PRODUCTS, APIKeyScope.WRITE_PRODUCTS],
            tenant_id=1
        )
        
        # Key format
        assert key_data["api_key"].startswith("etsy_")
        assert len(key_data["api_key"]) > 40, "API key must be sufficiently long"
        
        # Hash is different from key
        assert key_data["key_hash"] != key_data["api_key"]
        assert len(key_data["key_hash"]) == 64, "SHA-256 hash must be 64 hex chars"
        
        # Metadata
        assert key_data["service_name"] == "test-service"
        assert set(key_data["scopes"]) == {APIKeyScope.READ_PRODUCTS, APIKeyScope.WRITE_PRODUCTS}
        assert key_data["tenant_id"] == 1
    
    def test_api_key_scope_validation(self):
        """Test that invalid scopes are rejected"""
        manager = APIKeyManager()
        
        with pytest.raises(ValueError, match="Invalid scopes"):
            manager.generate_api_key(
                service_name="test",
                scopes=["invalid_scope", "another_invalid"],
                tenant_id=1
            )
    
    def test_api_key_minimal_scopes(self):
        """Test that API keys can have minimal scopes (principle of least privilege)"""
        manager = APIKeyManager()
        
        # Read-only key
        read_only = manager.generate_api_key(
            service_name="readonly-service",
            scopes=[APIKeyScope.READ_PRODUCTS],
            tenant_id=1
        )
        
        assert len(read_only["scopes"]) == 1
        assert APIKeyScope.READ_PRODUCTS in read_only["scopes"]
        assert APIKeyScope.WRITE_PRODUCTS not in read_only["scopes"]
    
    def test_api_key_hashing_consistency(self):
        """Test that same key produces same hash"""
        manager = APIKeyManager()
        
        key_data = manager.generate_api_key(
            service_name="test",
            scopes=[APIKeyScope.READ_PRODUCTS],
            tenant_id=1
        )
        
        # Hash the key again
        key_hash_1 = manager._hash_key(key_data["api_key"])
        key_hash_2 = manager._hash_key(key_data["api_key"])
        
        assert key_hash_1 == key_hash_2 == key_data["key_hash"]


class TestCookieSecurity:
    """Test secure cookie settings"""
    
    def test_cookie_httponly_flag(self):
        """Test that auth cookies have HttpOnly flag"""
        from starlette.responses import Response
        
        manager = CookieManager()
        response = Response()
        
        manager.set_access_token_cookie(response, "test_token")
        
        # Check Set-Cookie header
        set_cookie = response.headers.get("set-cookie")
        assert "HttpOnly" in set_cookie, "Access token cookie must have HttpOnly flag"
    
    def test_cookie_samesite_settings(self):
        """Test SameSite cookie settings"""
        from starlette.responses import Response
        
        manager = CookieManager()
        response = Response()
        
        # Access token: SameSite=Lax
        manager.set_access_token_cookie(response, "access_token")
        access_cookie = response.headers.get("set-cookie")
        assert "SameSite=lax" in access_cookie.lower()
        
        # Refresh token: SameSite=Strict
        response2 = Response()
        manager.set_refresh_token_cookie(response2, "refresh_token")
        refresh_cookie = response2.headers.get("set-cookie")
        assert "SameSite=strict" in refresh_cookie.lower()
    
    def test_cookie_secure_flag_in_production(self):
        """Test that Secure flag is set in production"""
        from starlette.responses import Response
        
        manager = CookieManager()
        manager.is_production = True  # Simulate production
        
        response = Response()
        manager.set_access_token_cookie(response, "test_token")
        
        set_cookie = response.headers.get("set-cookie")
        assert "Secure" in set_cookie, "Cookies must have Secure flag in production"
    
    def test_cookie_path_restriction(self):
        """Test that refresh token has restricted path"""
        from starlette.responses import Response
        
        manager = CookieManager()
        response = Response()
        
        manager.set_refresh_token_cookie(response, "refresh_token")
        
        set_cookie = response.headers.get("set-cookie")
        assert "Path=/api/auth/refresh" in set_cookie, "Refresh token must have restricted path"
    
    def test_security_headers(self):
        """Test security headers"""
        manager = CookieManager()
        
        headers = manager.get_cookie_security_headers()
        
        assert "X-Content-Type-Options" in headers
        assert headers["X-Content-Type-Options"] == "nosniff"
        
        assert "X-XSS-Protection" in headers
        assert "X-Frame-Options" in headers
        assert headers["X-Frame-Options"] == "DENY"


class TestSecretsManagement:
    """Test secrets management"""
    
    def test_secrets_loaded_from_env(self, monkeypatch):
        """Test that secrets are loaded from environment"""
        monkeypatch.setenv("TEST_SECRET", "test_value_123")
        
        manager = SecretsManager()
        value = manager.get_secret("TEST_SECRET", required=False)
        
        assert value == "test_value_123"
    
    def test_required_secret_validation(self):
        """Test that missing required secrets raise error"""
        manager = SecretsManager()
        
        with pytest.raises(ValueError, match="Required secret.*not found"):
            manager.get_secret("NONEXISTENT_REQUIRED_SECRET", required=True)
    
    def test_secret_masking(self):
        """Test that secrets are masked for logging"""
        manager = SecretsManager()
        
        secret = "sk-1234567890abcdef"
        masked = manager.mask_secret(secret, visible_chars=4)
        
        assert masked.startswith("sk-1")
        assert "*" in masked
        assert len(masked) == len(secret)
        assert "1234567890abcdef" not in masked


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

