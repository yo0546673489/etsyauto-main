"""
Secure Cookie Management
Implements secure cookie settings for production
"""
from typing import Optional
from datetime import timedelta
from starlette.responses import Response
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class CookieManager:
    """
    Manages secure cookie settings
    
    Features:
    - HttpOnly cookies (prevent XSS)
    - SameSite protection (prevent CSRF)
    - Secure flag in production (HTTPS only)
    - Proper max-age and expiration
    """
    
    # Cookie names
    ACCESS_TOKEN_COOKIE = "access_token"
    REFRESH_TOKEN_COOKIE = "refresh_token"
    CSRF_TOKEN_COOKIE = "csrf_token"
    
    # Cookie lifetimes
    ACCESS_TOKEN_MAX_AGE = 15 * 60  # 15 minutes
    REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60  # 7 days
    
    def __init__(self):
        self.is_production = settings.ENVIRONMENT == "production"
        self.domain = settings.COOKIE_DOMAIN or None
    
    def set_access_token_cookie(
        self,
        response: Response,
        token: str,
        max_age: Optional[int] = None
    ) -> None:
        """
        Set access token cookie with secure settings
        
        Args:
            response: FastAPI response object
            token: JWT access token
            max_age: Cookie max age in seconds (default: 15 min)
        """
        response.set_cookie(
            key=self.ACCESS_TOKEN_COOKIE,
            value=token,
            max_age=max_age or self.ACCESS_TOKEN_MAX_AGE,
            httponly=True,  # Prevent JavaScript access (XSS protection)
            secure=self.is_production,  # HTTPS only in production
            samesite="lax",  # CSRF protection (allows top-level navigation)
            domain=self.domain,
            path="/",
        )
        
        logger.debug(
            f"Set access token cookie: "
            f"httponly=True, secure={self.is_production}, samesite=lax"
        )
    
    def set_refresh_token_cookie(
        self,
        response: Response,
        token: str,
        max_age: Optional[int] = None
    ) -> None:
        """
        Set refresh token cookie with strict security
        
        Args:
            response: FastAPI response object
            token: JWT refresh token
            max_age: Cookie max age in seconds (default: 7 days)
        """
        response.set_cookie(
            key=self.REFRESH_TOKEN_COOKIE,
            value=token,
            max_age=max_age or self.REFRESH_TOKEN_MAX_AGE,
            httponly=True,  # Prevent JavaScript access
            secure=self.is_production,  # HTTPS only in production
            samesite="strict",  # Strict CSRF protection (no cross-site requests)
            domain=self.domain,
            path="/api/auth/refresh",  # Only sent to refresh endpoint
        )
        
        logger.debug(
            f"Set refresh token cookie: "
            f"httponly=True, secure={self.is_production}, samesite=strict, path=/api/auth/refresh"
        )
    
    def set_csrf_token_cookie(
        self,
        response: Response,
        token: str,
        max_age: Optional[int] = None
    ) -> None:
        """
        Set CSRF token cookie (readable by JavaScript for request headers)
        
        Args:
            response: FastAPI response object
            token: CSRF token
            max_age: Cookie max age in seconds
        """
        response.set_cookie(
            key=self.CSRF_TOKEN_COOKIE,
            value=token,
            max_age=max_age or self.ACCESS_TOKEN_MAX_AGE,
            httponly=False,  # Must be readable by JavaScript
            secure=self.is_production,
            samesite="strict",  # Strict for CSRF token
            domain=self.domain,
            path="/",
        )
        
        logger.debug("Set CSRF token cookie")
    
    def delete_access_token_cookie(self, response: Response) -> None:
        """Delete access token cookie (logout)"""
        response.delete_cookie(
            key=self.ACCESS_TOKEN_COOKIE,
            domain=self.domain,
            path="/"
        )
        logger.debug("Deleted access token cookie")
    
    def delete_refresh_token_cookie(self, response: Response) -> None:
        """Delete refresh token cookie (logout)"""
        response.delete_cookie(
            key=self.REFRESH_TOKEN_COOKIE,
            domain=self.domain,
            path="/api/auth/refresh"
        )
        logger.debug("Deleted refresh token cookie")
    
    def delete_all_auth_cookies(self, response: Response) -> None:
        """Delete all authentication cookies (full logout)"""
        self.delete_access_token_cookie(response)
        self.delete_refresh_token_cookie(response)
        response.delete_cookie(
            key=self.CSRF_TOKEN_COOKIE,
            domain=self.domain,
            path="/"
        )
        logger.info("Deleted all auth cookies")
    
    def get_cookie_security_headers(self) -> dict:
        """
        Get security headers for cookie protection
        
        Returns:
            Dict of security headers
        """
        headers = {
            # Prevent MIME sniffing
            "X-Content-Type-Options": "nosniff",
            
            # XSS protection
            "X-XSS-Protection": "1; mode=block",
            
            # Frame protection (prevent clickjacking)
            "X-Frame-Options": "DENY",
            
            # Referrer policy
            "Referrer-Policy": "strict-origin-when-cross-origin",
        }
        
        if self.is_production:
            # Strict Transport Security (HTTPS only)
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return headers


# Global cookie manager instance
cookie_manager = CookieManager()


def get_cookie_manager() -> CookieManager:
    """Get global cookie manager instance"""
    return cookie_manager

