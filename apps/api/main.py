"""
Etsy Automation Platform - FastAPI Backend
Main application entry point
"""
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from prometheus_client import make_asgi_app

from app.core.config import settings

logger = logging.getLogger(__name__)
from app.core.sentry_config import initialize_sentry
from app.core.logging_redaction import setup_log_redaction
from sqlalchemy import text
from app.core.database import engine, Base
import app.models  # noqa: F401 — register all models on Base.metadata for create_all
from app.api.endpoints import auth, shops, products, team, onboarding, dashboard, orders, notifications, audit, google_oauth, ingestion, audit_logs, webhooks, analytics, financials, user_preferences, currency
from app.api.endpoints import admin as admin_endpoint
from app.api.endpoints import messaging_activation as messaging_activation_endpoint
from app.api.endpoints.control_panel import router as cp_router
from app.api.endpoints import metrics as metrics_endpoint
from app.middleware.tenant_context import TenantContextMiddleware
from app.middleware.metrics_middleware import MetricsMiddleware
from app.middleware.sentry_middleware import SentryContextMiddleware
from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.idempotency import IdempotencyMiddleware
from app.middleware.content_length_fix import ContentLengthFixMiddleware
from app.middleware.csrf_middleware import CSRFMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from routers import messages as messages_router

# Initialize logging redaction and Sentry
setup_log_redaction()
initialize_sentry()


def _validate_env() -> None:
    """
    Validate critical environment variables at startup.
    Raises RuntimeError with a clear message if anything is missing.
    """
    errors: list[str] = []

    if not settings.DATABASE_URL:
        errors.append("DATABASE_URL is not set")

    if not settings.JWT_PRIVATE_KEY:
        errors.append("JWT_PRIVATE_KEY is not set")
    if not settings.JWT_PUBLIC_KEY:
        errors.append("JWT_PUBLIC_KEY is not set")

    if not settings.REDIS_URL and not settings.CELERY_BROKER_URL:
        errors.append("Neither REDIS_URL nor CELERY_BROKER_URL is set")

    allowed_envs = {"development", "staging", "production"}
    if settings.ENVIRONMENT not in allowed_envs:
        errors.append(
            f"ENVIRONMENT must be one of {allowed_envs}, got '{settings.ENVIRONMENT}'"
        )

    # Stricter checks in production
    if settings.ENVIRONMENT == "production":
        if not settings.CORS_ORIGINS:
            errors.append("CORS_ORIGINS must not be empty in production")
        if not settings.ETSY_CLIENT_ID:
            errors.append("ETSY_CLIENT_ID is required in production")
        if not settings.ETSY_CLIENT_SECRET:
            errors.append("ETSY_CLIENT_SECRET is required in production")
        if not settings.ENCRYPTION_KEY:
            errors.append("ENCRYPTION_KEY is required in production (32-byte base64-encoded key for AES-GCM)")
        if settings.DEBUG:
            errors.append("DEBUG must be False in production")
        if not settings.COOKIE_SECURE:
            errors.append("COOKIE_SECURE must be True in production (requires HTTPS)")

    if errors:
        msg = "Startup ENV validation failed:\n  - " + "\n  - ".join(errors)
        logger.critical(msg)
        raise RuntimeError(msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup — validate environment first
    _validate_env()

    logger.info("Starting Etsy Automation Platform API...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"JWT Issuer: {settings.JWT_ISSUER}")

    # Create tables (for dev - use Alembic in prod)
    if settings.ENVIRONMENT == "development":
        # Ensure citext extension is available (required for case-insensitive email column)
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
            conn.commit()
        Base.metadata.create_all(bind=engine)

    yield

    # Shutdown
    logger.info("Shutting down API...")


# Create FastAPI app — disable API docs in production
_is_production = settings.ENVIRONMENT == "production"
app = FastAPI(
    title="Etsy Automation Platform API",
    description="Etsy listing and order automation for sellers",
    version="1.0.0",
    redirect_slashes=False,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    lifespan=lifespan,
)


class CustomCORSMiddleware:
    """
    Pure-ASGI CORS middleware.  Avoids BaseHTTPMiddleware to prevent the
    'Response content longer than Content-Length' RuntimeError caused by
    body-re-streaming in stacked BaseHTTPMiddleware layers.
    """

    def __init__(self, app, allowed_origins: list[str] | None = None, allow_all: bool = False) -> None:
        self.app = app
        self.allowed_origins = allowed_origins or []
        self.allow_all = allow_all

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        headers_raw = scope.get("headers", [])
        origin = None
        method = scope.get("method", "")
        for k, v in headers_raw:
            if k == b"origin":
                origin = v.decode("latin-1")
                break

        origin_allowed = bool(origin) and (self.allow_all or origin in self.allowed_origins)

        # Fast-path for CORS preflight
        if method == "OPTIONS" and origin_allowed:
            cors_headers = [
                (b"access-control-allow-origin", origin.encode()),
                (b"vary", b"Origin"),
                (b"access-control-allow-methods", b"GET,POST,PUT,DELETE,PATCH,OPTIONS"),
                (b"access-control-allow-headers", b"Authorization,Content-Type,Idempotency-Key,X-Request-Id"),
                (b"access-control-allow-credentials", b"true"),
            ]
            await send({"type": "http.response.start", "status": 204, "headers": cors_headers})
            await send({"type": "http.response.body", "body": b""})
            return

        # Normal request – inject CORS headers into the response start message
        async def send_with_cors(message):
            if message.get("type") == "http.response.start" and origin_allowed:
                extra = [
                    (b"access-control-allow-origin", origin.encode()),
                    (b"vary", b"Origin"),
                    (b"access-control-allow-methods", b"GET,POST,PUT,DELETE,PATCH,OPTIONS"),
                    (b"access-control-allow-headers", b"Authorization,Content-Type,Idempotency-Key,X-Request-Id"),
                    (b"access-control-allow-credentials", b"true"),
                ]

                existing = list(message.get("headers", []))
                # Strip content-length to prevent mismatch from upstream BaseHTTPMiddleware layers
                existing = [(k, v) for k, v in existing if k.lower() not in (b"content-length",)]
                message = {**message, "headers": existing + extra}
            await send(message)

        await self.app(scope, receive, send_with_cors)


# CORS Middleware - Explicitly configured for all endpoints including OPTIONS
# Only allow all origins in development; staging and production use explicit allowlist
cors_allow_all = settings.ENVIRONMENT == "development"
cors_origins = list(dict.fromkeys(settings.CORS_ORIGINS + [settings.FRONTEND_URL]))
app.add_middleware(CustomCORSMiddleware, allowed_origins=cors_origins, allow_all=cors_allow_all)
app.add_middleware(
    CSRFMiddleware,
    allowed_origins=settings.CSRF_TRUSTED_ORIGINS
    if isinstance(settings.CSRF_TRUSTED_ORIGINS, list)
    else json.loads(settings.CSRF_TRUSTED_ORIGINS),
)
app.add_middleware(SecurityHeadersMiddleware)

# Middleware stack (order matters - last added = outermost layer)
app.add_middleware(MetricsMiddleware)  # Track all requests
app.add_middleware(SentryContextMiddleware)  # Sentry error tracking context
app.add_middleware(TenantContextMiddleware)  # Extract tenant context
app.add_middleware(AuditMiddleware)  # Audit logging
app.add_middleware(IdempotencyMiddleware)  # HTTP idempotency enforcement

# Content-Length fix MUST be outermost (added last) to strip Content-Length
# after all BaseHTTPMiddleware layers have re-added it.
app.add_middleware(ContentLengthFixMiddleware)


class SlashNormalizerMiddleware:
    """
    Pure-ASGI middleware that appends a trailing slash when the request path
    matches a router prefix that has a root-``/`` handler.  Only exact prefix
    matches are rewritten (e.g. ``/api/shops`` -> ``/api/shops/``), so named
    sub-routes like ``/api/auth/me`` are never touched.

    This avoids 404s caused by reverse-proxies (Next.js rewrites) stripping
    trailing slashes, without the redirect-loop risk of ``redirect_slashes``.
    """

    _PREFIXES: set[str] | None = None

    def __init__(self, asgi_app) -> None:
        self.app = asgi_app

    @staticmethod
    def _build_prefixes(fastapi_app: FastAPI) -> set[str]:
        """Collect all prefixed route paths (without trailing slash)."""
        prefixes: set[str] = set()
        for route in fastapi_app.routes:
            path = getattr(route, "path", "")
            if path and path.endswith("/") and path != "/":
                prefixes.add(path.rstrip("/"))
        return prefixes

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            if SlashNormalizerMiddleware._PREFIXES is None:
                SlashNormalizerMiddleware._PREFIXES = self._build_prefixes(app)
            path: str = scope.get("path", "")
            if path in SlashNormalizerMiddleware._PREFIXES:
                scope = {**scope, "path": path + "/"}
        await self.app(scope, receive, send)


# Include API routers
app.include_router(admin_endpoint.router, prefix="/api/admin", tags=["admin"])
app.include_router(cp_router, prefix="/api/cp", tags=["control-panel"])
app.include_router(
    messaging_activation_endpoint.router,
    prefix="/api/messaging",
    tags=["Messaging Activation"],
)
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(google_oauth.router, prefix="/api/oauth", tags=["OAuth"])
app.include_router(onboarding.router, prefix="/api/onboarding", tags=["Onboarding"])
app.include_router(shops.router, prefix="/api/shops", tags=["Shops"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(team.router, prefix="/api/team", tags=["Team Management"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit Logs"])
app.include_router(audit_logs.router, prefix="/api/audit/logs", tags=["Audit Logs"])
app.include_router(metrics_endpoint.router, prefix="/api", tags=["Observability"])
app.include_router(ingestion.router, prefix="/api/products/ingestion", tags=["Product Ingestion"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(financials.router, prefix="/api/financials", tags=["Financials"])
app.include_router(user_preferences.router, prefix="/api/user-preferences", tags=["User Preferences"])
app.include_router(currency.router, prefix="/api/currency", tags=["Currency"])
app.include_router(messages_router.router)

from app.api.endpoints import shop_credentials as shop_credentials_endpoint
app.include_router(shop_credentials_endpoint.router, prefix="/api/shop-credentials", tags=["Shop Credentials"])

from app.api.endpoints import financial_invoices
app.include_router(financial_invoices.router, prefix="/api/financials/invoices", tags=["Invoices"])

from app.api.endpoints import tasks as tasks_endpoint
app.include_router(tasks_endpoint.router, prefix="/api/tasks", tags=["Tasks"])

from app.api.endpoints import reviews as reviews_endpoint
from app.api.endpoints import discounts as discounts_endpoint
app.include_router(reviews_endpoint.router, prefix="/api", tags=["Reviews"])
app.include_router(discounts_endpoint.router, prefix="/api", tags=["Discounts"])

# Mount Prometheus metrics
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Serve static files (profile pictures, etc.)
uploads_dir = "uploads"
if not os.path.exists(uploads_dir):
    os.makedirs(uploads_dir, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


# Debug log endpoint for client-side instrumentation (dev only)
DEBUG_LOG_PATH = os.environ.get("DEBUG_LOG_PATH", "/debug-logs/debug.log")


@app.post("/api/debug/log", tags=["Debug"])
async def debug_log(request: Request):
    """Accept client debug logs and append to file (NDJSON). Used for debugging."""
    if settings.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not found")
    try:
        body = await request.json()
        line = (body if isinstance(body, str) else json.dumps(body)) + "\n"
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line)
        return {"ok": True}
    except Exception as e:
        logger.warning("debug_log failed: %s", e)
        return {"ok": False, "error": str(e)}


@app.get("/healthz", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "etsy-automation-api",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Etsy Automation Platform API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/healthz",
        "metrics": "/metrics",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "request_id": request.headers.get("X-Request-Id", "unknown"),
            }
        },
    )


# Slash normaliser must be added AFTER all routes so it can discover prefixes.
# Last-added = outermost in the ASGI stack.
app.add_middleware(SlashNormalizerMiddleware)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        log_level="info",
    )
