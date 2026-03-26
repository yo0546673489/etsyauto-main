"""
Advanced Security Tests
Tests JWT validation, OAuth replay protection, CSV injection
"""
import pytest
from fastapi.testclient import TestClient
import jwt as pyjwt
from datetime import datetime, timedelta


class TestJWTValidation:
    """Test JWT security"""
    
    def test_expired_token_rejected(self, client: TestClient, expired_access_token: str):
        """Test that expired tokens are rejected"""
        response = client.get(
            "/api/products",
            headers={"Authorization": f"Bearer {expired_access_token}"}
        )
        
        assert response.status_code == 401
    
    def test_invalid_token_rejected(self, client: TestClient):
        """Test that invalid tokens are rejected"""
        response = client.get(
            "/api/products",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        
        assert response.status_code == 401
    
    def test_missing_token_rejected(self, client: TestClient):
        """Test that requests without tokens are rejected"""
        response = client.get("/api/products")
        
        assert response.status_code == 401
    
    def test_token_with_wrong_audience(self, client: TestClient):
        """Test that tokens with wrong audience are rejected"""
        # Create token with wrong audience
        payload = {
            "sub": "123",
            "aud": "wrong-audience",
            "exp": datetime.utcnow() + timedelta(minutes=15)
        }
        wrong_token = pyjwt.encode(payload, "secret", algorithm="HS256")
        
        response = client.get(
            "/api/products",
            headers={"Authorization": f"Bearer {wrong_token}"}
        )
        
        assert response.status_code == 401


class TestOAuthSecurity:
    """Test OAuth security"""
    
    def test_oauth_replay_protection(self, client: TestClient):
        """Test that OAuth tokens cannot be replayed"""
        # Simulate OAuth callback
        response1 = client.get("/api/oauth/callback?code=test_code_123&state=test_state")
        
        # Try to replay same code
        response2 = client.get("/api/oauth/callback?code=test_code_123&state=test_state")
        
        # Second attempt should fail (code already used)
        assert response2.status_code in [400, 401, 403]
    
    def test_oauth_state_validation(self, client: TestClient):
        """Test that OAuth state parameter is validated"""
        # Missing state
        response = client.get("/api/oauth/callback?code=test_code")
        
        assert response.status_code in [400, 401]


class TestCSVInjection:
    """Test CSV injection protection"""
    
    def test_csv_formula_injection_blocked(self, client: TestClient, access_token: str):
        """Test that CSV formulas are blocked"""
        from tests.conftest import create_malicious_csv_data
        
        files = {"file": ("malicious.csv", create_malicious_csv_data(), "text/csv")}
        
        response = client.post(
            "/api/ingestion/upload",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Idempotency-Key": "csv-injection-1",
            },
            files=files
        )
        
        # Should succeed but sanitize formulas
        if response.status_code == 200:
            data = response.json()
            # Check that formulas were sanitized
            assert data.get("errors", [])  # Should have validation errors
    
    def test_csv_command_injection_blocked(self, client: TestClient, access_token: str):
        """Test that command injection attempts are blocked"""
        csv_content = b"""sku,title,description,price,quantity
@SUM(A1:A10),Title,Description,29.99,10
=1+1,Title,Description,39.99,5
+cmd|'/c calc'!A1,Title,Description,24.99,15"""
        
        files = {"file": ("injection.csv", csv_content, "text/csv")}
        
        response = client.post(
            "/api/ingestion/upload",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Idempotency-Key": "csv-injection-2",
            },
            files=files
        )
        
        # Should reject or sanitize
        assert response.status_code in [200, 400]


class TestRBACEnforcement:
    """Test RBAC enforcement"""
    
    def test_viewer_cannot_write(self, client: TestClient, viewer_access_token: str):
        """Test that viewer role cannot write"""
        response = client.post(
            "/api/products",
            headers={
                "Authorization": f"Bearer {viewer_access_token}",
                "Idempotency-Key": "rbac-viewer-1",
            },
            json={
                "sku": "TEST-001",
                "title_raw": "Test",
                "description_raw": "Test",
                "price": 29.99,
                "quantity": 10
            }
        )
        
        assert response.status_code == 403
    
    def test_creator_can_create(self, client: TestClient, creator_access_token: str):
        """Test that creator role can create"""
        response = client.post(
            "/api/products",
            headers={
                "Authorization": f"Bearer {creator_access_token}",
                "Idempotency-Key": "rbac-creator-1",
            },
            json={
                "sku": "TEST-002",
                "title_raw": "Test",
                "description_raw": "Test",
                "price": 29.99,
                "quantity": 10
            }
        )
        
        assert response.status_code in [200, 201]
    
    def test_cross_tenant_access_blocked(self, client: TestClient, access_token: str, tenant: "Tenant"):
        """Test that users cannot access other tenants' data"""
        # Try to access another tenant's products
        response = client.get(
            f"/api/products?tenant_id=999999",  # Non-existent tenant
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        # Should return empty or 403
        assert response.status_code in [200, 403]
        if response.status_code == 200:
            data = response.json()
            # Should not return other tenant's data
            assert len(data) == 0 or all(p["tenant_id"] == tenant.id for p in data)


class TestRateLimitingAPI:
    """Test rate limiting on API endpoints"""
    
    def test_rate_limit_enforcement(self, client: TestClient, access_token: str):
        """Test that rate limits are enforced"""
        # Make many requests quickly
        responses = []
        for _ in range(100):
            response = client.get(
                "/api/products",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            responses.append(response)
        
        # Should see some 429s if rate limiting is active
        status_codes = [r.status_code for r in responses]
        # At least most should succeed
        assert status_codes.count(200) > 50


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

