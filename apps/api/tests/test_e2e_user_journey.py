"""
End-to-End Tests - Complete User Journey
Tests: login → connect shop → ingest → generate → schedule → publish → sync
"""
import pytest
from fastapi.testclient import TestClient
import time


class TestCompleteUserJourney:
    """E2E test for complete user workflow"""
    
    def test_full_user_journey(self, client: TestClient, db):
        """
        Test complete flow:
        1. Register user
        2. Login
        3. Connect Etsy shop (OAuth)
        4. Ingest products (CSV)
        5. Generate AI content
        6. Create schedule
        7. Publish listing
        8. Sync orders
        """
        
        # Step 1: Register
        register_response = client.post("/api/auth/register", json={
            "email": "e2e@test.com",
            "password": "SecurePass123!",
            "tenant_name": "E2E Test Tenant",
            "name": "E2E User"
        }, headers={"Idempotency-Key": "e2e-register-1"})
        assert register_response.status_code in [200, 201]
        
        # Step 2: Login
        login_response = client.post("/api/auth/login", json={
            "email": "e2e@test.com",
            "password": "SecurePass123!"
        }, headers={"Idempotency-Key": "e2e-login-1"})
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Step 3: Connect Shop (simulate OAuth)
        # In real test, would use Playwright to complete OAuth flow
        shop_response = client.post(
            "/api/shops",
            headers={**headers, "Idempotency-Key": "e2e-shop-1"},
            json={
                "shop_name": "E2E Test Shop",
                "etsy_shop_id": "12345678"
            }
        )
        assert shop_response.status_code in [200, 201]
        shop_id = shop_response.json()["id"]
        
        # Step 4: Ingest Products
        csv_content = b"""sku,title,description,price,quantity
E2E-001,Handmade Mug,Beautiful handmade ceramic mug,29.99,10
E2E-002,Handmade Bowl,Artisan handmade bowl,39.99,5"""
        
        files = {"file": ("products.csv", csv_content, "text/csv")}
        ingest_response = client.post(
            f"/api/ingestion/upload?shop_id={shop_id}",
            headers={**headers, "Idempotency-Key": "e2e-ingest-1"},
            files=files
        )
        assert ingest_response.status_code in [200, 202]
        batch_id = ingest_response.json().get("batch_id")
        
        # Wait for ingestion to complete
        time.sleep(2)
        
        # Check ingestion status
        status_response = client.get(
            f"/api/ingestion/batch/{batch_id}/status",
            headers=headers
        )
        assert status_response.status_code == 200
        assert status_response.json()["status"] in ["completed", "processing"]
        
        # Step 5: Get products
        products_response = client.get(
            f"/api/products?shop_id={shop_id}",
            headers=headers
        )
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) > 0
        product_id = products[0]["id"]
        
        # Step 6: Generate AI content
        ai_response = client.post(
            f"/api/products/{product_id}/generate",
            headers={**headers, "Idempotency-Key": "e2e-generate-1"},
            json={"fields": ["title", "description", "tags"]}
        )
        assert ai_response.status_code in [200, 202]
        
        # Step 7: Create schedule
        schedule_response = client.post(
            "/api/schedules",
            headers={**headers, "Idempotency-Key": "e2e-schedule-1"},
            json={
                "name": "E2E Test Schedule",
                "shop_id": shop_id,
                "cron_expr": "0 9 * * *",
                "daily_quota": 150,
                "status": "active"
            }
        )
        assert schedule_response.status_code in [200, 201]
        
        # Step 8: Publish listing
        publish_response = client.post(
            f"/api/listings/publish",
            headers={**headers, "Idempotency-Key": "e2e-publish-1"},
            json={
                "product_id": product_id,
                "shop_id": shop_id
            }
        )
        assert publish_response.status_code in [200, 202]
        
        # Step 9: Sync orders (if shop connected)
        sync_response = client.post(
            f"/api/orders/sync?shop_id={shop_id}",
            headers={**headers, "Idempotency-Key": "e2e-sync-1"}
        )
        assert sync_response.status_code in [200, 202]
        
        # Verify end state
        final_products = client.get(f"/api/products", headers=headers)
        assert final_products.status_code == 200
        assert len(final_products.json()) >= 2  # Should have ingested products


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])

