"""
Load Tests using Locust
Tests: 1k listings across 10 shops
Run: locust -f load_tests/locustfile.py --host=http://localhost:8080
"""
from locust import HttpUser, task, between, events
import random
import json


class EtsyAutomationUser(HttpUser):
    """Simulated user for load testing"""
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks
    
    def on_start(self):
        """Setup: Login and get token"""
        # Login
        response = self.client.post("/api/auth/login", json={
            "email": f"loadtest+{random.randint(1, 100)}@test.com",
            "password": "LoadTest123!"
        })
        
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            # Create user if doesn't exist
            register_response = self.client.post("/api/auth/register", json={
                "email": f"loadtest+{random.randint(1, 100)}@test.com",
                "password": "LoadTest123!",
                "tenant_name": f"Load Test Tenant {random.randint(1, 10)}"
            })
            
            if register_response.status_code in [200, 201]:
                # Login again
                login_response = self.client.post("/api/auth/login", json={
                    "email": register_response.json()["email"],
                    "password": "LoadTest123!"
                })
                self.token = login_response.json()["access_token"]
                self.headers = {"Authorization": f"Bearer {self.token}"}
    
    @task(5)
    def list_products(self):
        """List products (most common operation)"""
        self.client.get("/api/products", headers=self.headers, name="/api/products [LIST]")
    
    @task(3)
    def get_product(self):
        """Get single product"""
        product_id = random.randint(1, 1000)
        self.client.get(f"/api/products/{product_id}", headers=self.headers, name="/api/products/[id] [GET]")
    
    @task(2)
    def create_product(self):
        """Create product"""
        self.client.post("/api/products", headers=self.headers, json={
            "sku": f"LOAD-{random.randint(1, 10000)}",
            "title_raw": f"Load Test Product {random.randint(1, 1000)}",
            "description_raw": "Handmade load test product",
            "price": round(random.uniform(10, 100), 2),
            "quantity": random.randint(1, 100)
        }, name="/api/products [CREATE]")
    
    @task(1)
    def generate_ai_content(self):
        """Generate AI content"""
        product_id = random.randint(1, 1000)
        self.client.post(
            f"/api/products/{product_id}/generate",
            headers=self.headers,
            json={"fields": ["title", "description"]},
            name="/api/products/[id]/generate [AI]"
        )
    
    @task(1)
    def publish_listing(self):
        """Publish listing"""
        self.client.post("/api/listings/publish", headers=self.headers, json={
            "product_id": random.randint(1, 1000),
            "shop_id": random.randint(1, 10)
        }, name="/api/listings/publish [PUBLISH]")
    
    @task(4)
    def list_schedules(self):
        """List schedules"""
        self.client.get("/api/schedules", headers=self.headers, name="/api/schedules [LIST]")
    
    @task(2)
    def get_audit_logs(self):
        """Get audit logs"""
        self.client.get("/api/audit-logs?page=1&limit=50", headers=self.headers, name="/api/audit-logs [LIST]")
    
    @task(1)
    def health_check(self):
        """Health check"""
        self.client.get("/api/health", name="/api/health [HEALTH]")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Setup before load test starts"""
    print("=" * 60)
    print("🚀 Load Test Starting")
    print("=" * 60)
    print(f"Target: {environment.host}")
    print(f"Users: {environment.runner.target_user_count if hasattr(environment.runner, 'target_user_count') else 'N/A'}")
    print("=" * 60)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Cleanup after load test"""
    print("=" * 60)
    print("✅ Load Test Completed")
    print("=" * 60)
    
    stats = environment.runner.stats
    print(f"Total Requests: {stats.total.num_requests}")
    print(f"Total Failures: {stats.total.num_failures}")
    print(f"Failure Rate: {stats.total.fail_ratio * 100:.2f}%")
    print(f"Median Response Time: {stats.total.median_response_time}ms")
    print(f"95th Percentile: {stats.total.get_response_time_percentile(0.95)}ms")
    print(f"Requests/sec: {stats.total.total_rps:.2f}")
    print("=" * 60)


# Run with: locust -f load_tests/locustfile.py --host=http://localhost:8080 --users=100 --spawn-rate=10

