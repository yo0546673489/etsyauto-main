"""
Load Testing with Locust
Tests system performance under load:
- 1,000 listings across 10 shops
- Concurrent users performing typical workflows
- Monitors response times, throughput, error rates

Run: locust -f locustfile.py --host=http://localhost:8080
"""

from locust import HttpUser, task, between, events
import random
import json
from datetime import datetime

# Test credentials (use test tenant in non-prod)
TEST_EMAIL = "load_test@example.com"
TEST_PASSWORD = "LoadTest123!"
TEST_SHOPS = list(range(1, 11))  # Shop IDs 1-10


class EtsyAutomationUser(HttpUser):
    """
    Simulates a typical user workflow:
    1. Login
    2. Create/manage products
    3. Generate AI content
    4. Publish listings to Etsy
    5. Sync orders
    """
    wait_time = between(1, 3)  # Wait 1-3s between tasks
    
    def on_start(self):
        """Login and get auth token"""
        response = self.client.post("/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }, headers={"Idempotency-Key": f"load-login-{self.environment.runner.user_count}-{datetime.utcnow().timestamp()}"})
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            self.shop_id = random.choice(TEST_SHOPS)
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            self.environment.runner.quit()

    @task(3)
    def list_products(self):
        """List products for a shop"""
        self.client.get(
            f"/api/products/?skip=0&limit=50&shop_id={self.shop_id}",
            headers=self.headers,
            name="/api/products (list)"
        )

    @task(2)
    def get_dashboard_stats(self):
        """Get dashboard statistics"""
        self.client.get(
            f"/api/dashboard/stats?shop_id={self.shop_id}",
            headers=self.headers,
            name="/api/dashboard/stats"
        )

    @task(2)
    def list_orders(self):
        """List orders for a shop"""
        self.client.get(
            f"/api/orders/?skip=0&limit=10&shop_id={self.shop_id}",
            headers=self.headers,
            name="/api/orders (list)"
        )

    @task(1)
    def create_product(self):
        """Create a new product"""
        product_id = random.randint(1000, 999999)
        idempotency_key = f"load-product-{self.environment.runner.user_count}-{product_id}"
        
        self.client.post(
            "/api/products/",
            json={
                "shop_id": self.shop_id,
                "title": f"Load Test Product {product_id}",
                "description": "Test product for load testing",
                "price": round(random.uniform(10.0, 100.0), 2),
                "quantity": random.randint(1, 100),
                "tags": ["test", "load"],
                "materials": ["test material"],
                "production_partner_ids": []
            },
            headers={**self.headers, "Idempotency-Key": idempotency_key},
            name="/api/products (create)"
        )

    @task(1)
    def sync_orders(self):
        """Trigger order sync"""
        idempotency_key = f"load-sync-{self.environment.runner.user_count}-{datetime.utcnow().timestamp()}"
        
        self.client.post(
            f"/api/orders/sync?shop_id={self.shop_id}",
            headers={**self.headers, "Idempotency-Key": idempotency_key},
            name="/api/orders/sync"
        )

    @task(1)
    def check_listing_jobs(self):
        """Check listing job status"""
        self.client.get(
            f"/api/listings/jobs?shop_id={self.shop_id}",
            headers=self.headers,
            name="/api/listings/jobs"
        )


class AdminUser(HttpUser):
    """
    Simulates admin tasks:
    - Bulk operations
    - Shop management
    - Team management
    """
    wait_time = between(2, 5)
    weight = 1  # Less frequent than regular users
    
    def on_start(self):
        """Login as admin"""
        response = self.client.post("/api/auth/login", json={
            "email": "admin@example.com",
            "password": "Admin123!"
        }, headers={"Idempotency-Key": f"load-admin-login-{datetime.utcnow().timestamp()}"})
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }

    @task(2)
    def list_all_shops(self):
        """List all shops"""
        self.client.get("/api/shops/", headers=self.headers, name="/api/shops (admin)")

    @task(1)
    def view_audit_logs(self):
        """View audit logs"""
        self.client.get(
            "/api/audit/?skip=0&limit=50",
            headers=self.headers,
            name="/api/audit (admin)"
        )

    @task(1)
    def get_metrics(self):
        """Get Prometheus metrics"""
        self.client.get("/metrics", name="/metrics")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Print test configuration"""
    print("\n" + "="*60)
    print("LOAD TEST STARTING")
    print("="*60)
    print(f"Target: {environment.host}")
    print(f"Test users: {environment.runner.target_user_count if hasattr(environment.runner, 'target_user_count') else 'N/A'}")
    print("Scenarios: Product creation, order sync, listing jobs")
    print("="*60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Print test summary"""
    print("\n" + "="*60)
    print("LOAD TEST COMPLETED")
    print("="*60)
    stats = environment.stats
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Failed requests: {stats.total.num_failures}")
    print(f"Median response time: {stats.total.median_response_time}ms")
    print(f"95th percentile: {stats.total.get_response_time_percentile(0.95)}ms")
    print(f"Requests/sec: {stats.total.total_rps:.2f}")
    print("="*60 + "\n")


# Scenario: 1000 listings across 10 shops
# - 50 concurrent users
# - Each user creates ~20 products
# - Ramp up over 60 seconds
# - Run for 10 minutes
#
# Command:
# locust -f locustfile.py --host=http://localhost:8080 \
#        --users 50 --spawn-rate 5 --run-time 10m --headless
