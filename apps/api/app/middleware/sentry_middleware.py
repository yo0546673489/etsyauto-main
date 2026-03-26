"""
Sentry Middleware for FastAPI
Automatically tags errors with request context
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import uuid

from app.core.sentry_config import set_sentry_context, add_breadcrumb


class SentryContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware to set Sentry context for each request
    Tags errors with tenant_id, shop_id, request_id, etc.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Generate or extract request ID
        request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
        
        # Extract tenant/shop context from request state (set by TenantContextMiddleware)
        tenant_id = getattr(request.state, 'tenant_id', None)
        shop_id = getattr(request.state, 'shop_id', None)
        user_id = getattr(request.state, 'user_id', None)
        
        # Set Sentry context
        set_sentry_context(
            tenant_id=tenant_id,
            shop_id=shop_id,
            user_id=user_id,
            request_id=request_id,
            method=request.method,
            url=str(request.url),
            path=request.url.path
        )
        
        # Add breadcrumb for request
        add_breadcrumb(
            message=f"{request.method} {request.url.path}",
            category="request",
            level="info",
            data={
                "method": request.method,
                "url": str(request.url.path),
                "request_id": request_id
            }
        )
        
        # Process request
        response = await call_next(request)
        
        # Add breadcrumb for response
        add_breadcrumb(
            message=f"Response {response.status_code}",
            category="response",
            level="error" if response.status_code >= 400 else "info",
            data={
                "status_code": response.status_code,
                "request_id": request_id
            }
        )
        
        return response

