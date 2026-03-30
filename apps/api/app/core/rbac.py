"""
Role-Based Access Control (RBAC) System
Defines roles, permissions, and authorization logic
"""
from typing import List, Set, Optional
from enum import Enum


class Role(str, Enum):
    """User roles with hierarchical permissions"""
    OWNER = "owner"
    ADMIN = "admin"
    VIEWER = "viewer"
    SUPPLIER = "supplier"


class Permission(str, Enum):
    """Granular permissions for fine-grained access control"""
    # Tenant-level permissions
    MANAGE_BILLING = "manage_billing"
    DELETE_TENANT = "delete_tenant"
    MANAGE_TEAM = "manage_team"
    UPDATE_TENANT_SETTINGS = "update_tenant_settings"

    # Shop-level permissions
    CONNECT_SHOP = "connect_shop"
    DISCONNECT_SHOP = "disconnect_shop"
    MANAGE_SHOP_SETTINGS = "manage_shop_settings"

    # Product permissions
    CREATE_PRODUCT = "create_product"
    READ_PRODUCT = "read_product"
    UPDATE_PRODUCT = "update_product"
    DELETE_PRODUCT = "delete_product"

    # Order permissions
    READ_ORDER = "read_order"
    SYNC_ORDER = "sync_order"
    ASSIGN_ORDER = "assign_order"
    UPDATE_FULFILLMENT = "update_fulfillment"

    # Audit Log permissions
    READ_AUDIT_LOG = "read_audit_log"
    READ_AUDIT_LOGS = "read_audit_logs"
    MANAGE_AUDIT_LOGS = "manage_audit_logs"  # For cleanup/admin tasks

    # Analytics permissions (Owner/Admin only)
    VIEW_ANALYTICS = "view_analytics"
    VIEW_REVENUE = "view_revenue"
    VIEW_SUPPLIER_PERFORMANCE = "view_supplier_performance"


# Permission matrix: Role -> Set of Permissions
ROLE_PERMISSIONS: dict[Role, Set[Permission]] = {
    Role.OWNER: {
        # Tenant
        Permission.MANAGE_BILLING,
        Permission.DELETE_TENANT,
        Permission.MANAGE_TEAM,
        Permission.UPDATE_TENANT_SETTINGS,
        # Shop
        Permission.CONNECT_SHOP,
        Permission.DISCONNECT_SHOP,
        Permission.MANAGE_SHOP_SETTINGS,
        # Product
        Permission.CREATE_PRODUCT,
        Permission.READ_PRODUCT,
        Permission.UPDATE_PRODUCT,
        Permission.DELETE_PRODUCT,
        # Order
        Permission.READ_ORDER,
        Permission.SYNC_ORDER,
        Permission.ASSIGN_ORDER,
        Permission.UPDATE_FULFILLMENT,
        # Audit
        Permission.READ_AUDIT_LOG,
        Permission.READ_AUDIT_LOGS,
        Permission.MANAGE_AUDIT_LOGS,
        # Analytics (Full access including supplier performance)
        Permission.VIEW_ANALYTICS,
        Permission.VIEW_REVENUE,
        Permission.VIEW_SUPPLIER_PERFORMANCE,
    },
    Role.ADMIN: {
        # Tenant (no billing/delete)
        Permission.MANAGE_TEAM,
        Permission.UPDATE_TENANT_SETTINGS,
        # Shop
        Permission.CONNECT_SHOP,
        Permission.DISCONNECT_SHOP,
        Permission.MANAGE_SHOP_SETTINGS,
        # Product
        Permission.CREATE_PRODUCT,
        Permission.READ_PRODUCT,
        Permission.UPDATE_PRODUCT,
        Permission.DELETE_PRODUCT,
        # Order
        Permission.READ_ORDER,
        Permission.SYNC_ORDER,
        Permission.ASSIGN_ORDER,
        Permission.UPDATE_FULFILLMENT,
        # Audit
        Permission.READ_AUDIT_LOG,
        Permission.READ_AUDIT_LOGS,
        # Analytics (Admin can view analytics but not supplier performance)
        Permission.VIEW_ANALYTICS,
        Permission.VIEW_REVENUE,
    },
    Role.VIEWER: {
        # Read-only access (including analytics)
        Permission.READ_PRODUCT,
        Permission.READ_ORDER,
        Permission.READ_AUDIT_LOG,
        Permission.VIEW_ANALYTICS,
        Permission.VIEW_REVENUE,
    },
    Role.SUPPLIER: {
        Permission.READ_ORDER,
        Permission.UPDATE_FULFILLMENT,
        # Supplier sees orders only — no products, no revenue/analytics
    },
}


def has_permission(role: str, permission: Permission) -> bool:
    """
    Check if a role has a specific permission

    Args:
        role: User role (owner, admin, viewer, supplier)
        permission: Permission to check

    Returns:
        True if role has permission, False otherwise
    """
    try:
        role_enum = Role(role.lower())
        return permission in ROLE_PERMISSIONS.get(role_enum, set())
    except ValueError:
        # Invalid role
        return False


def has_any_permission(role: str, permissions: List[Permission]) -> bool:
    """
    Check if a role has any of the specified permissions

    Args:
        role: User role
        permissions: List of permissions to check

    Returns:
        True if role has at least one permission
    """
    return any(has_permission(role, perm) for perm in permissions)


def has_all_permissions(role: str, permissions: List[Permission]) -> bool:
    """
    Check if a role has all of the specified permissions

    Args:
        role: User role
        permissions: List of permissions to check

    Returns:
        True if role has all permissions
    """
    return all(has_permission(role, perm) for perm in permissions)


def can_access_shop(role: str, shop_id: int, allowed_shop_ids: List[int]) -> bool:
    """
    Check if user can access a specific shop

    Args:
        role: User role
        shop_id: Shop ID to check
        allowed_shop_ids: List of shop IDs user can access

    Returns:
        True if user can access shop

    Notes:
        - Owner/Admin: Can access all shops in tenant (empty list = all)
        - Viewer/Supplier: Can only access shops in allowed_shop_ids
    """
    role_enum = Role(role.lower()) if role else None

    # If explicit shop links exist, enforce them for all roles
    if allowed_shop_ids:
        return shop_id in allowed_shop_ids

    # Owner and Admin have access to all shops when no explicit links
    if role_enum in (Role.OWNER, Role.ADMIN):
        return True

    # Viewer and Supplier are restricted to allowed shops
    return False


def get_accessible_shop_ids(role: str, tenant_id: int, allowed_shop_ids: List[int], db) -> List[int]:
    """
    Get list of shop IDs user can access

    Args:
        role: User role
        tenant_id: Tenant ID
        allowed_shop_ids: Explicitly allowed shop IDs from membership
        db: Database session

    Returns:
        List of accessible shop IDs (empty list = all shops in tenant)
    """
    role_enum = Role(role.lower()) if role else None

    # If explicit links exist, return them for any role
    if allowed_shop_ids:
        return allowed_shop_ids

    # Owner and Admin can access all shops in tenant
    if role_enum in (Role.OWNER, Role.ADMIN):
        from app.models.tenancy import Shop
        all_shops = db.query(Shop.id).filter(Shop.tenant_id == tenant_id).all()
        return [shop.id for shop in all_shops]

    # Viewer and Supplier are restricted to explicitly allowed shops
    return []
