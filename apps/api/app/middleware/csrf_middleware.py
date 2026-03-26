"""
CSRF protection middleware based on trusted request origins.
"""
from urllib.parse import urlparse

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

BYPASS_PATHS = [
    "/api/messages/internal/",
    "/healthz",
    "/metrics",
    "/api/auth/",
    "/api/oauth/",
    "/api/admin/",
    "/api/messaging/",
]

INTERNAL_IP_PREFIXES = ("172.", "10.", "192.168.", "127.")


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allowed_origins: list[str]):
        super().__init__(app)
        self.allowed_origins = [o.rstrip("/") for o in allowed_origins if o]

    @staticmethod
    def _normalized_origin(value: str | None) -> str | None:
        if not value:
            return None
        parsed = urlparse(value)
        if not parsed.scheme or not parsed.netloc:
            return None
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")

    def _is_allowed(self, origin_or_referrer: str | None) -> bool:
        normalized = self._normalized_origin(origin_or_referrer)
        if not normalized:
            return False
        return normalized in self.allowed_origins

    async def dispatch(self, request: Request, call_next):
        # Skip safe methods
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        # Skip bypass paths
        path = request.url.path
        if any(path.startswith(p) for p in BYPASS_PATHS):
            return await call_next(request)

        # Skip internal network requests
        client_ip = request.client.host if request.client else ""
        if any(client_ip.startswith(p) for p in INTERNAL_IP_PREFIXES):
            return await call_next(request)

        # Skip Next.js server-side requests
        user_agent = request.headers.get("user-agent", "")
        if "Next.js" in user_agent:
            return await call_next(request)

        # Check Origin/Referer for all other requests
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")

        if not origin and not referer:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "CSRF_VALIDATION_FAILED",
                        "message": "Request origin not allowed",
                    }
                },
            )

        if not self._is_allowed(origin or referer):
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "CSRF_VALIDATION_FAILED",
                        "message": "Request origin not allowed",
                    }
                },
            )

        return await call_next(request)
