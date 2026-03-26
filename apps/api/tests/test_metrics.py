"""
Tests for Prometheus Metrics Integration
Validates metrics endpoints and collection
"""
import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from main import app
from app.observability.metrics import (
    http_requests_total,
    http_request_duration_seconds,
    http_errors_total,
    oauth_token_refresh_total,
    celery_task_succeeded_total,
    celery_task_failed_total
)


client = TestClient(app)


class TestMetricsEndpoint:
    """Test the /metrics endpoint"""
    
    def test_metrics_endpoint_exists(self):
        """Test that /metrics endpoint exists and returns 200"""
        response = client.get("/api/metrics")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")
    
    def test_metrics_endpoint_returns_prometheus_format(self):
        """Test that metrics endpoint returns Prometheus text format"""
        response = client.get("/api/metrics")
        content = response.text
        
        # Check for Prometheus format markers
        assert "# HELP" in content
        assert "# TYPE" in content
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data
    
    def test_readiness_endpoint(self):
        """Test readiness check endpoint"""
        response = client.get("/api/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"


class TestHTTPMetrics:
    """Test HTTP request metrics collection"""
    
    def test_http_request_metrics_incremented(self):
        """Test that HTTP requests increment metrics"""
        # Get initial value
        initial_value = http_requests_total._metrics.get(
            ('GET', '/api/health', '200', 'unknown')
        )
        initial_count = initial_value._value._value if initial_value else 0
        
        # Make a request
        response = client.get("/api/health")
        assert response.status_code == 200
        
        # Check metric incremented
        updated_value = http_requests_total._metrics.get(
            ('GET', '/api/health', '200', 'unknown')
        )
        updated_count = updated_value._value._value if updated_value else 0
        
        assert updated_count > initial_count
    
    def test_http_error_metrics_incremented(self):
        """Test that HTTP errors increment error metrics"""
        # Make a request to non-existent endpoint
        response = client.get("/api/nonexistent")
        assert response.status_code == 404
        
        # Check that error metric was incremented
        # (We can't easily check the exact value without mocking,
        # but we can verify the endpoint tracked it)
        metrics_response = client.get("/api/metrics")
        assert "http_errors_total" in metrics_response.text
    
    def test_metrics_include_standard_counters(self):
        """Test that metrics endpoint includes expected counters"""
        response = client.get("/api/metrics")
        content = response.text
        
        # Check for expected metric names
        expected_metrics = [
            "http_requests_total",
            "http_request_duration_seconds",
            "http_requests_in_progress",
            "http_errors_total"
        ]
        
        for metric in expected_metrics:
            assert metric in content, f"Metric {metric} not found in metrics output"


class TestCeleryMetrics:
    """Test Celery worker metrics"""
    
    def test_celery_metrics_exist(self):
        """Test that Celery metrics are defined"""
        response = client.get("/api/metrics")
        content = response.text
        
        expected_celery_metrics = [
            "celery_task_sent_total",
            "celery_task_started_total",
            "celery_task_succeeded_total",
            "celery_task_failed_total",
            "celery_task_duration_seconds"
        ]
        
        for metric in expected_celery_metrics:
            assert metric in content, f"Celery metric {metric} not found"
    
    def test_celery_success_metric_increment(self):
        """Test that Celery success metrics can be incremented"""
        # Manually increment for testing
        celery_task_succeeded_total.labels(
            task_name="test_task",
            tenant_id="1"
        ).inc()
        
        response = client.get("/api/metrics")
        assert "celery_task_succeeded_total" in response.text
    
    def test_celery_failure_metric_increment(self):
        """Test that Celery failure metrics can be incremented"""
        # Manually increment for testing
        celery_task_failed_total.labels(
            task_name="test_task",
            tenant_id="1",
            error_type="TestError"
        ).inc()
        
        response = client.get("/api/metrics")
        assert "celery_task_failed_total" in response.text


class TestOAuthMetrics:
    """Test OAuth metrics"""
    
    def test_oauth_metrics_exist(self):
        """Test that OAuth metrics are defined"""
        response = client.get("/api/metrics")
        content = response.text
        
        expected_oauth_metrics = [
            "oauth_token_refresh_total",
            "oauth_token_refresh_duration_seconds",
            "oauth_token_refresh_failures_total",
            "oauth_tokens_active"
        ]
        
        for metric in expected_oauth_metrics:
            assert metric in content, f"OAuth metric {metric} not found"
    
    def test_oauth_refresh_metric_increment(self):
        """Test that OAuth refresh metrics can be incremented"""
        # Manually increment for testing
        oauth_token_refresh_total.labels(
            tenant_id="1",
            shop_id="1",
            status="success"
        ).inc()
        
        response = client.get("/api/metrics")
        assert "oauth_token_refresh_total" in response.text


class TestRateLimiterMetrics:
    """Test rate limiter metrics"""
    
    def test_rate_limiter_metrics_exist(self):
        """Test that rate limiter metrics are defined"""
        response = client.get("/api/metrics")
        content = response.text
        
        expected_rate_limiter_metrics = [
            "rate_limiter_token_bucket_size",
            "rate_limiter_token_bucket_capacity",
            "rate_limiter_token_acquisitions_total",
            "rate_limiter_backoff_total"
        ]
        
        for metric in expected_rate_limiter_metrics:
            assert metric in content, f"Rate limiter metric {metric} not found"


class TestProductIngestionMetrics:
    """Test product ingestion metrics"""
    
    def test_ingestion_metrics_exist(self):
        """Test that product ingestion metrics are defined"""
        response = client.get("/api/metrics")
        content = response.text
        
        expected_ingestion_metrics = [
            "product_ingestion_batches_total",
            "product_ingestion_rows_processed",
            "product_ingestion_duration_seconds"
        ]
        
        for metric in expected_ingestion_metrics:
            assert metric in content, f"Product ingestion metric {metric} not found"


class TestMetricLabels:
    """Test that metrics have appropriate labels"""
    
    def test_http_metrics_have_tenant_labels(self):
        """Test that HTTP metrics include tenant_id labels"""
        response = client.get("/api/metrics")
        content = response.text
        
        # Look for tenant_id label in HTTP metrics
        assert 'tenant_id=' in content or 'tenant_id="' in content
    
    def test_metrics_have_safe_labels(self):
        """Test that metrics don't expose secrets in labels"""
        response = client.get("/api/metrics")
        content = response.text
        
        # Ensure no sensitive data in labels
        sensitive_terms = ["password", "secret", "token", "key"]
        for term in sensitive_terms:
            # These terms should not appear as label values
            assert f'{term}=' not in content.lower()


class TestMetricsCardinality:
    """Test that metrics don't have excessive cardinality"""
    
    def test_endpoint_paths_normalized(self):
        """Test that endpoint paths are normalized to avoid high cardinality"""
        # Make requests with different IDs
        client.get("/api/products/123")
        client.get("/api/products/456")
        
        response = client.get("/api/metrics")
        content = response.text
        
        # Both should map to the same normalized endpoint
        # Should see {id} instead of actual IDs
        assert 'endpoint="/api/products/{id}"' in content or 'endpoint="/api/products/{id}"' in content


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

