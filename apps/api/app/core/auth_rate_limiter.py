"""
Authentication Rate Limiting
Protects auth endpoints from brute force and abuse
"""
import time
from typing import Optional
from fastapi import HTTPException, status, Request
from redis import Redis
from app.core.redis import get_redis_client
import logging

logger = logging.getLogger(__name__)


class AuthRateLimiter:
    """
    Rate limiter for authentication endpoints using Redis
    Implements sliding window counter algorithm
    """
    
    # Rate limits (requests per time window)
    GOOGLE_OAUTH_LIMIT = 10  # 10 requests per minute per IP
    GOOGLE_OAUTH_WINDOW = 60  # 60 seconds
    
    LOGIN_LIMIT = 5  # 5 attempts per 5 minutes per IP
    LOGIN_WINDOW = 300  # 300 seconds (5 minutes)
    
    def __init__(self, redis_client: Optional[Redis] = None):
        self.redis = redis_client or get_redis_client()
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        # Check for forwarded IP (behind proxy/load balancer)
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        
        real_ip = request.headers.get('X-Real-IP')
        if real_ip:
            return real_ip
        
        # Fallback to direct client IP
        if request.client:
            return request.client.host
        
        return 'unknown'
    
    def _get_key(self, endpoint: str, identifier: str) -> str:
        """Generate Redis key for rate limit tracking"""
        return f"rate_limit:auth:{endpoint}:{identifier}"
    
    def check_rate_limit(
        self,
        request: Request,
        endpoint: str,
        limit: int,
        window: int,
        identifier: Optional[str] = None
    ) -> bool:
        """
        Check if request is within rate limit
        
        Args:
            request: FastAPI request object
            endpoint: Endpoint name (e.g., 'google_oauth', 'login')
            limit: Maximum requests allowed
            window: Time window in seconds
            identifier: Optional custom identifier (defaults to IP)
        
        Returns:
            True if within limit, raises HTTPException if exceeded
        
        Raises:
            HTTPException: 429 Too Many Requests if rate limit exceeded
        """
        if not self.redis:
            logger.warning("Redis not available, skipping rate limiting")
            return True
        
        # Use IP address as identifier if not provided
        identifier = identifier or self._get_client_ip(request)
        key = self._get_key(endpoint, identifier)
        
        try:
            # Get current count
            current = self.redis.get(key)
            count = int(current) if current else 0
            
            if count >= limit:
                # Rate limit exceeded
                ttl = self.redis.ttl(key)
                retry_after = ttl if ttl > 0 else window
                
                logger.warning(
                    f"Rate limit exceeded for {endpoint}: "
                    f"identifier={identifier}, count={count}, limit={limit}"
                )
                
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many {endpoint} attempts. Please try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)}
                )
            
            # Increment counter
            pipe = self.redis.pipeline()
            pipe.incr(key)
            if count == 0:
                # Set expiry on first request
                pipe.expire(key, window)
            pipe.execute()
            
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limiting error: {str(e)}", exc_info=True)
            # Fail open - allow request if rate limiting fails
            return True
    
    def check_google_oauth_limit(self, request: Request) -> bool:
        """Check rate limit for Google OAuth endpoint"""
        return self.check_rate_limit(
            request,
            'google_oauth',
            self.GOOGLE_OAUTH_LIMIT,
            self.GOOGLE_OAUTH_WINDOW
        )
    
    def check_login_limit(self, request: Request, email: str) -> bool:
        """
        Check rate limit for login endpoint
        Uses both IP and email to prevent brute force
        """
        ip = self._get_client_ip(request)
        identifier = f"{ip}:{email}"
        
        return self.check_rate_limit(
            request,
            'login',
            self.LOGIN_LIMIT,
            self.LOGIN_WINDOW,
            identifier
        )


# Global rate limiter instance
_auth_rate_limiter: Optional[AuthRateLimiter] = None


def get_auth_rate_limiter() -> AuthRateLimiter:
    """Get or create global auth rate limiter instance"""
    global _auth_rate_limiter
    if _auth_rate_limiter is None:
        _auth_rate_limiter = AuthRateLimiter()
    return _auth_rate_limiter

