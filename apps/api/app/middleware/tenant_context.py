"""
Tenant Context Middleware
Attaches tenant context to request state for downstream use
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from typing import Callable
import logging

logger = logging.getLogger(__name__)


class TenantContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware to attach tenant context to request state
    
    This allows downstream code (DB queries, services) to access
    tenant_id and user context without explicitly passing it.
    
    The context is populated from JWT token in dependencies,
    but middleware ensures it's always available in request.state
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Initialize tenant context in request state
        # Will be populated by get_user_context dependency
        request.state.tenant_id = None
        request.state.user_id = None
        request.state.role = None
        request.state.allowed_shop_ids = []
        
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Error in tenant context middleware: {e}")
            raise

