"""
Application Configuration
Using Pydantic Settings for environment variable management
"""
import logging
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "Etsy Automation Platform"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v):  # noqa: B902
        """Accept bool or string (e.g. WARN, true, false) for DEBUG."""
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes")
        return False
    

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/etsy_platform"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_PRIVATE_KEY: str = ""
    JWT_PUBLIC_KEY: str = ""
    JWT_ALGORITHM: str = "RS256"
    JWT_ISSUER: str = "api"
    JWT_AUDIENCE: str = "api"
    JWT_TTL_SECONDS: int = 300  # 5 minutes

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Restore newlines in PEM keys if they were stored without newlines in env
        # PEM format requires newlines, but env vars are often stored as single lines
        if self.JWT_PRIVATE_KEY and '-----BEGIN' in self.JWT_PRIVATE_KEY and '\n' not in self.JWT_PRIVATE_KEY:
            # Restore newlines: add \n after header, before footer, and every 64 chars in between
            private_key = self.JWT_PRIVATE_KEY
            if 'BEGIN RSA PRIVATE KEY' in private_key:
                private_key = private_key.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n')
                private_key = private_key.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----')
            elif 'BEGIN PRIVATE KEY' in private_key:
                private_key = private_key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
                private_key = private_key.replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----')
            # Insert newlines every 64 characters in the key body
            parts = private_key.split('\n')
            if len(parts) == 3:  # header, body, footer
                body = parts[1]
                body_with_newlines = '\n'.join([body[i:i+64] for i in range(0, len(body), 64)])
                self.JWT_PRIVATE_KEY = f"{parts[0]}\n{body_with_newlines}\n{parts[2]}"
            else:
                self.JWT_PRIVATE_KEY = private_key
        
        if self.JWT_PUBLIC_KEY and '-----BEGIN' in self.JWT_PUBLIC_KEY and '\n' not in self.JWT_PUBLIC_KEY:
            public_key = self.JWT_PUBLIC_KEY
            if 'BEGIN PUBLIC KEY' in public_key:
                public_key = public_key.replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
                public_key = public_key.replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----')
            # Insert newlines every 64 characters in the key body
            parts = public_key.split('\n')
            if len(parts) == 3:  # header, body, footer
                body = parts[1]
                body_with_newlines = '\n'.join([body[i:i+64] for i in range(0, len(body), 64)])
                self.JWT_PUBLIC_KEY = f"{parts[0]}\n{body_with_newlines}\n{parts[2]}"
            else:
                self.JWT_PUBLIC_KEY = public_key
        
        # Load JWT keys from files only if not set via environment variables
        if not self.JWT_PRIVATE_KEY or not self.JWT_PUBLIC_KEY:
            try:
                with open('private.pem', 'r') as f:
                    self.JWT_PRIVATE_KEY = f.read()
                with open('public.pem', 'r') as f:
                    self.JWT_PUBLIC_KEY = f.read()
            except FileNotFoundError:
                if not self.JWT_PRIVATE_KEY or not self.JWT_PUBLIC_KEY:
                    logger.warning("JWT keys not found in files or environment. Authentication will not work.")

    # CORS
    CORS_ORIGINS: List[str] = [
        "https://etsyauto.bigbotdrivers.com",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
    ]

    # Super-admin portal (Next.js on :3002); used for CSRF trusted origins in dev
    ADMIN_PORTAL_SECRET: str = ""
    CSRF_TRUSTED_ORIGINS: List[str] = []

    # Exchange Rate API (Frankfurter - free, no key, historical support)
    EXCHANGE_RATE_API_URL: str = "https://api.frankfurter.dev/v1"

    # Etsy API
    ETSY_CLIENT_ID: str = ""
    ETSY_CLIENT_SECRET: str = ""
    ETSY_REDIRECT_URI: str = "http://localhost:3000/oauth/etsy/callback"
    ETSY_API_BASE_URL: str = "https://openapi.etsy.com/v3"
    ETSY_WEBHOOK_SECRET: str = ""  # Secret for verifying webhook signatures
    ETSY_RATE_LIMIT_CAPACITY: int = 100
    ETSY_RATE_LIMIT_REFILL_PER_SEC: float = 0.5

    # Feature Flags
    ENABLE_SCHEDULED_PUBLISHING: bool = True

    # Monitoring
    SENTRY_DSN: str = ""

    # Storage (optional)
    S3_BUCKET: str = ""
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # AdsPower (browser profiles for messaging automation)
    ADSPOWER_BASE_URL: str = ""
    ADSPOWER_API_KEY: str = ""

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Security
    ENCRYPTION_KEY: str = ""  # 32-byte key for AES-GCM

    # Email Configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Etsy Automation Platform"
    FRONTEND_URL: str = "http://localhost:3000"

    # Resend Configuration (Recommended)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@yourdomain.com"
    USE_RESEND: bool = False

    # Auth Configuration
    EMAIL_VERIFICATION_REQUIRED: bool = True
    VERIFICATION_TOKEN_EXPIRY_HOURS: int = 24
    RESET_TOKEN_EXPIRY_HOURS: int = 1
    MAX_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 30
    REMEMBER_ME_TTL_DAYS: int = 30

    # Cookie Configuration (HttpOnly JWT)
    COOKIE_DOMAIN: str = ""  # Empty = auto (current domain)
    COOKIE_SECURE: bool = False  # Auto-derived from ENVIRONMENT if not explicitly set
    COOKIE_SAMESITE: str = "lax"
    REFRESH_TOKEN_TTL_DAYS: int = 30

    # Upload limits
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/api/oauth/google/callback"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


# Global settings instance
settings = Settings()
