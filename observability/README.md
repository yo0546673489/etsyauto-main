# Observability Stack for Etsy Automation Platform

## Overview

Complete observability solution with **Prometheus** for metrics collection, **Grafana** for visualization, and **Alertmanager** for alerting.

## Architecture

```
┌─────────────────┐
│   Etsy API      │──► Exposes /api/metrics
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  Prometheus     │──► Scrapes metrics every 15s
│  :9090          │──► Evaluates alert rules
└─────────────────┘
        │
        ├──► ┌─────────────────┐
        │    │  Grafana        │──► Visualizes metrics
        │    │  :3001          │──► Dashboards
        │    └─────────────────┘
        │
        └──► ┌─────────────────┐
             │  Alertmanager   │──► Routes alerts
             │  :9093          │──► Sends notifications
             └─────────────────┘
```

## Quick Start

### 1. Start Observability Stack

```bash
# Start all observability services
cd observability
docker-compose -f docker-compose.observability.yml up -d
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### 3. Configure Alerting

Edit `alertmanager/alertmanager.yml` to configure:
- Email notifications (SMTP)
- Slack webhooks
- Custom webhooks

## Metrics Exposed

### API Metrics (`http://localhost:8080/api/metrics`)

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method, endpoint, status |
| `http_request_duration_seconds` | Histogram | Request latency |
| `http_requests_in_progress` | Gauge | Active requests |
| `http_errors_total` | Counter | HTTP errors by type |
| `http_rate_limit_hits_total` | Counter | 429 rate limit responses |

### OAuth Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `oauth_token_refresh_total` | Counter | Token refresh attempts by status |
| `oauth_token_refresh_duration_seconds` | Histogram | Token refresh latency |
| `oauth_token_refresh_failures_total` | Counter | Token refresh failures |
| `oauth_tokens_active` | Gauge | Active OAuth tokens |
| `oauth_tokens_expiring_soon` | Gauge | Tokens expiring < 24h |

### Celery Worker Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `celery_task_sent_total` | Counter | Tasks sent to queue |
| `celery_task_started_total` | Counter | Tasks started |
| `celery_task_succeeded_total` | Counter | Tasks completed successfully |
| `celery_task_failed_total` | Counter | Tasks failed |
| `celery_task_retried_total` | Counter | Task retries |
| `celery_task_duration_seconds` | Histogram | Task execution time |
| `celery_queue_depth` | Gauge | Tasks pending in queue |
| `celery_active_workers` | Gauge | Active worker count |
| `celery_dead_letter_queue_depth` | Gauge | Failed tasks in DLQ |

### Rate Limiter Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rate_limiter_token_bucket_size` | Gauge | Current token bucket size |
| `rate_limiter_token_bucket_capacity` | Gauge | Token bucket capacity |
| `rate_limiter_token_acquisitions_total` | Counter | Token acquisitions |
| `rate_limiter_backoff_total` | Counter | Rate limiter backoffs |
| `etsy_api_rate_limits_total` | Counter | Etsy API 429 responses |

### Listing Job Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `listing_jobs_created_total` | Counter | Listing jobs created |
| `listing_jobs_completed_total` | Counter | Jobs completed by status |
| `listing_jobs_duration_seconds` | Histogram | Job execution time |
| `listing_jobs_policy_blocked_total` | Counter | Jobs blocked by policy |

### AI Generation Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `ai_generation_requests_total` | Counter | AI generation requests |
| `ai_generation_duration_seconds` | Histogram | Generation latency |
| `ai_generation_tokens_used` | Counter | AI tokens consumed |
| `ai_generation_failures_total` | Counter | Generation failures |
| `ai_generation_policy_violations_total` | Counter | Policy violations |

## Dashboards

### 1. API Dashboard
**File**: `grafana/dashboards/api-dashboard.json`

Panels:
- Request rate (req/s)
- Request latency (p95)
- Error rate by status code
- Rate limit hits (429s)
- Requests in progress
- Error distribution

### 2. OAuth Dashboard
**File**: `grafana/dashboards/oauth-dashboard.json`

Panels:
- Token refresh rate
- Token refresh failures
- Refresh latency (p95)
- Active OAuth tokens
- Tokens expiring soon
- Refresh success rate

### 3. Worker Dashboard
**File**: `grafana/dashboards/worker-dashboard.json`

Panels:
- Task execution rate
- Task duration (p95)
- Queue depth
- Task retry rate
- Active workers/tasks
- Dead letter queue
- Failure rate
- Policy blocks

### 4. Rate Limiter Dashboard
**File**: `grafana/dashboards/rate-limiter-dashboard.json`

Panels:
- Token bucket utilization
- Token acquisitions
- Rate limiter backoffs
- Etsy API rate limits
- API call duration
- API errors

## Alert Rules

### Critical Alerts

| Alert | Threshold | Description |
|-------|-----------|-------------|
| **HighErrorRate** | >5% | API error rate too high |
| **OAuthTokenRefreshFailures** | >5/s | Token refresh failures |
| **CriticalQueueDepth** | >500 | Queue critically backed up |
| **NoActiveWorkers** | =0 | All workers down |
| **DeadLetterQueueGrowth** | >0 | Tasks accumulating in DLQ |
| **EtsyAPIRateLimitSpike** | >10/s | Hitting Etsy rate limits |

### Warning Alerts

| Alert | Threshold | Description |
|-------|-----------|-------------|
| **HighRateLimitHits** | >10/s | High 429 responses |
| **SlowAPIResponse** | p95>5s | Slow API responses |
| **HighQueueDepth** | >100 | Queue building up |
| **HighTaskFailureRate** | >10% | Too many task failures |
| **ExcessiveTaskRetries** | >10/s | High retry rate |
| **TokensExpiringSoon** | >5 | Multiple tokens expiring |
| **HighPolicyBlockRate** | >5/s | High policy block rate |
| **AIGenerationFailures** | >2/s | AI generation failures |

## Alert Routing

Configured in `alertmanager/alertmanager.yml`:

```yaml
routes:
  - match:
      severity: critical
    receiver: 'critical-alerts'
    repeat_interval: 3h
  
  - match:
      severity: warning
    receiver: 'warning-alerts'
    repeat_interval: 12h
```

## Notification Channels

### 1. Email (SMTP)

Configure in `alertmanager/alertmanager.yml`:

```yaml
email_configs:
  - to: 'alerts@example.com'
    from: 'prometheus@etsy-automation.com'
    smarthost: 'smtp.gmail.com:587'
    auth_username: 'your-email@gmail.com'
    auth_password: 'your-app-password'
```

### 2. Slack

Uncomment and configure in `alertmanager/alertmanager.yml`:

```yaml
slack_configs:
  - api_url: 'YOUR_SLACK_WEBHOOK_URL'
    channel: '#alerts-critical'
    title: '🚨 Critical Alert: {{ .GroupLabels.alertname }}'
```

### 3. Custom Webhook

```yaml
webhook_configs:
  - url: 'http://etsy-api:8080/api/alerts/webhook'
    send_resolved: true
```

## Testing

### 1. Run Metrics Tests

```bash
cd apps/api
pytest tests/test_metrics.py -v
```

### 2. Simulate Alert

```bash
# Trigger a test alert
curl -X POST http://localhost:9093/api/v1/alerts -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "critical"
  },
  "annotations": {
    "summary": "Test alert"
  }
}]'
```

### 3. Query Metrics

```bash
# Check if metrics endpoint is working
curl http://localhost:8080/api/metrics

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'
```

## Production Configuration

### 1. Secure Grafana

Update `docker-compose.observability.yml`:

```yaml
environment:
  - GF_SECURITY_ADMIN_PASSWORD=<strong-password>
  - GF_USERS_ALLOW_SIGN_UP=false
  - GF_AUTH_ANONYMOUS_ENABLED=false
```

### 2. Persistent Storage

Volumes are automatically created:
- `prometheus-data`: Prometheus TSDB
- `grafana-data`: Grafana dashboards/config
- `alertmanager-data`: Alertmanager state

### 3. Resource Limits

Add to docker-compose:

```yaml
services:
  prometheus:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### 4. Retention Policy

Configure in `prometheus/prometheus.yml`:

```yaml
global:
  storage:
    tsdb:
      retention.time: 30d  # Keep metrics for 30 days
      retention.size: 10GB  # Or until 10GB
```

## Monitoring Best Practices

### 1. Label Cardinality
- ✅ Use tenant_id, shop_id (controlled)
- ❌ Avoid user IDs, request IDs (unbounded)
- ✅ Normalize paths (`/products/{id}`)

### 2. Metric Types
- **Counter**: Monotonically increasing (requests, errors)
- **Gauge**: Can go up/down (queue depth, active workers)
- **Histogram**: Distribution (latency, duration)

### 3. Alert Tuning
- Start with high thresholds
- Adjust based on baseline
- Use `for: 5m` to avoid flapping
- Set appropriate `repeat_interval`

## Troubleshooting

### Metrics Not Appearing

1. Check API is exposing metrics:
   ```bash
   curl http://localhost:8080/api/metrics
   ```

2. Check Prometheus is scraping:
   ```bash
   # View targets
   open http://localhost:9090/targets
   ```

3. Check Prometheus logs:
   ```bash
   docker logs etsy-prometheus
   ```

### Alerts Not Firing

1. Check alert rules:
   ```bash
   open http://localhost:9090/alerts
   ```

2. Check Alertmanager:
   ```bash
   open http://localhost:9093
   ```

3. Verify alert routing:
   ```bash
   docker logs etsy-alertmanager
   ```

### Grafana Dashboard Not Loading

1. Check datasource connection:
   - Grafana → Configuration → Data Sources
   - Test Prometheus connection

2. Re-import dashboard:
   - Upload JSON from `grafana/dashboards/`

## Maintenance

### Backup Dashboards

```bash
# Export Grafana dashboards
docker exec etsy-grafana grafana-cli admin export
```

### Clean Up Old Metrics

```bash
# Prometheus automatically handles retention
# To manually compact:
docker exec etsy-prometheus promtool tsdb compact /prometheus
```

### Update Alert Rules

1. Edit `prometheus/alerts.yml`
2. Reload Prometheus:
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Alertmanager Configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- [PromQL Queries](https://prometheus.io/docs/prometheus/latest/querying/basics/)

---

**Created**: December 2025  
**Status**: ✅ Production Ready  
**Maintainer**: DevOps Team

