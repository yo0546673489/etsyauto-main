"""
Comprehensive Tests for Audit Logging System
Tests: actions recorded, tenant scoping, pagination, TTL cleanup
"""
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.audit import AuditLog
from app.models.audit_constants import AuditAction, AuditStatus
from app.models.tenancy import Tenant, User, Membership
from app.services.audit_service import AuditService
from app.core.security import create_access_token


# ==================== Fixtures ====================

@pytest.fixture
def test_db():
    """Get test database session"""
    db = next(get_db())
    yield db
    # Cleanup audit logs after each test
    db.query(AuditLog).delete()
    db.commit()
    db.close()


@pytest.fixture
def test_tenant(test_db):
    """Create test tenant"""
    tenant = Tenant(name="Test Tenant", status="active")
    test_db.add(tenant)
    test_db.commit()
    test_db.refresh(tenant)
    return tenant


@pytest.fixture
def other_tenant(test_db):
    """Create another tenant for isolation tests"""
    tenant = Tenant(name="Other Tenant", status="active")
    test_db.add(tenant)
    test_db.commit()
    test_db.refresh(tenant)
    return tenant


@pytest.fixture
def test_user(test_db, test_tenant):
    """Create test user"""
    user = User(
        email="test@example.com",
        name="Test User",
        hashed_password="hashed",
        tenant_id=test_tenant.id
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def other_user(test_db, other_tenant):
    """Create user in other tenant"""
    user = User(
        email="other@example.com",
        name="Other User",
        hashed_password="hashed",
        tenant_id=other_tenant.id
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def audit_service(test_db):
    """Get audit service instance"""
    return AuditService(test_db)


# ==================== Test 1: Actions Recorded ====================

class TestActionsRecorded:
    """Test that all required actions are properly logged"""
    
    def test_auth_login_action_recorded(self, audit_service, test_user):
        """Test authentication login action is logged"""
        log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        
        assert log.action == AuditAction.AUTH_LOGIN
        assert log.actor_email == test_user.email
        assert log.actor_user_id == test_user.id
        assert log.actor_ip == "192.168.1.1"
        assert log.status == AuditStatus.SUCCESS
    
    def test_auth_logout_action_recorded(self, audit_service, test_user):
        """Test authentication logout action is logged"""
        log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGOUT,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        
        assert log.action == AuditAction.AUTH_LOGOUT
        assert log.status == AuditStatus.SUCCESS
    
    def test_product_create_action_recorded(self, audit_service, test_user, test_tenant):
        """Test product creation action is logged"""
        log = audit_service.log_product_event(
            action=AuditAction.PRODUCT_CREATE,
            product_id=123,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=None,
            status=AuditStatus.SUCCESS,
            request_metadata={"sku": "TEST-SKU-123"}
        )
        
        assert log.action == AuditAction.PRODUCT_CREATE
        assert log.target_type == "product"
        assert log.target_id == "123"
        assert log.tenant_id == test_tenant.id
        assert log.request_metadata["sku"] == "TEST-SKU-123"
    
    def test_listing_publish_action_recorded(self, audit_service, test_user, test_tenant):
        """Test listing publish action is logged"""
        log = audit_service.log_listing_event(
            action=AuditAction.LISTING_PUBLISH,
            listing_id=789,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=1,
            status=AuditStatus.SUCCESS,
            attempt=1,
            latency_ms=3500
        )
        
        assert log.action == AuditAction.LISTING_PUBLISH
        assert log.target_type == "listing"
        assert log.target_id == "789"
        assert log.shop_id == 1
        assert log.attempt == 1
        assert log.latency_ms == 3500
    
    def test_listing_sync_action_recorded(self, audit_service, test_user, test_tenant):
        """Test listing sync action is logged"""
        log = audit_service.log_listing_event(
            action=AuditAction.LISTING_SYNC,
            listing_id=789,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=1,
            status=AuditStatus.SUCCESS
        )
        
        assert log.action == AuditAction.LISTING_SYNC
        assert log.status == AuditStatus.SUCCESS
    
    def test_ingestion_start_action_recorded(self, audit_service, test_user, test_tenant):
        """Test ingestion start action is logged"""
        log = audit_service.log_ingestion_event(
            action=AuditAction.INGESTION_START,
            batch_id=999,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=1,
            status=AuditStatus.PENDING,
            request_metadata={"filename": "products.csv", "row_count": 1000}
        )
        
        assert log.action == AuditAction.INGESTION_START
        assert log.target_type == "ingestion_batch"
        assert log.target_id == "999"
        assert log.status == AuditStatus.PENDING
        assert log.request_metadata["filename"] == "products.csv"
    
    def test_oauth_connect_action_recorded(self, audit_service, test_user, test_tenant):
        """Test OAuth connection action is logged"""
        log = audit_service.log_oauth_event(
            action=AuditAction.OAUTH_CONNECT,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=1,
            status=AuditStatus.SUCCESS,
            provider="etsy"
        )
        
        assert log.action == AuditAction.OAUTH_CONNECT
        assert log.target_type == "oauth_token"
        assert log.request_metadata["provider"] == "etsy"


# ==================== Test 2: Tenant Scoping ====================

class TestTenantScoping:
    """Test multi-tenant isolation in audit logs"""
    
    def test_audit_logs_isolated_by_tenant(self, audit_service, test_db, test_user, other_user, test_tenant, other_tenant):
        """Test that tenants can only see their own audit logs"""
        # Create logs for test tenant
        audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        
        # Create logs for other tenant
        audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=other_user.email,
            user_id=other_user.id,
            ip_address="192.168.1.2",
            status=AuditStatus.SUCCESS
        )
        
        # Query logs for test tenant
        test_tenant_logs = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == test_tenant.id
        ).all()
        
        # Query logs for other tenant
        other_tenant_logs = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == other_tenant.id
        ).all()
        
        # Each tenant should only see their own logs
        assert len(test_tenant_logs) == 1
        assert len(other_tenant_logs) == 1
        assert test_tenant_logs[0].actor_email == test_user.email
        assert other_tenant_logs[0].actor_email == other_user.email
    
    def test_tenant_cannot_access_other_tenant_logs(self, audit_service, test_db, test_user, other_user, test_tenant, other_tenant):
        """Test that cross-tenant access is blocked"""
        # Create log for other tenant
        other_log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=other_user.email,
            user_id=other_user.id,
            ip_address="192.168.1.2",
            status=AuditStatus.SUCCESS
        )
        
        # Try to query with wrong tenant_id
        found_log = test_db.query(AuditLog).filter(
            AuditLog.id == other_log.id,
            AuditLog.tenant_id == test_tenant.id  # Wrong tenant!
        ).first()
        
        # Should not find the log
        assert found_log is None
    
    def test_logs_without_tenant_id_accessible_by_all(self, audit_service, test_db):
        """Test system-level logs (no tenant_id) behavior"""
        # Create log without tenant_id (system-level)
        log = audit_service.log_action(
            action="system.startup",
            status=AuditStatus.SUCCESS,
            tenant_id=None,
            actor_email="system@internal"
        )
        
        # Should be queryable
        found = test_db.query(AuditLog).filter(
            AuditLog.id == log.id,
            AuditLog.tenant_id.is_(None)
        ).first()
        
        assert found is not None
        assert found.actor_email == "system@internal"


# ==================== Test 3: Pagination ====================

class TestPagination:
    """Test pagination works correctly"""
    
    def test_pagination_returns_correct_page_size(self, audit_service, test_db, test_user, test_tenant):
        """Test pagination returns exact page size requested"""
        # Create 25 audit logs
        for i in range(25):
            audit_service.log_product_event(
                action=AuditAction.PRODUCT_CREATE,
                product_id=i,
                user_id=test_user.id,
                tenant_id=test_tenant.id,
                shop_id=None,
                status=AuditStatus.SUCCESS
            )
        
        # Query page 1 with page_size=10
        page_size = 10
        offset = 0
        logs_page1 = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == test_tenant.id
        ).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size).all()
        
        assert len(logs_page1) == 10
        
        # Query page 2
        offset = 10
        logs_page2 = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == test_tenant.id
        ).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size).all()
        
        assert len(logs_page2) == 10
        
        # Query page 3 (only 5 items)
        offset = 20
        logs_page3 = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == test_tenant.id
        ).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size).all()
        
        assert len(logs_page3) == 5
    
    def test_pagination_total_count_accurate(self, audit_service, test_db, test_user, test_tenant):
        """Test total count is accurate for pagination"""
        # Create 47 audit logs
        for i in range(47):
            audit_service.log_product_event(
                action=AuditAction.PRODUCT_CREATE,
                product_id=i,
                user_id=test_user.id,
                tenant_id=test_tenant.id,
                shop_id=None,
                status=AuditStatus.SUCCESS
            )
        
        # Get total count
        total = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == test_tenant.id
        ).count()
        
        assert total == 47
        
        # Calculate total pages (page_size=10)
        page_size = 10
        total_pages = (total + page_size - 1) // page_size
        assert total_pages == 5  # 47 items = 5 pages (10+10+10+10+7)
    
    def test_pagination_handles_empty_results(self, test_db, test_tenant):
        """Test pagination with no results"""
        # Query non-existent page
        logs = test_db.query(AuditLog).filter(
            AuditLog.tenant_id == test_tenant.id
        ).offset(0).limit(10).all()
        
        assert len(logs) == 0


# ==================== Test 4: TTL Cleanup ====================

class TestTTLCleanup:
    """Test 30-day retention and cleanup"""
    
    def test_logs_older_than_30_days_deleted(self, audit_service, test_db, test_user, test_tenant):
        """Test that logs older than 30 days are deleted"""
        from app.worker.tasks.audit_cleanup import cleanup_old_audit_logs
        
        # Create old log (35 days ago)
        old_log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        old_log.created_at = datetime.now(timezone.utc) - timedelta(days=35)
        test_db.commit()
        
        # Create recent log (15 days ago)
        recent_log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        recent_log.created_at = datetime.now(timezone.utc) - timedelta(days=15)
        test_db.commit()
        
        # Run cleanup
        result = cleanup_old_audit_logs()
        
        # Verify old log deleted, recent log retained
        assert result["success"] == True
        assert result["deleted_count"] == 1
        
        # Check database
        remaining_logs = test_db.query(AuditLog).all()
        assert len(remaining_logs) == 1
        assert remaining_logs[0].id == recent_log.id
    
    def test_logs_within_30_days_retained(self, audit_service, test_db, test_user, test_tenant):
        """Test that logs within 30 days are retained"""
        # Create logs at various ages within 30 days
        for days_ago in [1, 5, 10, 15, 20, 25, 29]:
            log = audit_service.log_auth_event(
                action=AuditAction.AUTH_LOGIN,
                email=test_user.email,
                user_id=test_user.id,
                ip_address="192.168.1.1",
                status=AuditStatus.SUCCESS
            )
            log.created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
            test_db.commit()
        
        # Count before cleanup
        count_before = test_db.query(AuditLog).count()
        assert count_before == 7
        
        # Run cleanup
        from app.worker.tasks.audit_cleanup import cleanup_old_audit_logs
        result = cleanup_old_audit_logs()
        
        # All logs should be retained
        assert result["deleted_count"] == 0
        count_after = test_db.query(AuditLog).count()
        assert count_after == 7
    
    def test_cleanup_returns_statistics(self, audit_service, test_db, test_user):
        """Test cleanup task returns proper statistics"""
        from app.worker.tasks.audit_cleanup import cleanup_old_audit_logs
        
        # Create mix of old and recent logs
        for i in range(5):
            log = audit_service.log_auth_event(
                action=AuditAction.AUTH_LOGIN,
                email=test_user.email,
                user_id=test_user.id,
                ip_address="192.168.1.1",
                status=AuditStatus.SUCCESS
            )
            log.created_at = datetime.now(timezone.utc) - timedelta(days=35 + i)
            test_db.commit()
        
        # Run cleanup
        result = cleanup_old_audit_logs()
        
        # Verify statistics
        assert "success" in result
        assert "deleted_count" in result
        assert "cutoff_date" in result
        assert "message" in result
        assert result["success"] == True
        assert result["deleted_count"] == 5


# ==================== Test 5: Metadata Sanitization ====================

class TestMetadataSanitization:
    """Test that sensitive data is sanitized"""
    
    def test_password_field_sanitized(self, audit_service, test_user):
        """Test password fields are redacted"""
        metadata = {
            "email": "user@example.com",
            "password": "super_secret_password",
            "name": "Test User"
        }
        
        sanitized = AuditLog.sanitize_metadata(metadata)
        
        assert sanitized["email"] == "user@example.com"
        assert sanitized["password"] == "[REDACTED]"
        assert sanitized["name"] == "Test User"
    
    def test_token_fields_sanitized(self, audit_service):
        """Test token fields are redacted"""
        metadata = {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "refresh_token": "refresh_abc123",
            "api_key": "sk_test_12345"
        }
        
        sanitized = AuditLog.sanitize_metadata(metadata)
        
        assert sanitized["access_token"] == "[REDACTED]"
        assert sanitized["refresh_token"] == "[REDACTED]"
        assert sanitized["api_key"] == "[REDACTED]"
    
    def test_nested_dict_sanitization(self, audit_service):
        """Test nested dictionaries are sanitized recursively"""
        metadata = {
            "user": {
                "email": "user@example.com",
                "password": "secret123",
                "profile": {
                    "name": "Test",
                    "secret": "hidden"
                }
            }
        }
        
        sanitized = AuditLog.sanitize_metadata(metadata)
        
        assert sanitized["user"]["email"] == "user@example.com"
        assert sanitized["user"]["password"] == "[REDACTED]"
        assert sanitized["user"]["profile"]["name"] == "Test"
        assert sanitized["user"]["profile"]["secret"] == "[REDACTED]"
    
    def test_large_strings_truncated(self, audit_service):
        """Test large strings are truncated"""
        large_string = "x" * 1500
        metadata = {"data": large_string}
        
        sanitized = AuditLog.sanitize_metadata(metadata)
        
        assert len(sanitized["data"]) == 1017  # 1000 chars + "... [TRUNCATED]"
        assert sanitized["data"].endswith("... [TRUNCATED]")


# ==================== Test 6: Filtering ====================

class TestFiltering:
    """Test audit log filtering"""
    
    def test_filter_by_action(self, audit_service, test_db, test_user, test_tenant):
        """Test filtering by action type"""
        # Create different actions
        audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        
        audit_service.log_product_event(
            action=AuditAction.PRODUCT_CREATE,
            product_id=123,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=None,
            status=AuditStatus.SUCCESS
        )
        
        # Filter by AUTH_LOGIN
        login_logs = test_db.query(AuditLog).filter(
            AuditLog.action == AuditAction.AUTH_LOGIN
        ).all()
        
        assert len(login_logs) == 1
        assert login_logs[0].action == AuditAction.AUTH_LOGIN
    
    def test_filter_by_status(self, audit_service, test_db, test_user, test_tenant):
        """Test filtering by status"""
        # Create success and failure logs
        audit_service.log_product_event(
            action=AuditAction.PRODUCT_CREATE,
            product_id=1,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=None,
            status=AuditStatus.SUCCESS
        )
        
        audit_service.log_product_event(
            action=AuditAction.PRODUCT_CREATE,
            product_id=2,
            user_id=test_user.id,
            tenant_id=test_tenant.id,
            shop_id=None,
            status=AuditStatus.FAILURE,
            error_message="Test error"
        )
        
        # Filter by SUCCESS
        success_logs = test_db.query(AuditLog).filter(
            AuditLog.status == AuditStatus.SUCCESS
        ).all()
        
        assert len(success_logs) == 1
        
        # Filter by FAILURE
        failure_logs = test_db.query(AuditLog).filter(
            AuditLog.status == AuditStatus.FAILURE
        ).all()
        
        assert len(failure_logs) == 1
        assert failure_logs[0].error_message == "Test error"
    
    def test_filter_by_date_range(self, audit_service, test_db, test_user, test_tenant):
        """Test filtering by date range"""
        # Create logs at different times
        old_log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        old_log.created_at = datetime.now(timezone.utc) - timedelta(days=10)
        test_db.commit()
        
        recent_log = audit_service.log_auth_event(
            action=AuditAction.AUTH_LOGIN,
            email=test_user.email,
            user_id=test_user.id,
            ip_address="192.168.1.1",
            status=AuditStatus.SUCCESS
        )
        recent_log.created_at = datetime.now(timezone.utc) - timedelta(days=2)
        test_db.commit()
        
        # Filter logs from last 5 days
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        recent_logs = test_db.query(AuditLog).filter(
            AuditLog.created_at >= cutoff
        ).all()
        
        assert len(recent_logs) == 1
        assert recent_logs[0].id == recent_log.id


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

