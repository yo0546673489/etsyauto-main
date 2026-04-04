"""
RBAC Dependencies for FastAPI
Resolves user context, tenant, role, and shop access
"""
from typing import List, Optional
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.rbac import Permission, Role, has_permission, can_access_shop
from app.models.tenancy import Membership, Shop


class UserContext(BaseModel):
    """Complete user context with tenant and role information"""
    user_id: int
    tenant_id: int
    role: str
    email: str
    name: Optional[str]
    allowed_shop_ids: List[int]  # Empty list = all shops (for Owner/Admin)
    
    class Config:
        from_attributes = True


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


def require_role(allowed_roles: List[str]):
    """
    Dependency factory to check user has required role (backward compatible)
    
    Usage:
        @app.get("/admin")
        def admin_route(
            context: UserContext = Depends(require_role(["owner", "admin"]))
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

