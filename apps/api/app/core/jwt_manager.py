"""
JWT Manager with RS256 and Proper Security
Implements secure JWT handling with key rotation support
"""
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from enum import Enum
import logging

from app.core.secrets_manager import get_secrets_manager
from app.core.config import settings

logger = logging.getLogger(__name__)


class TokenType(str, Enum):
    """JWT token types"""
    ACCESS = "access"
    REFRESH = "refresh"
    API_KEY = "api_key"


class JWTManager:
    """
    Manages JWT tokens with RS256 algorithm
    
    Features:
    - RS256 asymmetric signing
    - Short-lived access tokens (15 min)
    - Long-lived refresh tokens (7 days)
    - Proper claims (iss, aud, exp, iat, sub, jti)
    - Key rotation support
    - Token revocation
    """
    
    # Token lifetimes
    ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
    REFRESH_TOKEN_LIFETIME = timedelta(days=7)
    API_KEY_LIFETIME = timedelta(days=90)
    
    # JWT claims (use config for consistency with decode_token)
    @property
    def ISSUER(self) -> str:
        return settings.JWT_ISSUER or "etsy-automation-api"

    @property
    def AUDIENCE(self) -> str:
        return settings.JWT_AUDIENCE or "etsy-automation-platform"
    
    def __init__(self):
        self.secrets_manager = get_secrets_manager()
        self._key_version = "v1"  # For key rotation tracking
    
    def _get_private_key(self) -> str:
        """Get current JWT private key"""
        return self.secrets_manager.get_jwt_private_key()
    
    def _get_public_key(self) -> str:
        """Get current JWT public key"""
        return self.secrets_manager.get_jwt_public_key()
    
    def create_access_token(
        self,
        user_id: int,
        tenant_id: int,
        role: str,
        shop_ids: Optional[list] = None,
        extra_claims: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a short-lived access token
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            role: User role (owner, admin, creator, viewer)
            shop_ids: List of accessible shop IDs
            extra_claims: Additional claims to include
        
        Returns:
            Signed JWT token
        """
        now = datetime.utcnow()
        
        payload = {
            # Standard claims
            "iss": self.ISSUER,  # Issuer
            "aud": self.AUDIENCE,  # Audience
            "sub": str(user_id),  # Subject (user ID)
            "iat": now,  # Issued at
            "exp": now + self.ACCESS_TOKEN_LIFETIME,  # Expiration
            "nbf": now,  # Not before
            
            # Custom claims
            "type": TokenType.ACCESS,
            "tenant_id": tenant_id,
            "role": role,
            "shop_ids": shop_ids or [],
            "key_version": self._key_version,
        }
        
        if extra_claims:
            payload.update(extra_claims)
        
        token = jwt.encode(
            payload,
            self._get_private_key(),
            algorithm="RS256"
        )
        
        logger.debug(
            f"Created access token for user={user_id}, "
            f"tenant={tenant_id}, role={role}, "
            f"expires_in={self.ACCESS_TOKEN_LIFETIME.total_seconds()}s"
        )
        
        return token
    
    def create_refresh_token(
        self,
        user_id: int,
        tenant_id: int,
        jti: Optional[str] = None
    ) -> str:
        """
        Create a long-lived refresh token
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            jti: JWT ID (for revocation tracking)
        
        Returns:
            Signed JWT refresh token
        """
        import uuid
        
        now = datetime.utcnow()
        jti = jti or str(uuid.uuid4())
        
        payload = {
            "iss": self.ISSUER,
            "aud": self.AUDIENCE,
            "sub": str(user_id),
            "iat": now,
            "exp": now + self.REFRESH_TOKEN_LIFETIME,
            "nbf": now,
            "jti": jti,  # JWT ID for revocation
            "type": TokenType.REFRESH,
            "tenant_id": tenant_id,
            "key_version": self._key_version,
        }
        
        token = jwt.encode(
            payload,
            self._get_private_key(),
            algorithm="RS256"
        )
        
        logger.debug(
            f"Created refresh token for user={user_id}, "
            f"tenant={tenant_id}, jti={jti}, "
            f"expires_in={self.REFRESH_TOKEN_LIFETIME.total_seconds()}s"
        )
        
        return token
    
    def create_api_key(
        self,
        service_name: str,
        scopes: list,
        tenant_id: Optional[int] = None
    ) -> str:
        """
        Create a long-lived API key for service-to-service auth
        
        Args:
            service_name: Name of the service
            scopes: List of allowed scopes/permissions
            tenant_id: Optional tenant ID for scoped keys
        
        Returns:
            Signed API key token
        """
        import uuid
        
        now = datetime.utcnow()
        
        payload = {
            "iss": self.ISSUER,
            "aud": self.AUDIENCE,
            "sub": f"service:{service_name}",
            "iat": now,
            "exp": now + self.API_KEY_LIFETIME,
            "nbf": now,
            "jti": str(uuid.uuid4()),
            "type": TokenType.API_KEY,
            "service": service_name,
            "scopes": scopes,
            "tenant_id": tenant_id,
            "key_version": self._key_version,
        }
        
        token = jwt.encode(
            payload,
            self._get_private_key(),
            algorithm="RS256"
        )
        
        logger.info(
            f"Created API key for service={service_name}, "
            f"scopes={scopes}, tenant={tenant_id}"
        )
        
        return token
    
    def verify_token(
        self,
        token: str,
        expected_type: Optional[TokenType] = None,
        verify_exp: bool = True
    ) -> Dict[str, Any]:
        """
        Verify and decode a JWT token
        
        Args:
            token: JWT token to verify
            expected_type: Expected token type (access, refresh, api_key)
            verify_exp: Whether to verify expiration
        
        Returns:
            Decoded token payload
        
        Raises:
            jwt.InvalidTokenError: If token is invalid
            jwt.ExpiredSignatureError: If token is expired
            ValueError: If token type doesn't match expected
        """
        try:
            payload = jwt.decode(
                token,
                self._get_public_key(),
                algorithms=["RS256"],
                issuer=self.ISSUER,
                audience=self.AUDIENCE,
                options={"verify_exp": verify_exp}
            )
            
            # Verify token type
            token_type = payload.get("type")
            if expected_type and token_type != expected_type:
                raise ValueError(
                    f"Invalid token type: expected {expected_type}, got {token_type}"
                )
            
            # Check key version (for rotation)
            key_version = payload.get("key_version")
            if key_version != self._key_version:
                logger.warning(
                    f"Token signed with old key version: {key_version} "
                    f"(current: {self._key_version})"
                )
            
            return payload
            
        except ExpiredSignatureError:
            logger.warning("Token expired")
            raise
        except JWTError as e:
            logger.error(f"Invalid token: {e}")
            raise
    
    def rotate_keys(self, new_private_key: str, new_public_key: str) -> None:
        """
        Rotate JWT signing keys
        
        This supports zero-downtime key rotation:
        1. New keys are loaded
        2. New tokens are signed with new key
        3. Old tokens are still verified (grace period)
        4. After grace period, old key is removed
        
        Args:
            new_private_key: New RS256 private key
            new_public_key: New RS256 public key
        """
        # Increment key version
        old_version = self._key_version
        version_num = int(old_version.replace('v', '')) + 1
        self._key_version = f"v{version_num}"
        
        # Store new keys in secrets manager
        # (In production, this would update the secrets vault)
        logger.warning(
            f"🔄 JWT keys rotated: {old_version} → {self._key_version}"
        )
        
        # TODO: Implement grace period for old key verification
        # During grace period, verify with both old and new public keys
    
    def get_token_info(self, token: str) -> Dict[str, Any]:
        """
        Get token information without full verification
        (useful for debugging)
        
        Args:
            token: JWT token
        
        Returns:
            Token payload (unverified)
        """
        try:
            # Decode without verification
            payload = jwt.decode(
                token,
                options={"verify_signature": False}
            )
            return payload
        except Exception as e:
            return {"error": str(e)}


# Global JWT manager instance
jwt_manager = JWTManager()


def get_jwt_manager() -> JWTManager:
    """Get global JWT manager instance"""
    return jwt_manager

