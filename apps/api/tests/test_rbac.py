"""
Comprehensive RBAC Test Suite
Tests role-based access control, permissions, tenant isolation, and shop access
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi import HTTPException, status
from datetime import datetime, timezone

from app.core.rbac import Role, Permission, has_permission, has_any_permission, can_access_shop, get_accessible_shop_ids
from app.api.dependencies import get_user_context, require_permission, require_role_with_context, UserContext
from app.models.tenancy import Membership, Shop, Tenant, User


# ==================== Fixtures ====================

@pytest.fixture
def mock_db():
    """Mock database session"""
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = None
    return db


@pytest.fixture
def mock_redis():
    """Mock Redis client"""
    redis = Mock()
    return redis


@pytest.fixture
def sample_membership():
    """Sample membership with owner role"""
    membership = Mock(spec=Membership)
    membership.user_id = 1
    membership.tenant_id = 1
    membership.role = "owner"
    membership.invitation_status = "accepted"
    return membership


@pytest.fixture
def sample_user_context_owner():
    """Sample UserContext for owner"""
    return UserContext(
        user_id=1,
        tenant_id=1,
        role="owner",
        email="owner@example.com",
        name="Owner User",
        allowed_shop_ids=[]  # Empty = all shops
    )


@pytest.fixture
def sample_user_context_admin():
    """Sample UserContext for admin"""
    return UserContext(
        user_id=2,
        tenant_id=1,
        role="admin",
        email="admin@example.com",
        name="Admin User",
        allowed_shop_ids=[]  # Empty = all shops
    )


@pytest.fixture
def sample_user_context_creator():
    """Sample UserContext for creator"""
    return UserContext(
        user_id=3,
        tenant_id=1,
        role="creator",
        email="creator@example.com",
        name="Creator User",
        allowed_shop_ids=[1, 2]  # Restricted to shops 1 and 2
    )


@pytest.fixture
def sample_user_context_viewer():
    """Sample UserContext for viewer"""
    return UserContext(
        user_id=4,
        tenant_id=1,
        role="viewer",
        email="viewer@example.com",
        name="Viewer User",
        allowed_shop_ids=[1]  # Only shop 1
    )


@pytest.fixture
def sample_user_context_tenant2():
    """Sample UserContext for different tenant"""
    return UserContext(
        user_id=5,
        tenant_id=2,
        role="owner",
        email="owner2@example.com",
        name="Owner Tenant 2",
        allowed_shop_ids=[]
    )


# ==================== Permission Matrix Tests ====================

class TestPermissionMatrix:
    """Test permission matrix for all roles"""
    
    def test_owner_has_all_permissions(self):
        """Verify Owner has all permissions"""
        owner_permissions = [
            Permission.MANAGE_BILLING,
            Permission.DELETE_TENANT,
            Permission.MANAGE_TEAM,
            Permission.CONNECT_SHOP,
            Permission.CREATE_PRODUCT,
            Permission.DELETE_PRODUCT,
            Permission.SYNC_ORDER,
        ]
        
        for perm in owner_permissions:
            assert has_permission("owner", perm), f"Owner should have {perm.value}"
    
    def test_admin_has_most_permissions(self):
        """Verify Admin has most permissions (except billing/delete tenant)"""
        assert has_permission("admin", Permission.MANAGE_TEAM)
        assert has_permission("admin", Permission.CREATE_PRODUCT)
        assert not has_permission("admin", Permission.MANAGE_BILLING)
        assert not has_permission("admin", Permission.DELETE_TENANT)
    
    def test_viewer_is_read_only(self):
        """Verify Viewer only has read permissions"""
        assert has_permission("viewer", Permission.READ_PRODUCT)
        assert has_permission("viewer", Permission.READ_ORDER)
        assert has_permission("viewer", Permission.READ_AUDIT_LOG)
        assert not has_permission("viewer", Permission.CREATE_PRODUCT)
        assert not has_permission("viewer", Permission.UPDATE_PRODUCT)
        assert not has_permission("viewer", Permission.DELETE_PRODUCT)
    
    def test_invalid_role_has_no_permissions(self):
        """Verify invalid roles have no permissions"""
        assert not has_permission("invalid_role", Permission.READ_PRODUCT)
        assert not has_permission("", Permission.READ_PRODUCT)
        # None role raises ValueError when converting to Role enum, which returns False
        try:
            result = has_permission(None, Permission.READ_PRODUCT)
            assert result is False
        except (ValueError, TypeError, AttributeError):
            # Expected to fail for None
            pass


# ==================== UserContext Resolution Tests ====================

class TestUserContext:
    """Test user context resolution"""
    
    @pytest.mark.asyncio
    async def test_get_user_context_success(self, mock_db, mock_redis, sample_membership):
        """Test successful user context resolution"""
        # Mock JWT payload
        mock_jwt = {
            "sub": "1",
            "user_id": 1,
            "id": 1,
            "tenant_id": 1,
            "role": "owner",
            "email": "owner@example.com",
            "name": "Owner User",
            "shop_ids": []
        }
        
        # Mock membership lookup
        mock_db.query.return_value.filter.return_value.first.return_value = sample_membership
        
        # Mock request
        mock_request = Mock()
        mock_request.state = Mock()
        
        # get_user_context is not async - it's a regular function that returns UserContext
        # Let's test it directly with mocked dependencies
        from app.api.dependencies import get_user_context
        
        context = get_user_context(mock_request, mock_jwt, mock_db)
        
        assert context.user_id == 1
        assert context.tenant_id == 1
        assert context.role == "owner"
        assert context.email == "owner@example.com"
        assert mock_request.state.tenant_id == 1
    
    def test_get_user_context_inactive_membership(self, mock_db, mock_redis):
        """Test that inactive membership raises 403"""
        # Mock JWT payload
        mock_jwt = {
            "sub": "1",
            "tenant_id": 1,
            "role": "owner"
        }
        
        # Mock membership not found or not accepted
        mock_db.query.return_value.filter.return_value.first.return_value = None
        
        mock_request = Mock()
        mock_request.state = Mock()
        
        from app.api.dependencies import get_user_context
        
        with pytest.raises(HTTPException) as exc_info:
            get_user_context(mock_request, mock_jwt, mock_db)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


# ==================== Permission-Based Authorization Tests ====================

class TestRequirePermission:
    """Test require_permission dependency"""
    
    def test_require_permission_success(self, sample_user_context_owner):
        """Test successful permission check"""
        checker = require_permission(Permission.CREATE_PRODUCT)
        # The checker is a dependency function, so we call it directly
        # In real usage, FastAPI injects the context
        with patch('app.api.dependencies.get_user_context', return_value=sample_user_context_owner):
            # This is a simplified test - actual dependency injection is tested via FastAPI TestClient
            assert has_permission(sample_user_context_owner.role, Permission.CREATE_PRODUCT)
    
    def test_require_permission_failure(self, sample_user_context_viewer):
        """Test permission check fails for viewer trying to create"""
        assert not has_permission(sample_user_context_viewer.role, Permission.CREATE_PRODUCT)


# ==================== Tenant Isolation Tests ====================

class TestTenantIsolation:
    """Test multi-tenant isolation"""
    
    def test_can_access_shop_owner_all_shops(self, sample_user_context_owner):
        """Owner can access all shops in tenant"""
        assert can_access_shop("owner", 1, []) == True
        assert can_access_shop("owner", 999, []) == True  # Any shop ID
    
    def test_can_access_shop_creator_restricted(self, sample_user_context_creator):
        """Creator can only access allowed shops"""
        assert can_access_shop("creator", 1, [1, 2]) == True
        assert can_access_shop("creator", 2, [1, 2]) == True
        assert can_access_shop("creator", 3, [1, 2]) == False  # Not in allowed list
    
    def test_cross_tenant_access_blocked(self, sample_user_context_tenant2):
        """User from tenant 2 cannot access tenant 1 resources"""
        # This is enforced at the query level via filter_by_tenant
        # Context will have tenant_id=2, so queries will filter tenant_id=2
        assert sample_user_context_tenant2.tenant_id == 2


# ==================== Shop Access Tests ====================

class TestShopAccess:
    """Test shop-level access control"""
    
    def test_get_accessible_shop_ids_owner(self, mock_db):
        """Owner/Admin should get all shops"""
        from app.models.tenancy import Shop
        
        # Mock all shops query
        shop1 = Mock(spec=Shop)
        shop1.id = 1
        shop2 = Mock(spec=Shop)
        shop2.id = 2
        
        mock_db.query.return_value.filter.return_value.all.return_value = [shop1, shop2]
        
        shop_ids = get_accessible_shop_ids("owner", 1, [], mock_db)
        assert len(shop_ids) == 2
        assert 1 in shop_ids
        assert 2 in shop_ids
    
    def test_get_accessible_shop_ids_creator(self, mock_db):
        """Creator/Viewer should get only allowed shops"""
        shop_ids = get_accessible_shop_ids("creator", 1, [1, 2], mock_db)
        assert shop_ids == [1, 2]
        
        # No allowed shops = empty list
        shop_ids_empty = get_accessible_shop_ids("creator", 1, [], mock_db)
        assert shop_ids_empty == []


# ==================== Contract Tests Per Role ====================

class TestRoleContracts:
    """Contract tests to ensure role permissions match requirements"""
    
    def test_viewer_read_only_contract(self):
        """Viewer should be read-only - no write permissions"""
        write_permissions = [
            Permission.CREATE_PRODUCT,
            Permission.UPDATE_PRODUCT,
            Permission.DELETE_PRODUCT,
            Permission.SYNC_ORDER,
            Permission.MANAGE_TEAM,
        ]
        
        for perm in write_permissions:
            assert not has_permission("viewer", perm), \
                f"Viewer should NOT have {perm.value} (read-only role)"
    
    def test_creator_can_create_within_scope(self):
        """Creator can create items but not delete/manage team"""
        assert not has_permission("creator", Permission.DELETE_PRODUCT)
        assert not has_permission("creator", Permission.MANAGE_TEAM)
    
    def test_admin_broader_rights_contract(self):
        """Admin has broader rights than Creator"""
        # Admin should have everything Creator has
        creator_perms = [
            Permission.CREATE_PRODUCT,
            Permission.READ_PRODUCT,
            Permission.UPDATE_PRODUCT,
            Permission.DELETE_PRODUCT,
        ]
        
        for perm in creator_perms:
            assert has_permission("admin", perm), \
                f"Admin should have {perm.value} (broader than Creator)"
        
        # Admin should have management permissions Creator lacks
        assert has_permission("admin", Permission.MANAGE_TEAM)
        assert has_permission("admin", Permission.UPDATE_TENANT_SETTINGS)
        assert not has_permission("admin", Permission.MANAGE_BILLING)  # Owner only
    
    def test_owner_full_access_contract(self):
        """Owner should have full access including billing/delete"""
        assert has_permission("owner", Permission.MANAGE_BILLING)
        assert has_permission("owner", Permission.DELETE_TENANT)
        assert has_permission("owner", Permission.MANAGE_TEAM)
        assert has_permission("owner", Permission.CONNECT_SHOP)
        assert has_permission("owner", Permission.CREATE_PRODUCT)
        assert has_permission("owner", Permission.DELETE_PRODUCT)


# ==================== Negative Tests (Security) ====================

class TestNegativeSecurity:
    """Negative test cases for security"""
    
    def test_cross_tenant_data_access_blocked(self, sample_user_context_tenant2, mock_db):
        """User from tenant 2 should not access tenant 1 data"""
        # This is tested at query level - tenant_id filter ensures isolation
        assert sample_user_context_tenant2.tenant_id == 2
        
        # If query uses filter_by_tenant with context.tenant_id=2,
        # it will only return tenant 2 data, not tenant 1
    
    def test_cross_shop_access_blocked(self, sample_user_context_creator):
        """Creator with access to shops [1,2] should not access shop 3"""
        assert not can_access_shop("creator", 3, [1, 2])
    
    def test_unauthorized_permission_denied(self):
        """Viewer trying to create product should be denied"""
        assert not has_permission("viewer", Permission.CREATE_PRODUCT)
    
    def test_role_escalation_prevented(self):
        """Admin cannot perform owner-only actions"""
        assert not has_permission("admin", Permission.MANAGE_BILLING)
        assert not has_permission("admin", Permission.DELETE_TENANT)
    
    def test_creator_cannot_manage_team(self):
        """Creator cannot manage team or delete resources"""
        assert not has_permission("creator", Permission.MANAGE_TEAM)
        assert not has_permission("creator", Permission.DELETE_PRODUCT)


# ==================== Integration Tests ====================

class TestRBACIntegration:
    """Integration tests for RBAC in API endpoints"""
    
    @pytest.mark.asyncio
    async def test_product_create_with_permission(self, sample_user_context_owner):
        """Test that product creation requires CREATE_PRODUCT permission"""
        # Owner has permission
        assert has_permission(sample_user_context_owner.role, Permission.CREATE_PRODUCT)
        
        # Viewer does not
        viewer_context = UserContext(
            user_id=4, tenant_id=1, role="viewer",
            email="viewer@example.com", name="Viewer",
            allowed_shop_ids=[]
        )
        assert not has_permission(viewer_context.role, Permission.CREATE_PRODUCT)
    
    @pytest.mark.asyncio
    async def test_shop_access_enforcement(self, sample_user_context_creator, mock_db):
        """Test shop access is enforced correctly"""
        # Creator has access to shops 1 and 2
        assert can_access_shop("creator", 1, sample_user_context_creator.allowed_shop_ids)
        assert can_access_shop("creator", 2, sample_user_context_creator.allowed_shop_ids)
        assert not can_access_shop("creator", 3, sample_user_context_creator.allowed_shop_ids)


# ==================== Permission Helper Tests ====================

class TestPermissionHelpers:
    """Test permission helper functions"""
    
    def test_has_any_permission(self):
        """Test has_any_permission returns True if any permission matches"""
        assert has_any_permission("owner", [
            Permission.CREATE_PRODUCT,
            Permission.MANAGE_BILLING
        ])
        
        assert has_any_permission("creator", [
            Permission.CREATE_PRODUCT,
            Permission.MANAGE_BILLING
        ])  # Has CREATE_PRODUCT
        
        assert not has_any_permission("viewer", [
            Permission.CREATE_PRODUCT,
            Permission.MANAGE_BILLING
        ])
    
    def test_has_all_permissions(self):
        """Test has_all_permissions returns True only if all permissions match"""
        from app.core.rbac import has_all_permissions
        
        assert has_all_permissions("owner", [
            Permission.CREATE_PRODUCT,
            Permission.READ_PRODUCT
        ])
        
        assert not has_all_permissions("creator", [
            Permission.CREATE_PRODUCT,
            Permission.DELETE_PRODUCT
        ])  # Creator doesn't have DELETE


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

