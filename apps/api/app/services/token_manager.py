"""
OAuth Token Manager with Single-Flight Refresh Pattern
Manages token storage, retrieval, and automatic refresh
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Tuple
from sqlalchemy.orm import Session
import redis
import json
import logging

from app.models.tenancy import Shop, OAuthToken
from app.services.encryption import token_encryptor
from app.services.etsy_oauth import etsy_oauth
from app.core.config import settings

logger = logging.getLogger(__name__)


class TokenRefreshError(Exception):
    """Raised when token refresh fails"""
    pass


class TokenManager:
    """
    Manages OAuth tokens with encryption, caching, and single-flight refresh
    
    Features:
    - Encrypted token storage
    - Redis caching for fast access
    - Single-flight refresh (prevents thundering herd)
    - Automatic token refresh on expiry
    - Proactive refresh before expiry
    """
    
    def __init__(self, db: Session, redis_client: redis.Redis):
        self.db = db
        self.redis = redis_client
        self._refresh_locks: Dict[str, asyncio.Lock] = {}  # In-memory locks for single-flight
    
    def _get_cache_key(self, tenant_id: int, shop_id: int, provider: str = 'etsy') -> str:
        """Generate Redis cache key for tokens"""
        return f"oauth_token:{provider}:{tenant_id}:{shop_id}"
    
    def _get_refresh_lock_key(self, tenant_id: int, shop_id: int, provider: str = 'etsy') -> str:
        """Generate key for refresh lock"""
        return f"refresh_lock:{provider}:{tenant_id}:{shop_id}"
    
    async def get_refresh_lock(self, tenant_id: int, shop_id: int, provider: str = 'etsy') -> asyncio.Lock:
        """
        Get or create a lock for token refresh (single-flight pattern)
        
        This ensures only one coroutine refreshes a token at a time
        """
        lock_key = self._get_refresh_lock_key(tenant_id, shop_id, provider)
        if lock_key not in self._refresh_locks:
            self._refresh_locks[lock_key] = asyncio.Lock()
        return self._refresh_locks[lock_key]
    
    async def get_token(
        self, 
        tenant_id: int, 
        shop_id: int, 
        provider: str = 'etsy',
        auto_refresh: bool = True
    ) -> Optional[str]:
        """
        Get decrypted access token for a shop
        
        Args:
            tenant_id: Tenant ID
            shop_id: Shop ID
            provider: OAuth provider (default: 'etsy')
            auto_refresh: Automatically refresh if expired (default: True)
        
        Returns:
            Decrypted access token or None if not found
        """
        cache_key = self._get_cache_key(tenant_id, shop_id, provider)
        
        # Try cache first
        cached_data = self.redis.get(cache_key)
        if cached_data:
            try:
                data = json.loads(cached_data)
                expires_at = datetime.fromisoformat(data['expires_at'])
                
                # Check if token is still valid (with 5-minute buffer)
                if datetime.now(timezone.utc) < expires_at - timedelta(minutes=5):
                    return data['access_token']
                
                # Token is expired or about to expire - refresh it
                if auto_refresh:
                    logger.info(f"Cached token expired for shop {shop_id}, refreshing...")
                    return await self.refresh_token(tenant_id, shop_id, provider)
                
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.warning(f"Invalid cached token data: {e}")
                # Fall through to database
        
        # Get from database
        oauth_token = self.db.query(OAuthToken).filter(
            OAuthToken.tenant_id == tenant_id,
            OAuthToken.shop_id == shop_id,
            OAuthToken.provider == provider
        ).first()
        
        if not oauth_token:
            logger.warning(f"No OAuth token found for shop {shop_id}")
            return None
        
        # Check expiry
        now = datetime.now(timezone.utc)
        if auto_refresh and oauth_token.expires_at <= now + timedelta(minutes=5):
            logger.info(f"Token expired for shop {shop_id}, refreshing...")
            return await self.refresh_token(tenant_id, shop_id, provider)
        
        # Decrypt and cache
        try:
            decrypted_token = token_encryptor.decrypt(oauth_token.access_token)
            
            # Cache for fast future access (cache until 5 minutes before expiry)
            cache_ttl = int((oauth_token.expires_at - now).total_seconds()) - 300
            if cache_ttl > 0:
                cache_data = {
                    'access_token': decrypted_token,
                    'expires_at': oauth_token.expires_at.isoformat()
                }
                self.redis.setex(cache_key, cache_ttl, json.dumps(cache_data))
            
            return decrypted_token
            
        except Exception as e:
            logger.error(f"Failed to decrypt token for shop {shop_id}: {e}")
            return None
    
    async def refresh_token(
        self, 
        tenant_id: int, 
        shop_id: int, 
        provider: str = 'etsy'
    ) -> Optional[str]:
        """
        Refresh an expired OAuth token (single-flight pattern)
        
        Uses distributed locking to ensure only one refresh happens at a time
        even across multiple workers/instances.
        
        Args:
            tenant_id: Tenant ID
            shop_id: Shop ID
            provider: OAuth provider
        
        Returns:
            New access token or None if refresh failed
        """
        lock_key = f"token_refresh_lock:{provider}:{tenant_id}:{shop_id}"
        
        # Try to acquire distributed lock with 30-second timeout
        lock_acquired = self.redis.set(
            lock_key,
            "1",
            nx=True,  # Only set if doesn't exist
            ex=30  # Lock expires in 30 seconds
        )
        
        if not lock_acquired:
            # Another process is refreshing - wait for it to complete
            logger.info(f"Token refresh in progress for shop {shop_id}, waiting...")
            
            # Poll for completion (max 25 seconds)
            for attempt in range(50):  # 50 * 0.5s = 25s
                await asyncio.sleep(0.5)
                
                # Check if lock is released
                if not self.redis.exists(lock_key):
                    # Refresh complete, try to get the new token
                    return await self.get_token(tenant_id, shop_id, provider, auto_refresh=False)
            
            # Timeout waiting for other refresh
            logger.error(f"Timeout waiting for token refresh for shop {shop_id}")
            return None
        
        try:
            # We have the lock - perform refresh
            logger.info(f"Acquired lock, refreshing token for shop {shop_id}")
            
            # Get current token record
            oauth_token = self.db.query(OAuthToken).filter(
                OAuthToken.tenant_id == tenant_id,
                OAuthToken.shop_id == shop_id,
                OAuthToken.provider == provider
            ).first()
            
            if not oauth_token or not oauth_token.refresh_token:
                logger.error(f"No refresh token found for shop {shop_id}")
                return None
            
            # Decrypt refresh token
            refresh_token = token_encryptor.decrypt(oauth_token.refresh_token)
            
            # Call OAuth provider to refresh
            if provider == 'etsy':
                try:
                    new_token_data = await etsy_oauth.refresh_access_token(refresh_token)
                except Exception as e:
                    logger.error(f"Etsy token refresh failed for shop {shop_id}: {e}")
                    raise TokenRefreshError(f"Failed to refresh token: {e}")
            else:
                raise ValueError(f"Unsupported provider: {provider}")
            
            # Update database with new tokens (encrypted)
            oauth_token.access_token = token_encryptor.encrypt(new_token_data["access_token"])
            
            # Etsy may return a new refresh token
            if "refresh_token" in new_token_data:
                oauth_token.refresh_token = token_encryptor.encrypt(new_token_data["refresh_token"])
            
            oauth_token.expires_at = datetime.now(timezone.utc) + timedelta(seconds=new_token_data["expires_in"])
            oauth_token.last_refreshed_at = datetime.now(timezone.utc)
            oauth_token.refresh_count = (oauth_token.refresh_count or 0) + 1
            oauth_token.updated_at = datetime.now(timezone.utc)
            
            self.db.commit()
            self.db.refresh(oauth_token)
            
            # Update cache
            cache_key = self._get_cache_key(tenant_id, shop_id, provider)
            cache_ttl = new_token_data["expires_in"] - 300  # Cache until 5 min before expiry
            if cache_ttl > 0:
                cache_data = {
                    'access_token': new_token_data["access_token"],
                    'expires_at': oauth_token.expires_at.isoformat()
                }
                self.redis.setex(cache_key, cache_ttl, json.dumps(cache_data))
            
            logger.info(f"Successfully refreshed token for shop {shop_id}")
            return new_token_data["access_token"]
            
        except Exception as e:
            logger.error(f"Token refresh failed for shop {shop_id}: {e}")
            self.db.rollback()
            raise
            
        finally:
            # Always release the lock
            self.redis.delete(lock_key)
    
    async def save_token(
        self,
        tenant_id: int,
        shop_id: int,
        access_token: str,
        refresh_token: str,
        expires_in: int,
        provider: str = 'etsy',
        scopes: Optional[str] = None
    ) -> OAuthToken:
        """
        Save or update OAuth token with encryption
        
        Args:
            tenant_id: Tenant ID
            shop_id: Shop ID
            access_token: Plain text access token
            refresh_token: Plain text refresh token
            expires_in: Token lifetime in seconds
            provider: OAuth provider
            scopes: Space-separated scopes
        
        Returns:
            Saved OAuthToken record
        """
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        
        # Encrypt tokens
        encrypted_access = token_encryptor.encrypt(access_token)
        encrypted_refresh = token_encryptor.encrypt(refresh_token)
        
        # Check if token exists
        existing_token = self.db.query(OAuthToken).filter(
            OAuthToken.shop_id == shop_id,
            OAuthToken.provider == provider
        ).first()
        
        if existing_token:
            # Update existing
            existing_token.tenant_id = tenant_id
            existing_token.access_token = encrypted_access
            existing_token.refresh_token = encrypted_refresh
            existing_token.expires_at = expires_at
            existing_token.scopes = scopes
            existing_token.updated_at = datetime.now(timezone.utc)
            oauth_token = existing_token
        else:
            # Create new
            oauth_token = OAuthToken(
                tenant_id=tenant_id,
                shop_id=shop_id,
                provider=provider,
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
                expires_at=expires_at,
                scopes=scopes,
                refresh_count=0
            )
            self.db.add(oauth_token)
        
        self.db.commit()
        self.db.refresh(oauth_token)
        
        # Cache the new token
        cache_key = self._get_cache_key(tenant_id, shop_id, provider)
        cache_ttl = expires_in - 300  # Cache until 5 min before expiry
        if cache_ttl > 0:
            cache_data = {
                'access_token': access_token,
                'expires_at': expires_at.isoformat()
            }
            self.redis.setex(cache_key, cache_ttl, json.dumps(cache_data))
        
        logger.info(f"Saved OAuth token for shop {shop_id}, expires at {expires_at}")
        return oauth_token
    
    async def revoke_token(self, tenant_id: int, shop_id: int, provider: str = 'etsy') -> bool:
        """
        Revoke and delete OAuth token
        
        Args:
            tenant_id: Tenant ID
            shop_id: Shop ID
            provider: OAuth provider
        
        Returns:
            True if token was deleted
        """
        oauth_token = self.db.query(OAuthToken).filter(
            OAuthToken.tenant_id == tenant_id,
            OAuthToken.shop_id == shop_id,
            OAuthToken.provider == provider
        ).first()
        
        if oauth_token:
            self.db.delete(oauth_token)
            self.db.commit()
            
            # Clear cache
            cache_key = self._get_cache_key(tenant_id, shop_id, provider)
            self.redis.delete(cache_key)
            
            logger.info(f"Revoked OAuth token for shop {shop_id}")
            return True
        
        return False
    
    async def get_tokens_expiring_soon(self, hours: int = 24) -> list:
        """
        Get all tokens expiring within the specified hours, including already expired ones.
        """
        threshold = datetime.now(timezone.utc) + timedelta(hours=hours)
        
        tokens = self.db.query(OAuthToken).filter(
            OAuthToken.expires_at <= threshold
        ).all()
        
        return tokens


# Helper function to get token manager instance
def get_token_manager(db: Session, redis_client: redis.Redis) -> TokenManager:
    """Factory function to create TokenManager instance"""
    return TokenManager(db, redis_client)

