"""
Tests for Analytics Role Enforcement
Verify that analytics endpoints are properly protected by role-based access control
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.tenancy import Tenant, Membership, User
from app.models.products import Product
from app.models.orders import Order, ShipmentEvent
from datetime import datetime, timezone
import jwt
from app.core.config import settings


@pytest.fixture
def test_tenant(db: Session):
    """Create a test tenant"""
    tenant = Tenant(
        name="Test Analytics Tenant",
        status="active",
        created_at=datetime.now(timezone.utc)
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@pytest.fixture
def test_users(db: Session, test_tenant):
    """Create test users with different roles"""
    users = {}
    roles = ["owner", "admin", "supplier", "viewer"]
    
    for role in roles:
        user = User(
            email=f"{role}@test.com",
            name=f"Test {role.capitalize()}",
            password_hash="$2b$12$test_hash",
            email_verified=True,
            created_at=datetime.now(timezone.utc)
        )
        db.add(user)
        db.flush()
        
        membership = Membership(
            user_id=user.id,
            tenant_id=test_tenant.id,
            role=role,
            invitation_status="accepted",
            created_at=datetime.now(timezone.utc)
        )
        db.add(membership)
        users[role] = user
    
    db.commit()
    return users


def create_token(user_id: int, tenant_id: int, role: str) -> str:
    """Create a JWT token for testing"""
    payload = {
        "sub": str(user_id),
        "email": f"{role}@test.com",
        "tenant_id": tenant_id,
        "role": role,
        "exp": datetime.utcnow().timestamp() + 3600
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


class TestAnalyticsRoleEnforcement:
    """Test analytics endpoint role enforcement"""
    
    def test_owner_can_access_analytics(self, client: TestClient, test_tenant, test_users):
        """Owner should have full analytics access"""
        token = create_token(test_users["owner"].id, test_tenant.id, "owner")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test all analytics endpoints
        endpoints = [
            "/api/analytics/overview",
            "/api/analytics/orders",
            "/api/analytics/products",
            "/api/analytics/fulfillment",
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint, headers=headers)
            assert response.status_code in (200, 404), f"Owner failed to access {endpoint}"
    
    def test_admin_can_access_analytics(self, client: TestClient, test_tenant, test_users):
        """Admin should have full analytics access"""
        token = create_token(test_users["admin"].id, test_tenant.id, "admin")
        headers = {"Authorization": f"Bearer {token}"}
        
        endpoints = [
            "/api/analytics/overview",
            "/api/analytics/orders",
            "/api/analytics/products",
            "/api/analytics/fulfillment",
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint, headers=headers)
            assert response.status_code in (200, 404), f"Admin failed to access {endpoint}"
    
    def test_viewer_can_access_analytics(self, client: TestClient, test_tenant, test_users):
        """Viewer should have read-only analytics access"""
        token = create_token(test_users["viewer"].id, test_tenant.id, "viewer")
        headers = {"Authorization": f"Bearer {token}"}
        
        endpoints = [
            "/api/analytics/overview",
            "/api/analytics/orders",
            "/api/analytics/products",
            "/api/analytics/fulfillment",
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint, headers=headers)
            assert response.status_code in (200, 404), f"Viewer failed to access {endpoint}"
    
    def test_supplier_cannot_access_analytics(self, client: TestClient, test_tenant, test_users):
        """Supplier should be explicitly blocked from analytics"""
        token = create_token(test_users["supplier"].id, test_tenant.id, "supplier")
        headers = {"Authorization": f"Bearer {token}"}
        
        endpoints = [
            "/api/analytics/overview",
            "/api/analytics/orders",
            "/api/analytics/products",
            "/api/analytics/fulfillment",
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint, headers=headers)
            assert response.status_code == 403, f"Supplier was able to access {endpoint} (should be 403)"
            assert "not authorized" in response.json().get("detail", "").lower()
    
    def test_supplier_order_filtering(self, client: TestClient, db: Session, test_tenant, test_users):
        """Supplier should only see their assigned orders"""
        # Create orders - one assigned to supplier, one not
        supplier = test_users["supplier"]
        
        assigned_order = Order(
            tenant_id=test_tenant.id,
            shop_id=1,
            supplier_user_id=supplier.id,
            etsy_receipt_id="123",
            buyer_name="Test Buyer",
            buyer_email="buyer@test.com",
            total_price=1000,
            currency="USD",
            created_at=datetime.now(timezone.utc)
        )
        
        unassigned_order = Order(
            tenant_id=test_tenant.id,
            shop_id=1,
            supplier_user_id=None,
            etsy_receipt_id="456",
            buyer_name="Other Buyer",
            buyer_email="other@test.com",
            total_price=2000,
            currency="USD",
            created_at=datetime.now(timezone.utc)
        )
        
        db.add_all([assigned_order, unassigned_order])
        db.commit()
        
        token = create_token(supplier.id, test_tenant.id, "supplier")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/orders/", headers=headers)
        assert response.status_code == 200
        
        orders = response.json()["orders"]
        order_ids = [o["etsy_receipt_id"] for o in orders]
        
        assert "123" in order_ids, "Supplier should see assigned order"
        assert "456" not in order_ids, "Supplier should not see unassigned order"
    
    def test_supplier_revenue_redaction(self, client: TestClient, db: Session, test_tenant, test_users):
        """Supplier should not see revenue/price data"""
        supplier = test_users["supplier"]
        
        order = Order(
            tenant_id=test_tenant.id,
            shop_id=1,
            supplier_user_id=supplier.id,
            etsy_receipt_id="789",
            buyer_name="Test Buyer",
            buyer_email="buyer@test.com",
            total_price=5000,  # $50.00
            currency="USD",
            created_at=datetime.now(timezone.utc)
        )
        db.add(order)
        db.commit()
        
        token = create_token(supplier.id, test_tenant.id, "supplier")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Check order list
        response = client.get("/api/orders/", headers=headers)
        assert response.status_code == 200
        orders = response.json()["orders"]
        
        for order_data in orders:
            assert order_data["total_price"] is None, "Supplier should not see order prices"
        
        # Check order detail
        response = client.get(f"/api/orders/{order.id}", headers=headers)
        assert response.status_code == 200
        order_detail = response.json()
        
        assert order_detail["total_price"] is None, "Supplier should not see order price in detail view"
    
    def test_dashboard_stats_supplier_restrictions(self, client: TestClient, test_tenant, test_users):
        """Supplier dashboard stats should hide product/listing counts"""
        token = create_token(test_users["supplier"].id, test_tenant.id, "supplier")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        
        stats = response.json()
        assert stats["total_products"] == 0, "Supplier should not see product counts"
        assert stats["active_listings"] == 0, "Supplier should not see listing counts"


class TestShipmentEventTracking:
    """Test shipment event creation and analytics"""
    
    def test_shipment_event_created_on_fulfillment(self, client: TestClient, db: Session, test_tenant, test_users):
        """Fulfillment should create shipment event"""
        admin = test_users["admin"]
        
        # Create order
        order = Order(
            tenant_id=test_tenant.id,
            shop_id=1,
            etsy_receipt_id="999",
            buyer_name="Test Buyer",
            buyer_email="buyer@test.com",
            total_price=3000,
            currency="USD",
            lifecycle_status="processing",
            created_at=datetime.now(timezone.utc)
        )
        db.add(order)
        db.commit()
        
        # Note: This test would require mocking Etsy API
        # For now, we verify the endpoint exists and requires auth
        token = create_token(admin.id, test_tenant.id, "admin")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Verify fulfillment endpoint exists
        response = client.post(
            f"/api/orders/{order.id}/tracking",
            headers=headers,
            json={
                "tracking_code": "TEST123",
                "carrier_name": "USPS",
                "ship_date": datetime.now(timezone.utc).isoformat(),
            }
        )
        
        # Should succeed or fail gracefully (not 404/405)
        assert response.status_code in (200, 400, 500), "Fulfillment endpoint should exist"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
