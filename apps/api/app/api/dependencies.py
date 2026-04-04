"""
API Dependencies - JWT authentication, database sessions, RBAC, etc.
"""
import logging
from typing import List, Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError

from app.core.database import get_db
from app.core.security import decode_token
from app.core.rbac import Permission, Role, has_permission, can_access_shop
from app.models.tenancy import Membership, Shop, Tenant

logger = logging.getLogger(__name__)

# HTTP Bearer token security — made optional so cookie auth can take over
security = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    """
    Dependency to get current authenticated user from JWT token.
    
    Reads the token from (in priority order):
      1. ``access_token`` HttpOnly cookie  (browser clients)
      2. ``Authorization: Bearer <token>`` header  (M2M / API clients)
    
    Usage:
        @app.get("/protected")
        def protected_route(current_user = Depends(get_current_user)):
            return {"user_id": current_user["sub"]}
    """
    # 1. Try cookie first (browser sessions)
    token = request.cookies.get("access_token")

    # 2. Fall back to Authorization header (API / M2M clients)
    if not token and credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token)
        # Reject refresh tokens used as access tokens
        if payload.get("type") == "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(allowed_roles: list):
    """
    Dependency factory to check user has required role (backward compatible)
    Returns dict (old behavior) or UserContext (new behavior) based on usage
    
    Usage (old - returns dict):
        @app.get("/admin-only")
        def admin_route(current_user = Depends(require_role(["owner", "admin"]))):
            return {"message": "Admin access granted"}
    
    Usage (new - returns UserContext):
        @app.get("/admin-only")
        def admin_route(context: UserContext = Depends(require_role(["owner", "admin"]))):
            return {"message": "Admin access granted"}
    """
    def role_checker(current_user = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {allowed_roles}"
            )
        # For backward compatibility, return dict if it's a dict
        # If user wants UserContext, they should use require_role_new
        return current_user
    return role_checker


def require_role_with_context(allowed_roles: List[str]):
    """
    Dependency factory to check user has required role (enhanced version with UserContext)
    
    Usage:
        @app.get("/admin")
        def admin_route(
            context: UserContext = Depends(require_role_with_context(["owner", "admin"]))
        ):
            ...
    """
    def role_checker(context: UserContext = Depends(get_user_context)):
        if context.role.lower() not in [r.lower() for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {allowed_roles}"
            )
        return context
    return role_checker


# ==================== Messaging (admin-approved) ====================

def assert_messaging_access_approved(db: Session, tenant_id: int) -> None:
    """Raise 403 unless tenant has admin-approved messaging automation."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or getattr(tenant, "messaging_access", None) != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Messaging access not approved",
        )


def require_messaging_access(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """JWT user dependency that also requires tenant messaging_access == 'approved'."""
    assert_messaging_access_approved(db, int(current_user["tenant_id"]))
    return current_user


# ==================== RBAC Dependencies ====================

class UserContext(BaseModel):
    """Complete user context with tenant and role information"""
    user_id: int
    tenant_id: int
    role: str
    email: str
    name: Optional[str]
    allowed_shop_ids: List[int]  # Empty list = all shops (for Owner/Admin)
    
    model_config = {"from_attributes": True}


def get_user_context(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UserContext:
    """
    Resolve complete user context from JWT token
    
    Fetches:
    - User ID, tenant ID, role from JWT
    - Allowed shop IDs from membership (if any)
    - Validates membership is active
    
    Raises 403 if membership is not active
    
    Usage:
        @app.get("/protected")
        def route(context: UserContext = Depends(get_user_context)):
            return {"tenant_id": context.tenant_id}
    """
    user_id = int(current_user.get("sub") or current_user.get("user_id") or current_user.get("id"))
    tenant_id = int(current_user.get("tenant_id"))
    role = current_user.get("role")
    
    if not user_id or not tenant_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user, tenant, or role"
        )
    
    # Verify membership is active
    membership = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.tenant_id == tenant_id,
        Membership.invitation_status == 'accepted'
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Membership not found or not active"
        )
    
    # Get allowed shop IDs from membership (user-linked shops)
    allowed_shop_ids = membership.allowed_shop_ids or []
    
    context = UserContext(
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        email=current_user.get("email", ""),
        name=current_user.get("name"),
        allowed_shop_ids=allowed_shop_ids or []
    )
    
    # Populate request.state for middleware/downstream access
    request.state.user_id = user_id
    request.state.tenant_id = tenant_id
    request.state.role = role
    request.state.allowed_shop_ids = allowed_shop_ids or []
    request.state.user_context = context
    
    return context


def require_permission(permission: Permission):
    """
    Dependency factory to check user has required permission
    
    Usage:
        @app.post("/products")
        def create_product(
            context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT))
        ):
            ...
    """
    def permission_checker(context: UserContext = Depends(get_user_context)):
        if not has_permission(context.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {permission.value}"
            )
        return context
    return permission_checker


def require_any_permission(permissions: List[Permission]):
    """
    Dependency factory to check user has at least one of the required permissions
    
    Usage:
        @app.get("/products")
        def list_products(
            context: UserContext = Depends(require_any_permission([
                Permission.READ_PRODUCT,
                Permission.CREATE_PRODUCT
            ]))
        ):
            ...
    """
    def permission_checker(context: UserContext = Depends(get_user_context)):
        from app.core.rbac import has_any_permission as check_any
        if not check_any(context.role, permissions):
            required = ", ".join([p.value for p in permissions])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required (any of): {required}"
            )
        return context
    return permission_checker


def require_role_new(allowed_roles: List[str]):
    """
    Dependency factory to check user has required role (enhanced version with UserContext)
    
    Usage:
        @app.get("/admin")
        def admin_route(
            context: UserContext = Depends(require_role_new(["owner", "admin"]))
        ):
            ...
    """
    def role_checker(context: UserContext = Depends(get_user_context)):
        if context.role.lower() not in [r.lower() for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {allowed_roles}"
            )
        return context
    return role_checker


def require_shop_access(
    shop_id_param: str = "shop_id",
    allow_all_shops_for_owner_admin: bool = True
):
    """
    Dependency factory to verify user can access a specific shop
    
    Usage:
        @app.get("/shops/{shop_id}/listings")
        def get_listings(
            shop_id: int,
            context: UserContext = Depends(require_shop_access("shop_id"))
        ):
            # shop_id is already validated to be accessible
            ...
    
    Args:
        shop_id_param: Name of the path parameter containing shop_id
        allow_all_shops_for_owner_admin: If True, Owner/Admin can access any shop in tenant
    """
    def shop_checker(
        shop_id: int,
        context: UserContext = Depends(get_user_context),
        db: Session = Depends(get_db)
    ):
        # Verify shop exists and belongs to tenant
        shop = db.query(Shop).filter(
            Shop.id == shop_id,
            Shop.tenant_id == context.tenant_id
        ).first()
        
        if not shop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shop not found"
            )
        
        # Check access permissions
        if allow_all_shops_for_owner_admin and context.role.lower() in ('owner', 'admin', 'employee') and not context.allowed_shop_ids:
            return context

        if not can_access_shop(context.role, shop_id, context.allowed_shop_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this shop"
            )
        
        return context
    
    return shop_checker


def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """Returns JWT payload if authenticated, None otherwise. Does not raise."""
    token = request.cookies.get("access_token")
    if not token and credentials:
        token = credentials.credentials
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") == "refresh":
            return None
        return payload
    except Exception as _e:
        logger.warning(f"[dependencies] get_current_user_optional token decode failed: {_e!r}")
        return None


def get_optional_user_context(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
) -> Optional[UserContext]:
    """Returns user context if authenticated, None otherwise. Does not raise."""
    if not current_user:
        return None
    try:
        user_id = int(current_user.get("sub") or current_user.get("user_id") or current_user.get("id"))
        tenant_id = int(current_user.get("tenant_id"))
        role = current_user.get("role")
        if not user_id or not tenant_id or not role:
            return None
        membership = db.query(Membership).filter(
            Membership.user_id == user_id,
            Membership.tenant_id == tenant_id,
            Membership.invitation_status == 'accepted'
        ).first()
        if not membership:
            return None
        allowed_shop_ids = membership.allowed_shop_ids or []
        return UserContext(
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
            email=current_user.get("email", ""),
            name=current_user.get("name"),
            allowed_shop_ids=allowed_shop_ids,
        )
    except Exception as _e:
        logger.warning(f"[dependencies] get_optional_user_context failed: {_e!r}")
        return None


def require_analytics_access():
    """
    Dependency to enforce analytics access (Owner/Admin/Viewer only)
    Explicitly denies Supplier access to analytics endpoints
    
    Usage:
        @app.get("/api/analytics/overview")
        def get_analytics(
            context: UserContext = Depends(require_analytics_access())
        ):
            ...
    """
    def analytics_checker(context: UserContext = Depends(get_user_context)):
        role_lower = context.role.lower()
        
        # Explicit denial for suppliers
        if role_lower == "supplier":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Suppliers are not authorized to access analytics"
            )
        
        # Check analytics permission
        if not has_permission(context.role, Permission.VIEW_ANALYTICS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to view analytics"
            )
        
        return context
    
    return analytics_checker


def require_revenue_access():
    """
    Dependency to enforce revenue/financial data access (Owner/Admin/Viewer only)
    
    Usage:
        @app.get("/api/analytics/revenue")
        def get_revenue(context: UserContext = Depends(require_revenue_access())):
            ...
    """
    def revenue_checker(context: UserContext = Depends(get_user_context)):
        role_lower = context.role.lower()
        
        # Explicit denial for suppliers
        if role_lower == "supplier":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Suppliers are not authorized to access revenue data"
            )
        
        # Check revenue permission
        if not has_permission(context.role, Permission.VIEW_REVENUE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to view revenue data"
            )
        
        return context
    
    return revenue_checker