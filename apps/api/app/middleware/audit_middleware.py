"""
Audit Logging Middleware
Automatically logs HTTP requests and responses for audit trail
"""
import json
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.datastructures import Headers

from app.core.database import get_db
from app.services.audit_service import AuditService
from app.models.audit_constants import AuditStatus

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Middleware to automatically log HTTP requests for audit purposes
    Logs: request details, response status, latency, actor info
    """
    
    # Paths to exclude from audit logging (too noisy)
    EXCLUDED_PATHS = [
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/favicon.ico",
        "/metrics",
    ]
    
    # Paths that should always be audited
    CRITICAL_PATHS = [
        "/api/auth/",
        "/api/products/",
        "/api/listings/",
        "/api/ingestion/",
        "/api/oauth/",
        "/api/shops/",
        "/api/team/",
        "/api/schedules/",
    ]
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and create audit log
        """
        # Skip excluded paths
        if any(request.url.path.startswith(path) for path in self.EXCLUDED_PATHS):
            return await call_next(request)
        
        # Generate request ID for correlation
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Record start time
        start_time = time.time()
        
        # Extract actor information from request
        actor_info = self._extract_actor_info(request)
        
        # Process request
        response = await call_next(request)
        
        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Log to audit (async, non-blocking)
        try:
            # Only log if it's a critical path or resulted in error
            should_log = (
                any(request.url.path.startswith(path) for path in self.CRITICAL_PATHS) or
                response.status_code >= 400
            )
            
            if should_log:
                db = next(get_db())
                try:
                    audit_service = AuditService(db)
                    
                    # Determine status based on HTTP status code
                    if response.status_code < 400:
                        status = AuditStatus.SUCCESS
                    elif response.status_code < 500:
                        status = AuditStatus.FAILURE
                    else:
                        status = AuditStatus.ERROR
                    
                    # Determine action from path and method
                    action = self._infer_action(request.method, request.url.path)
                    
                    # Log the request
                    audit_service.log_action(
                        action=action,
                        status=status,
                        actor_user_id=actor_info.get("user_id"),
                        actor_email=actor_info.get("email"),
                        actor_ip=actor_info.get("ip"),
                        tenant_id=actor_info.get("tenant_id"),
                        http_method=request.method,
                        http_path=str(request.url.path),
                        http_status=response.status_code,
                        latency_ms=latency_ms,
                        request_id=request_id,
                        request_metadata=self._sanitize_request_data(request),
                    )
                finally:
                    db.close()
        except Exception as e:
            # Don't fail the request if audit logging fails
            logger.error(f"Audit logging failed: {str(e)}")
        
        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id
        
        return response
    
    def _extract_actor_info(self, request: Request) -> dict:
        """Extract actor information from request"""
        actor_info = {
            "user_id": None,
            "email": None,
            "tenant_id": None,
            "ip": None,
        }
        
        # Get IP address
        if "x-forwarded-for" in request.headers:
            actor_info["ip"] = request.headers["x-forwarded-for"].split(",")[0].strip()
        elif "x-real-ip" in request.headers:
            actor_info["ip"] = request.headers["x-real-ip"]
        else:
            actor_info["ip"] = request.client.host if request.client else None
        
        # Extract user info from request state (set by auth middleware)
        if hasattr(request.state, "user"):
            user = request.state.user
            actor_info["user_id"] = getattr(user, "id", None)
            actor_info["email"] = getattr(user, "email", None)
        
        if hasattr(request.state, "tenant_id"):
            actor_info["tenant_id"] = request.state.tenant_id
        
        return actor_info
    
    def _sanitize_request_data(self, request: Request) -> dict:
        """
        Extract and sanitize request data for logging
        Remove sensitive fields
        """
        # Filter out sensitive query parameters
        sensitive_params = {"token", "code", "state", "key", "secret", "password", "access_token", "refresh_token"}
        filtered_query_params = {
            k: ("***" if k.lower() in sensitive_params else v)
            for k, v in request.query_params.items()
        }
        data = {
            "query_params": filtered_query_params,
            "path_params": request.path_params,
            "headers": {},
        }
        
        # Include safe headers only
        safe_headers = ["content-type", "user-agent", "accept", "referer"]
        for header in safe_headers:
            if header in request.headers:
                data["headers"][header] = request.headers[header]
        
        return data
    
    def _infer_action(self, method: str, path: str) -> str:
        """
        Infer action name from HTTP method and path
        """
        # Map paths to action prefixes
        if "/api/auth/login" in path:
            return "auth.login"
        elif "/api/auth/register" in path:
            return "auth.register"
        elif "/api/auth/logout" in path:
            return "auth.logout"
        elif "/api/products" in path:
            if method == "POST":
                return "product.create"
            elif method in ["PUT", "PATCH"]:
                return "product.update"
            elif method == "DELETE":
                return "product.delete"
            else:
                return "product.read"
        elif "/api/listings" in path:
            if "publish" in path:
                return "listing.publish"
            elif "sync" in path:
                return "listing.sync"
            elif method in ["PUT", "PATCH"]:
                return "listing.update"
            elif method == "DELETE":
                return "listing.delete"
            else:
                return "listing.read"
        elif "/api/ingestion" in path:
            if method == "POST":
                return "ingestion.start"
            else:
                return "ingestion.read"
        elif "/api/oauth" in path:
            if "connect" in path or "authorize" in path:
                return "oauth.connect"
            elif "disconnect" in path:
                return "oauth.disconnect"
            else:
                return "oauth.read"
        elif "/api/ai" in path or "generate" in path:
            if method == "POST":
                return "ai.generate"
            else:
                return "ai.read"
        else:
            # Generic action
            return f"http.{method.lower()}"

