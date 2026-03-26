"""
Database Query Helpers
Automatic tenant and shop filtering for multi-tenancy
"""
from typing import TypeVar, Optional, List
from sqlalchemy.orm import Query
from sqlalchemy import Column

from app.models.tenancy import Shop
from app.api.dependencies import UserContext

T = TypeVar('T')


def filter_by_tenant(query: Query[T], tenant_id: int, tenant_id_column: Column) -> Query[T]:
    """
    Filter query by tenant_id
    
    Args:
        query: SQLAlchemy query
        tenant_id: Tenant ID to filter by
        tenant_id_column: Column to filter on (e.g., Product.tenant_id)
        
    Returns:
        Filtered query
    """
    return query.filter(tenant_id_column == tenant_id)


def filter_by_shops(
    query: Query[T],
    shop_id_column: Column,
    context: UserContext,
    db
) -> Query[T]:
    """
    Filter query by allowed shop IDs based on user role
    
    Args:
        query: SQLAlchemy query
        shop_id_column: Column to filter on (e.g., Product.shop_id)
        context: User context with role and allowed_shop_ids
        db: Database session
        
    Returns:
        Filtered query
        
    Notes:
        - Owner/Admin: No filtering (all shops in tenant)
        - Creator/Viewer: Filter to allowed_shop_ids only
    """
    # If explicit shop links exist, always enforce them (all roles)
    if context.allowed_shop_ids:
        return query.filter(shop_id_column.in_(context.allowed_shop_ids))

    if context.role.lower() in ('owner', 'admin'):
        # Owner/Admin can access all shops in tenant if no explicit links set
        return query.join(Shop).filter(Shop.tenant_id == context.tenant_id)
    
    # No allowed shops = no access
    return query.filter(shop_id_column == -1)  # Impossible condition = empty result


def filter_by_tenant_and_shops(
    query: Query[T],
    tenant_id_column: Column,
    shop_id_column: Optional[Column],
    context: UserContext,
    db
) -> Query[T]:
    """
    Filter query by both tenant and shops
    
    Args:
        query: SQLAlchemy query
        tenant_id_column: Column for tenant_id
        shop_id_column: Column for shop_id (optional)
        context: User context
        db: Database session
        
    Returns:
        Filtered query
    """
    # Always filter by tenant
    query = filter_by_tenant(query, context.tenant_id, tenant_id_column)
    
    # Filter by shops if shop_id_column is provided
    if shop_id_column:
        query = filter_by_shops(query, shop_id_column, context, db)
    
    return query


def ensure_tenant_access(
    item_tenant_id: int,
    context: UserContext
) -> None:
    """
    Ensure user can access an item belonging to a tenant
    
    Raises 403 if tenant_id doesn't match
    
    Args:
        item_tenant_id: Tenant ID of the item
        context: User context
        
    Raises:
        HTTPException: If tenant IDs don't match
    """
    from fastapi import HTTPException, status
    
    if item_tenant_id != context.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: item belongs to different tenant"
        )


def ensure_shop_access(
    shop_id: int,
    context: UserContext,
    db
) -> None:
    """
    Ensure user can access a specific shop
    
    Raises 403 if shop is not accessible
    
    Args:
        shop_id: Shop ID to check
        context: User context
        db: Database session
        
    Raises:
        HTTPException: If shop is not accessible
    """
    from fastapi import HTTPException, status
    
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
    if context.allowed_shop_ids:
        if shop_id not in context.allowed_shop_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this shop"
            )
        return

    # No explicit links: Owner/Admin can access all shops in tenant
    if context.role.lower() in ('owner', 'admin'):
        return

    # Non-owner/admin with no explicit links
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied to this shop"
    )

