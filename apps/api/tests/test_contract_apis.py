"""
Contract Tests for All APIs
Validates API contracts, request/response schemas, status codes
"""
import pytest
from fastapi.testclient import TestClient


class TestAuthAPI:
    """Contract tests for authentication endpoints"""
    
    def test_login_contract(self, client: TestClient):
        """Test /api/auth/login contract"""
        response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        }, headers={"Idempotency-Key": "test-login-1"})
        
        # Should return 200 or 401
        assert response.status_code in [200, 401]
        
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            assert "token_type" in data
            assert data["token_type"] == "bearer"
    
    def test_register_contract(self, client: TestClient):
        """Test /api/auth/register contract"""
        response = client.post("/api/auth/register", json={
            "email": "new@example.com",
            "password": "password123",
            "tenant_name": "New Tenant",
            "name": "New User"
        }, headers={"Idempotency-Key": "test-register-1"})
        
        assert response.status_code in [200, 201, 400, 409]
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert "id" in data
            assert "email" in data


class TestProductsAPI:
    """Contract tests for products endpoints"""
    
    def test_list_products_contract(self, client: TestClient, access_token: str):
        """Test GET /api/products contract"""
        response = client.get(
            "/api/products",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        if len(data) > 0:
            product = data[0]
            assert "id" in product
            assert "sku" in product
            assert "title_raw" in product
            assert "price" in product
    
    def test_create_product_contract(self, client: TestClient, access_token: str):
        """Test POST /api/products contract"""
        response = client.post(
            "/api/products",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Idempotency-Key": "test-product-1",
            },
            json={
                "sku": "TEST-001",
                "title_raw": "Test Product",
                "description_raw": "Test description",
                "price": 29.99,
                "quantity": 10
            }
        )
        
        assert response.status_code in [200, 201, 400, 403]
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert "id" in data
            assert data["sku"] == "TEST-001"


class TestSchedulesAPI:
    """Contract tests for schedules endpoints"""
    
    def test_list_schedules_contract(self, client: TestClient, access_token: str):
        """Test GET /api/schedules contract"""
        response = client.get(
            "/api/schedules",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestAuditLogsAPI:
    """Contract tests for audit logs endpoints"""
    
    def test_list_audit_logs_contract(self, client: TestClient, access_token: str):
        """Test GET /api/audit-logs contract"""
        response = client.get(
            "/api/audit-logs",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data
        assert "total" in data
        assert "page" in data


class TestFinancialsAPI:
    """Contract tests for financial endpoints"""

    def test_financials_sync_status_contract(self, client: TestClient, access_token: str):
        """Test GET /api/financials/sync-status contract"""
        response = client.get(
            "/api/financials/sync-status",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "shops" in data
        assert isinstance(data["shops"], dict)

    def test_financials_discounts_contract(self, client: TestClient, access_token: str):
        """Test GET /api/financials/discounts contract"""
        response = client.get(
            "/api/financials/discounts",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_discounts" in data
        assert "order_count_with_discounts" in data
        assert "currency" in data
        assert "period_start" in data
        assert "period_end" in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

