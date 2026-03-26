"""
Prometheus Metrics for Etsy Automation Platform
Exposes metrics for API, OAuth, Rate Limiting, and Worker performance
"""
from prometheus_client import Counter, Histogram, Gauge, Info
from typing import Optional

# ==================== API Metrics ====================

# HTTP Request metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status_code', 'tenant_id']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint', 'tenant_id'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

http_requests_in_progress = Gauge(
    'http_requests_in_progress',
    'HTTP requests currently being processed',
    ['method', 'endpoint']
)

# Error metrics
http_errors_total = Counter(
    'http_errors_total',
    'Total HTTP errors',
    ['method', 'endpoint', 'error_type', 'tenant_id']
)

# Rate limit metrics (429 responses)
http_rate_limit_hits_total = Counter(
    'http_rate_limit_hits_total',
    'Total HTTP 429 rate limit responses',
    ['endpoint', 'tenant_id', 'shop_id']
)

# ==================== OAuth Metrics ====================

oauth_token_refresh_total = Counter(
    'oauth_token_refresh_total',
    'Total OAuth token refresh attempts',
    ['tenant_id', 'shop_id', 'status']  # status: success, failure
)

oauth_token_refresh_duration_seconds = Histogram(
    'oauth_token_refresh_duration_seconds',
    'OAuth token refresh latency',
    ['tenant_id', 'shop_id'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

oauth_token_refresh_failures_total = Counter(
    'oauth_token_refresh_failures_total',
    'Total OAuth token refresh failures',
    ['tenant_id', 'shop_id', 'error_type']
)

oauth_tokens_active = Gauge(
    'oauth_tokens_active',
    'Number of active OAuth tokens',
    ['tenant_id']
)

oauth_tokens_expiring_soon = Gauge(
    'oauth_tokens_expiring_soon',
    'Number of tokens expiring within 24 hours',
    ['tenant_id']
)

# ==================== Rate Limiter Metrics ====================

rate_limiter_token_bucket_size = Gauge(
    'rate_limiter_token_bucket_size',
    'Current token bucket size',
    ['shop_id', 'bucket_type']  # bucket_type: api_calls, listings
)

rate_limiter_token_bucket_capacity = Gauge(
    'rate_limiter_token_bucket_capacity',
    'Token bucket capacity',
    ['shop_id', 'bucket_type']
)

rate_limiter_token_acquisitions_total = Counter(
    'rate_limiter_token_acquisitions_total',
    'Total token acquisitions from rate limiter',
    ['shop_id', 'status']  # status: success, rejected
)

rate_limiter_backoff_total = Counter(
    'rate_limiter_backoff_total',
    'Total rate limiter backoffs',
    ['shop_id', 'reason']
)

# ==================== Celery Worker Metrics ====================

celery_task_sent_total = Counter(
    'celery_task_sent_total',
    'Total Celery tasks sent',
    ['task_name', 'tenant_id']
)

celery_task_started_total = Counter(
    'celery_task_started_total',
    'Total Celery tasks started',
    ['task_name', 'tenant_id']
)

celery_task_succeeded_total = Counter(
    'celery_task_succeeded_total',
    'Total Celery tasks succeeded',
    ['task_name', 'tenant_id']
)

celery_task_failed_total = Counter(
    'celery_task_failed_total',
    'Total Celery tasks failed',
    ['task_name', 'tenant_id', 'error_type']
)

celery_task_retried_total = Counter(
    'celery_task_retried_total',
    'Total Celery task retries',
    ['task_name', 'tenant_id', 'retry_count']
)

celery_task_duration_seconds = Histogram(
    'celery_task_duration_seconds',
    'Celery task execution duration',
    ['task_name', 'tenant_id'],
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0]
)

celery_queue_depth = Gauge(
    'celery_queue_depth',
    'Number of tasks in Celery queue',
    ['queue_name']
)

celery_active_workers = Gauge(
    'celery_active_workers',
    'Number of active Celery workers'
)

celery_active_tasks = Gauge(
    'celery_active_tasks',
    'Number of currently executing tasks'
)

celery_dead_letter_queue_depth = Gauge(
    'celery_dead_letter_queue_depth',
    'Number of tasks in dead letter queue'
)

# ==================== Etsy API Metrics ====================

etsy_api_calls_total = Counter(
    'etsy_api_calls_total',
    'Total Etsy API calls',
    ['shop_id', 'endpoint', 'status_code']
)

etsy_api_duration_seconds = Histogram(
    'etsy_api_duration_seconds',
    'Etsy API call latency',
    ['shop_id', 'endpoint'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

etsy_api_rate_limits_total = Counter(
    'etsy_api_rate_limits_total',
    'Total Etsy API 429 rate limits hit',
    ['shop_id', 'endpoint']
)

etsy_api_errors_total = Counter(
    'etsy_api_errors_total',
    'Total Etsy API errors',
    ['shop_id', 'endpoint', 'error_type']
)

# ==================== Listing Job Metrics ====================

listing_jobs_created_total = Counter(
    'listing_jobs_created_total',
    'Total listing jobs created',
    ['tenant_id', 'shop_id']
)

listing_jobs_completed_total = Counter(
    'listing_jobs_completed_total',
    'Total listing jobs completed',
    ['tenant_id', 'shop_id', 'status']  # status: completed, failed, policy_blocked
)

listing_jobs_duration_seconds = Histogram(
    'listing_jobs_duration_seconds',
    'Listing job execution duration',
    ['tenant_id', 'shop_id'],
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 300.0]
)

listing_jobs_policy_blocked_total = Counter(
    'listing_jobs_policy_blocked_total',
    'Total listing jobs blocked by policy',
    ['tenant_id', 'shop_id', 'policy_flag']
)

# ==================== Product Ingestion Metrics ====================

product_ingestion_batches_total = Counter(
    'product_ingestion_batches_total',
    'Total product ingestion batches',
    ['tenant_id', 'shop_id', 'status']
)

product_ingestion_rows_processed = Counter(
    'product_ingestion_rows_processed',
    'Total rows processed in product ingestion',
    ['tenant_id', 'shop_id', 'status']  # status: success, error
)

product_ingestion_duration_seconds = Histogram(
    'product_ingestion_duration_seconds',
    'Product ingestion batch duration',
    ['tenant_id', 'shop_id'],
    buckets=[1.0, 10.0, 30.0, 60.0, 300.0, 600.0]
)

# ==================== Database Metrics ====================

database_connections_active = Gauge(
    'database_connections_active',
    'Number of active database connections'
)

database_query_duration_seconds = Histogram(
    'database_query_duration_seconds',
    'Database query execution time',
    ['query_type'],
    buckets=[0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
)

# ==================== Cache Metrics (Redis) ====================

redis_operations_total = Counter(
    'redis_operations_total',
    'Total Redis operations',
    ['operation', 'status']  # operation: get, set, del, etc.
)

redis_cache_hits_total = Counter(
    'redis_cache_hits_total',
    'Total Redis cache hits',
    ['cache_type']
)

redis_cache_misses_total = Counter(
    'redis_cache_misses_total',
    'Total Redis cache misses',
    ['cache_type']
)

# ==================== Application Info ====================

app_info = Info('app', 'Application information')
app_info.info({
    'version': '1.0.0',
    'service': 'etsy-automation-api',
    'environment': 'production'
})


# ==================== Helper Functions ====================

def sanitize_tenant_id(tenant_id: Optional[int]) -> str:
    """Sanitize tenant ID for metrics (prevent cardinality explosion)"""
    if tenant_id is None:
        return "unknown"
    return str(tenant_id)


def sanitize_shop_id(shop_id: Optional[int]) -> str:
    """Sanitize shop ID for metrics"""
    if shop_id is None:
        return "unknown"
    return str(shop_id)


def get_status_category(status_code: int) -> str:
    """Convert HTTP status code to category (2xx, 4xx, 5xx)"""
    if 200 <= status_code < 300:
        return "2xx"
    elif 400 <= status_code < 500:
        return "4xx"
    elif 500 <= status_code < 600:
        return "5xx"
    else:
        return "other"

