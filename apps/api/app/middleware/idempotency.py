"""
Idempotency Middleware (pure-ASGI)
Enforces Idempotency-Key on mutating HTTP requests and caches responses.

Implemented as a raw ASGI middleware (not BaseHTTPMiddleware) to avoid the
stacked-BaseHTTPMiddleware deadlock when reading the request body.
"""
import base64
import hashlib
import json
import time

from app.core.redis import get_redis_client

IDEMPOTENCY_METHODS_STR = {"POST", "PUT", "PATCH", "DELETE"}

# Paths that don't require idempotency key
EXEMPT_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/google",
    "/api/auth/token",
    "/api/auth/refresh",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/resend-verification",
    "/api/auth/verify-email",
    "/api/team/members/invite",
    "/api/team/invitations/accept",
    "/api/oauth/google/auth",
    "/api/oauth/google/callback",
}

# Path prefixes exempt from idempotency (for dynamic-token endpoints)
EXEMPT_PATH_PREFIXES = (
    "/api/shops/connect-link/",
    "/api/admin/",
    "/api/messaging/",
)


class IdempotencyMiddleware:
    """
    Pure-ASGI idempotency middleware.
    Enforce Idempotency-Key header for mutating endpoints and cache responses.
    """

    def __init__(self, app, ttl_seconds: int = 86400) -> None:
        self.app = app
        self.ttl_seconds = ttl_seconds

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        method = scope.get("method", "")
        path = scope.get("path", "")

        # Skip OPTIONS, non-mutating methods, and exempt paths
        if method == "OPTIONS" or method not in IDEMPOTENCY_METHODS_STR or path in EXEMPT_PATHS or path.startswith(EXEMPT_PATH_PREFIXES):
            return await self.app(scope, receive, send)

        # Extract Idempotency-Key from headers
        headers_raw = scope.get("headers", [])
        idempotency_key = None
        for k, v in headers_raw:
            if k.lower() == b"idempotency-key":
                idempotency_key = v.decode("latin-1")
                break

        if not idempotency_key:
            body = json.dumps({
                "error": {
                    "code": "IDEMPOTENCY_KEY_REQUIRED",
                    "message": "Idempotency-Key header is required for mutating requests.",
                }
            }).encode()
            await send({
                "type": "http.response.start",
                "status": 400,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({"type": "http.response.body", "body": body})
            return

        # Validate key format: max 64 chars, printable ASCII only
        if len(idempotency_key) > 64 or not idempotency_key.isascii() or not idempotency_key.isprintable():
            body = json.dumps({
                "error": {
                    "code": "IDEMPOTENCY_KEY_INVALID",
                    "message": "Idempotency-Key must be at most 64 printable ASCII characters.",
                }
            }).encode()
            await send({
                "type": "http.response.start",
                "status": 400,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({"type": "http.response.body", "body": body})
            return

        # Read the full request body from ASGI receive
        request_body = b""
        while True:
            message = await receive()
            request_body += message.get("body", b"")
            if not message.get("more_body", False):
                break

        body_hash = hashlib.sha256(request_body).hexdigest()
        cache_key = f"idempotency:{method}:{path}:{idempotency_key}:{body_hash}"

        redis_client = get_redis_client()
        cached = redis_client.get(cache_key)

        if cached:
            cached_payload = json.loads(cached)
            cached_body = base64.b64decode(cached_payload["body"])
            resp_headers = [(b"content-type", cached_payload.get("content_type", "application/json").encode())]
            await send({
                "type": "http.response.start",
                "status": cached_payload["status"],
                "headers": resp_headers,
            })
            await send({"type": "http.response.body", "body": cached_body})
            return

        # Create a synthetic receive that replays the already-consumed body
        body_sent = False
        async def replay_receive():
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {"type": "http.request", "body": request_body, "more_body": False}
            # After body is sent, wait forever (connection close would end this)
            return await receive()

        # Capture the response from the inner app
        response_status = None
        response_headers = []
        response_body = b""
        response_started = False

        async def capture_send(message):
            nonlocal response_status, response_headers, response_body, response_started
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = list(message.get("headers", []))
                response_started = True
            elif message["type"] == "http.response.body":
                response_body += message.get("body", b"")
                # Don't forward yet — we buffer the full response for caching

        await self.app(scope, replay_receive, capture_send)

        # Cache the response (non-5xx only)
        if response_status is not None and response_status < 500:
            content_type = "application/json"
            for k, v in response_headers:
                if k.lower() == b"content-type":
                    content_type = v.decode("latin-1")
                    break
            payload = {
                "status": response_status,
                "body": base64.b64encode(response_body).decode("utf-8"),
                "content_type": content_type,
                "created_at": int(time.time()),
            }
            try:
                redis_client.setex(cache_key, self.ttl_seconds, json.dumps(payload))
            except Exception:
                pass  # Don't fail the request if caching fails

        # Forward the buffered response, stripping content-length to avoid mismatch
        filtered_headers = [
            (k, v) for k, v in response_headers
            if k.lower() not in (b"content-length", b"transfer-encoding")
        ]
        await send({
            "type": "http.response.start",
            "status": response_status or 500,
            "headers": filtered_headers,
        })
        await send({"type": "http.response.body", "body": response_body})
