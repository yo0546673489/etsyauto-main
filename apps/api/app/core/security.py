"""
Security Utilities for OAuth and Token Management
Provides JWT authentication, logging sanitization and security helpers
"""
import re
from typing import Any, Dict
import logging
from jose import jwt
from datetime import datetime, timedelta, timezone
from app.core.config import settings


# ==================== JWT Authentication ====================

def create_token(data: dict, expires_delta: timedelta = None) -> str:
    """
    Create a JWT token
    
    Args:
        data: Payload data to encode
        expires_delta: Token expiration time
    
    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(seconds=settings.JWT_TTL_SECONDS)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_PRIVATE_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT token
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded payload
    
    Raises:
        jwt.ExpiredSignatureError: Token has expired
        jwt.InvalidTokenError: Token is invalid
    """
    payload = jwt.decode(
        token,
        settings.JWT_PUBLIC_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        audience=settings.JWT_AUDIENCE,
        issuer=settings.JWT_ISSUER
    )
    return payload


def create_access_token(
    user_id: int,
    tenant_id: int,
    role: str,
    email: str = None,
    name: str = None,
    remember_me: bool = False,
    **kwargs
) -> str:
    """
    Create an access token with user information
    
    Args:
        user_id: User ID
        tenant_id: Tenant ID
        role: User role
        email: User email (optional)
        name: User name (optional)
        remember_me: Extend token lifetime if True
        **kwargs: Additional claims to include
    
    Returns:
        Encoded JWT access token
    """
    # Build token data
    data = {
        "sub": str(user_id),
        "id": user_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": role,
    }
    
    if email:
        data["email"] = email
    if name:
        data["name"] = name
    
    # Add any additional claims
    data.update(kwargs)
    
    # Access tokens always use the short TTL (5 min) regardless of remember_me.
    # The remember_me flag only affects refresh token lifetime, handled separately.
    return create_token(data)


def create_refresh_token(user_id: int, tenant_id: int, role: str) -> str:
    """
    Create a long-lived refresh token for cookie-based auth.
    Contains minimal claims — only enough to mint a new access token.
    """
    data = {
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "role": role,
        "type": "refresh",
    }
    expires_delta = timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)
    return create_token(data, expires_delta)


def set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """
    Set HttpOnly auth cookies on a response object.
    Works with both JSONResponse and RedirectResponse.
    """
    is_prod = settings.ENVIRONMENT == "production"
    domain = settings.COOKIE_DOMAIN or None

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_prod or settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.JWT_TTL_SECONDS,
        path="/",
        domain=domain,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod or settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
        path="/api/auth",
        domain=domain,
    )


def clear_auth_cookies(response) -> None:
    """Clear auth cookies on a response object."""
    domain = settings.COOKIE_DOMAIN or None
    response.delete_cookie(key="access_token", path="/", domain=domain)
    response.delete_cookie(key="refresh_token", path="/api/auth", domain=domain)


# ==================== Password Hashing ====================

import bcrypt


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt
    
    Args:
        password: Plain text password
    
    Returns:
        Hashed password
    """
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash
    
    Args:
        plain_password: Plain text password to check
        hashed_password: Hashed password to compare against
    
    Returns:
        True if password matches, False otherwise
    """
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)


# ==================== OAuth Security ====================


class SanitizingFormatter(logging.Formatter):
    """
    Custom log formatter that sanitizes sensitive data
    
    Prevents OAuth tokens, API keys, and other secrets from appearing in logs
    """
    
    # Patterns to detect and redact
    PATTERNS = {
        'bearer_token': (r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', 'Bearer [REDACTED]'),
        'access_token': (r'"access_token"\s*:\s*"[^"]*"', '"access_token": "[REDACTED]"'),
        'refresh_token': (r'"refresh_token"\s*:\s*"[^"]*"', '"refresh_token": "[REDACTED]"'),
        'api_key': (r'"api_key"\s*:\s*"[^"]*"', '"api_key": "[REDACTED]"'),
        'client_secret': (r'"client_secret"\s*:\s*"[^"]*"', '"client_secret": "[REDACTED]"'),
        'password': (r'"password"\s*:\s*"[^"]*"', '"password": "[REDACTED]"'),
        'authorization': (r'Authorization:\s*[^\s]+', 'Authorization: [REDACTED]'),
        'x_api_key': (r'x-api-key:\s*[^\s]+', 'x-api-key: [REDACTED]'),
        # Match tokens that look like JWTs or OAuth tokens (long alphanumeric strings)
        'long_token': (r'\b[A-Za-z0-9\-._~+/]{40,}\b', '[TOKEN_REDACTED]'),
    }
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with sensitive data redacted"""
        # Format the original message
        original_message = super().format(record)
        
        # Apply all sanitization patterns
        sanitized_message = original_message
        for pattern_name, (pattern, replacement) in self.PATTERNS.items():
            sanitized_message = re.sub(pattern, replacement, sanitized_message, flags=re.IGNORECASE)
        
        return sanitized_message


def sanitize_dict(data: Dict[str, Any], sensitive_keys: list = None) -> Dict[str, Any]:
    """
    Recursively sanitize a dictionary by redacting sensitive keys
    
    Args:
        data: Dictionary to sanitize
        sensitive_keys: List of keys to redact (default: common sensitive keys)
    
    Returns:
        Sanitized dictionary with sensitive values replaced with '[REDACTED]'
    """
    if sensitive_keys is None:
        sensitive_keys = [
            'access_token', 'refresh_token', 'token', 'api_key', 'secret',
            'client_secret', 'password', 'authorization', 'bearer',
            'private_key', 'encryption_key', 'jwt'
        ]
    
    if not isinstance(data, dict):
        return data
    
    sanitized = {}
    for key, value in data.items():
        # Check if key matches sensitive pattern
        is_sensitive = any(
            sensitive_key.lower() in key.lower() 
            for sensitive_key in sensitive_keys
        )
        
        if is_sensitive:
            # Redact sensitive values
            if value:
                sanitized[key] = '[REDACTED]'
            else:
                sanitized[key] = value
        elif isinstance(value, dict):
            # Recursively sanitize nested dictionaries
            sanitized[key] = sanitize_dict(value, sensitive_keys)
        elif isinstance(value, list):
            # Sanitize lists
            sanitized[key] = [
                sanitize_dict(item, sensitive_keys) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            sanitized[key] = value
    
    return sanitized


def mask_token(token: str, visible_chars: int = 4) -> str:
    """
    Mask a token for display purposes
    
    Args:
        token: Token to mask
        visible_chars: Number of characters to show at start and end
    
    Returns:
        Masked token like "sk_t...xyz" or "[EMPTY]"
    
    Example:
        mask_token("sk_test_abc123xyz789") -> "sk_t...x789"
    """
    if not token:
        return "[EMPTY]"
    
    if len(token) <= visible_chars * 2:
        return "*" * len(token)
    
    return f"{token[:visible_chars]}...{token[-visible_chars:]}"


def validate_redirect_uri(redirect_uri: str, allowed_domains: list) -> bool:
    """
    Validate OAuth redirect URI against allowed domains
    
    Prevents open redirect vulnerabilities
    
    Args:
        redirect_uri: URI to validate
        allowed_domains: List of allowed domain patterns
    
    Returns:
        True if valid, False otherwise
    """
    from urllib.parse import urlparse
    
    if not redirect_uri:
        return False
    
    try:
        parsed = urlparse(redirect_uri)
        
        # Must be HTTPS in production (or localhost for dev)
        if parsed.scheme not in ['https', 'http']:
            return False
        
        # Allow localhost for development
        if parsed.hostname in ['localhost', '127.0.0.1', '::1']:
            return True
        
        # Check against allowed domains
        for allowed_domain in allowed_domains:
            if parsed.hostname == allowed_domain or parsed.hostname.endswith(f'.{allowed_domain}'):
                return True
        
        return False
        
    except Exception:
        return False


def validate_state_token(state: str) -> bool:
    """
    Validate OAuth state token format
    
    State should be a URL-safe random string
    
    Args:
        state: State token to validate
    
    Returns:
        True if valid format, False otherwise
    """
    if not state:
        return False
    
    # Should be at least 16 characters
    if len(state) < 16:
        return False
    
    # Should only contain URL-safe characters
    if not re.match(r'^[A-Za-z0-9\-_]+$', state):
        return False
    
    return True


class SecurityHeaders:
    """
    Security headers for API responses
    
    Use these to add security headers to OAuth responses
    """
    
    @staticmethod
    def get_oauth_headers() -> Dict[str, str]:
        """Get security headers for OAuth endpoints"""
        return {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Referrer-Policy': 'no-referrer'
        }
    
    @staticmethod
    def get_api_headers() -> Dict[str, str]:
        """Get security headers for API endpoints"""
        return {
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        }


def rate_limit_key(tenant_id: int, shop_id: int, operation: str) -> str:
    """
    Generate Redis key for rate limiting OAuth operations
    
    Args:
        tenant_id: Tenant ID
        shop_id: Shop ID
        operation: Operation name (e.g., 'token_refresh', 'oauth_start')
    
    Returns:
        Redis key for rate limiting
    """
    return f"rate_limit:{operation}:{tenant_id}:{shop_id}"


def check_rate_limit(redis_client, key: str, max_attempts: int, window_seconds: int) -> bool:
    """
    Check if rate limit is exceeded
    
    Args:
        redis_client: Redis client instance
        key: Rate limit key
        max_attempts: Maximum attempts allowed
        window_seconds: Time window in seconds
    
    Returns:
        True if allowed, False if rate limit exceeded
    """
    try:
        # Atomic increment — if the key doesn't exist, INCR creates it with value 1.
        # We then set TTL only on the first request (when count == 1) to start the window.
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, window_seconds)

        return count <= max_attempts

    except Exception:
        # Fail open (allow the request if Redis is down)
        return True
