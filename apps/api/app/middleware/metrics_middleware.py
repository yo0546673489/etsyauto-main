"""
Prometheus Metrics Middleware for FastAPI
Automatically tracks HTTP request metrics
"""
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.observability.metrics import (
    http_requests_total,
    http_request_duration_seconds,
    http_requests_in_progress,
    http_errors_total,
    http_rate_limit_hits_total,
    sanitize_tenant_id
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware to collect Prometheus metrics for all HTTP requests
    """
    
    async def dispatch(self, request: Request, call_next):
        # Extract tenant_id from request state (set by TenantContextMiddleware)
        tenant_id = getattr(request.state, 'tenant_id', None)
        tenant_id_str = sanitize_tenant_id(tenant_id)
        
        # Get method and path
        method = request.method
        path = request.url.path
        
        # Normalize path (remove IDs to prevent cardinality explosion)
        endpoint = self._normalize_path(path)
        
        # Track in-progress requests
        http_requests_in_progress.labels(method=method, endpoint=endpoint).inc()
        
        # Start timer
        start_time = time.time()
        
        try:
            # Process request
            response = await call_next(request)
            
            # Calculate duration
            duration = time.time() - start_time
            
            # Record metrics
            status_code = response.status_code
            
            http_requests_total.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code,
                tenant_id=tenant_id_str
            ).inc()
            
            http_request_duration_seconds.labels(
                method=method,
                endpoint=endpoint,
                tenant_id=tenant_id_str
            ).observe(duration)
            
            # Track 429 rate limits separately
            if status_code == 429:
                shop_id = getattr(request.state, 'shop_id', 'unknown')
                http_rate_limit_hits_total.labels(
                    endpoint=endpoint,
                    tenant_id=tenant_id_str,
                    shop_id=str(shop_id)
                ).inc()
            
            # Track errors (4xx, 5xx)
            if status_code >= 400:
                error_type = self._get_error_type(status_code)
                http_errors_total.labels(
                    method=method,
                    endpoint=endpoint,
                    error_type=error_type,
                    tenant_id=tenant_id_str
                ).inc()
            
            return response
            
        except Exception as e:
            # Record error metrics
            duration = time.time() - start_time
            
            http_errors_total.labels(
                method=method,
                endpoint=endpoint,
                error_type=type(e).__name__,
                tenant_id=tenant_id_str
            ).inc()
            
            http_request_duration_seconds.labels(
                method=method,
                endpoint=endpoint,
                tenant_id=tenant_id_str
            ).observe(duration)
            
            raise
            
        finally:
            # Decrement in-progress counter
            http_requests_in_progress.labels(method=method, endpoint=endpoint).dec()
    
    def _normalize_path(self, path: str) -> str:
        """
        Normalize path to reduce cardinality
        Replace numeric IDs with placeholders
        """
        parts = path.split('/')
        normalized = []
        
        for part in parts:
            if part.isdigit():
                normalized.append('{id}')
            else:
                normalized.append(part)
        
        return '/'.join(normalized)
    
    def _get_error_type(self, status_code: int) -> str:
        """Get error type from status code"""
        if status_code == 400:
            return "bad_request"
        elif status_code == 401:
            return "unauthorized"
        elif status_code == 403:
            return "forbidden"
        elif status_code == 404:
            return "not_found"
        elif status_code == 429:
            return "rate_limit"
        elif 400 <= status_code < 500:
            return "client_error"
        elif 500 <= status_code < 600:
            return "server_error"
        else:
            return "unknown"

