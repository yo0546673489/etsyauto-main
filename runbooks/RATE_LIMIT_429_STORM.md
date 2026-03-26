# Runbook: 429 Rate Limit Storm

## 🚨 Alert

**Alert Name**: `EtsyAPIRateLimitSpike` / `HighRateLimitHits`  
**Severity**: Critical / Warning  
**Threshold**: >10 rate limit hits per second

## 📊 Symptoms

- Surge in 429 responses from Etsy API
- Listing publication failures
- Product sync delays
- Grafana showing spike in `etsy_api_rate_limits_total`
- Metrics showing `http_rate_limit_hits_total` increase
- User complaints about slow operations

## 🔍 Diagnosis

### 1. Check Sentry for 429 Errors

**Sentry Query:**
```
is:unresolved http.status_code:429 OR error.type:RateLimitError
```

**Look for:**
- Affected endpoints (e.g., `/listings`, `/products`, `/shops`)
- `shop_id` distribution (single shop vs. platform-wide)
- Time pattern (sudden spike vs. gradual increase)

### 2. Check Grafana Rate Limiter Dashboard

**URL**: `http://localhost:3001/d/rate-limiter-dashboard`

**Key Metrics:**
- Token bucket utilization % (should be <80%)
- Token acquisition rejection rate
- Etsy API 429 responses by endpoint
- Rate limiter backoff events

### 3. Check Prometheus

```bash
# Check current 429 rate
curl "http://localhost:9090/api/v1/query?query=rate(etsy_api_rate_limits_total[5m])"

# Check token bucket status
curl "http://localhost:9090/api/v1/query?query=rate_limiter_token_bucket_size"

# Check which shops are affected
curl "http://localhost:9090/api/v1/query?query=etsy_api_rate_limits_total"
```

### 4. Check Redis Token Buckets

```bash
docker exec etsy-redis redis-cli

# Check token bucket keys
KEYS rate_limit:shop:*

# Check specific shop
GET rate_limit:shop:<SHOP_ID>:tokens
TTL rate_limit:shop:<SHOP_ID>:tokens
```

### 5. Check Celery Queue Depth

```bash
# Check if queue is saturated (causing thundering herd)
curl "http://localhost:9090/api/v1/query?query=celery_queue_depth"

# Check active tasks
docker exec etsy-worker celery -A app.worker.celery_app inspect active
```

## 🛠️ Resolution

### Scenario 1: Single Shop Exceeding Limits

**Symptoms:**
- One `shop_id` dominating 429s
- Other shops unaffected

**Actions:**
1. Identify the shop:
   ```sql
   SELECT shop_id, COUNT(*) as rate_limit_count
   FROM audit_logs
   WHERE http_status = 429
   AND created_at > NOW() - INTERVAL '10 minutes'
   GROUP BY shop_id
   ORDER BY rate_limit_count DESC
   LIMIT 5;
   ```

2. Temporarily pause shop's tasks:
   ```python
   # In Django shell or API endpoint
   from app.models.tenancy import Shop
   shop = Shop.objects.get(id=<SHOP_ID>)
   shop.rate_limit_paused = True
   shop.rate_limit_pause_until = now() + timedelta(minutes=30)
   shop.save()
   ```

3. Reduce shop's rate limit quota:
   ```sql
   -- Reduce from default 10 req/s to 5 req/s
   UPDATE shops 
   SET rate_limit_per_second = 5
   WHERE id = <SHOP_ID>;
   ```

4. Check for runaway tasks:
   ```bash
   docker logs etsy-worker | grep "shop_id=<SHOP_ID>" | tail -100
   ```

5. Kill any stuck tasks:
   ```bash
   docker exec etsy-worker celery -A app.worker.celery_app control revoke <TASK_ID>
   ```

### Scenario 2: Platform-Wide Rate Limiting

**Symptoms:**
- Multiple shops hitting 429s
- Etsy API globally rate limiting

**Actions:**
1. **Immediate**: Reduce global request rate
   ```bash
   # Update rate limiter config
   docker exec etsy-redis redis-cli SET rate_limit:global:max_requests 100
   docker exec etsy-redis redis-cli SET rate_limit:global:window 60
   ```

2. **Increase backoff delays:**
   ```python
   # In apps/api/app/services/rate_limiter.py
   # Temporarily increase backoff multiplier
   BACKOFF_MULTIPLIER = 3  # Default: 2
   ```

3. **Pause non-critical operations:**
   ```bash
   # Pause scheduled sync tasks
   docker exec etsy-worker celery -A app.worker.celery_app control disable_events
   
   # Only process high-priority queues
   docker-compose scale worker=1
   ```

4. **Enable emergency throttling:**
   ```sql
   -- Activate global rate limit mode
   INSERT INTO system_config (key, value)
   VALUES ('rate_limit_emergency_mode', 'true')
   ON CONFLICT (key) DO UPDATE SET value = 'true';
   ```

5. **Spread out scheduled tasks:**
   ```sql
   -- Add jitter to scheduled tasks
   UPDATE schedules
   SET next_run_at = next_run_at + (RANDOM() * INTERVAL '10 minutes')
   WHERE type IN ('sync', 'publish');
   ```

### Scenario 3: Thundering Herd (Queue Saturation)

**Symptoms:**
- Massive queue depth (>500 tasks)
- All tasks hitting Etsy API simultaneously
- 429s correlate with queue drain events

**Actions:**
1. **Stop task consumption temporarily:**
   ```bash
   docker-compose stop worker
   ```

2. **Drain queue gradually:**
   ```bash
   # Start with 1 worker, low concurrency
   docker-compose up -d worker
   docker exec etsy-worker celery -A app.worker.celery_app control pool_shrink 1
   ```

3. **Implement task pacing:**
   ```python
   # In apps/api/app/worker/tasks/listing_tasks.py
   # Add delay between tasks
   import time
   time.sleep(0.5)  # 500ms delay
   ```

4. **Enable Celery rate limiting:**
   ```python
   # In celery_app.py
   celery_app.conf.task_default_rate_limit = '10/s'  # Max 10 tasks per second
   ```

5. **Use priority queues:**
   ```python
   # Route high-priority tasks to separate queue
   celery_app.conf.task_routes = {
       'listing.publish': {'queue': 'high_priority'},
       'product.sync': {'queue': 'low_priority'},
   }
   ```

### Scenario 4: Etsy API Degradation

**Symptoms:**
- Etsy returning 429s at normal request rates
- Etsy API status page shows issues

**Actions:**
1. **Check Etsy API status:**
   ```bash
   curl https://status.etsy.com/api/v2/status.json
   ```

2. **Enable super-conservative mode:**
   ```bash
   # Reduce all shop rate limits by 50%
   docker exec etsy-redis redis-cli KEYS "rate_limit:shop:*" | xargs -I {} docker exec etsy-redis redis-cli SET {} 5
   ```

3. **Notify users:**
   ```sql
   -- Create system-wide notification
   INSERT INTO notifications (user_id, type, title, message, created_at)
   SELECT DISTINCT user_id, 'warning', 
          'Etsy API Slowdown', 
          'We are experiencing Etsy API issues. Your tasks will resume automatically.',
          NOW()
   FROM memberships;
   ```

4. **Wait for Etsy recovery**, then gradually resume:
   ```bash
   # Slowly increase rate limits
   for i in {1..10}; do
     docker exec etsy-redis redis-cli INCRBY rate_limit:global:max_requests 10
     sleep 60
   done
   ```

## 🔄 Recovery Verification

### 1. Check Metrics Normalized

```bash
# 429 rate should be <1/s
curl "http://localhost:9090/api/v1/query?query=rate(etsy_api_rate_limits_total[5m])"

# Token bucket should be >20% full
curl "http://localhost:9090/api/v1/query?query=rate_limiter_token_bucket_size"
```

### 2. Verify Queue Draining

```bash
# Queue depth should be <100
docker exec etsy-worker celery -A app.worker.celery_app inspect stats
```

### 3. Check Success Rate

```sql
-- Success rate should be >95%
SELECT 
    COUNT(CASE WHEN status = 'success' THEN 1 END) * 100.0 / COUNT(*) as success_rate
FROM audit_logs
WHERE action LIKE 'etsy.%'
AND created_at > NOW() - INTERVAL '10 minutes';
```

## 📊 Post-Incident Analysis

### 1. Identify Root Cause

```sql
-- Check what triggered the spike
SELECT 
    action,
    COUNT(*) as count,
    MIN(created_at) as first_occurrence
FROM audit_logs
WHERE http_status = 429
AND created_at BETWEEN '<INCIDENT_START>' AND '<INCIDENT_END>'
GROUP BY action
ORDER BY count DESC;
```

### 2. Review Affected Operations

```sql
SELECT 
    tenant_id,
    shop_id,
    COUNT(*) as failed_operations
FROM audit_logs
WHERE status = 'failure'
AND error_message LIKE '%429%'
AND created_at BETWEEN '<INCIDENT_START>' AND '<INCIDENT_END>'
GROUP BY tenant_id, shop_id;
```

### 3. Update Rate Limits

Based on analysis, adjust shop-specific rate limits:
```sql
-- For high-volume shops
UPDATE shops 
SET rate_limit_per_second = <NEW_LIMIT>
WHERE id IN (<SHOP_IDS>);
```

## 📞 Escalation

### Level 1: On-Call Engineer (0-15 min)
- Follow runbook scenarios
- Apply immediate mitigations
- Monitor recovery

### Level 2: Backend Team Lead (15-30 min)
- If issue persists
- If requires code changes
- If affecting >25% of tenants

### Level 3: Architecture Team (30+ min)
- If platform-wide redesign needed
- If Etsy API changes required
- If rate limiter algorithm needs update

## 🔗 Related Links

- [Etsy API Rate Limits](https://developers.etsy.com/documentation/essentials/rate-limiting)
- [Rate Limiter Implementation](../apps/api/app/services/rate_limiter.py)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Grafana Rate Limiter Dashboard](http://localhost:3001/d/rate-limiter-dashboard)
- [Celery Monitoring](http://localhost:3001/d/worker-dashboard)

## 📝 Preventive Measures

### Already Implemented:
1. ✅ Token bucket rate limiting per shop
2. ✅ Redis-backed token storage
3. ✅ Exponential backoff on 429
4. ✅ Max concurrent jobs per shop
5. ✅ Prometheus alerting
6. ✅ Grafana dashboards

### Recommendations:
1. **Dynamic Rate Adjustment**
   - Auto-reduce limits on 429
   - Gradually increase on success

2. **Predictive Throttling**
   - Monitor token bucket depletion rate
   - Preemptively slow down before hitting limits

3. **Tenant Priority Tiers**
   - Premium tenants get higher limits
   - Free tier gets conservative limits

4. **Smart Task Scheduling**
   - Avoid scheduling all tasks at same time
   - Use cron with jitter

5. **Circuit Breaker**
   - Auto-pause shop after N consecutive 429s
   - Auto-resume after cooldown period

---

**Last Updated**: December 2025  
**Owner**: Backend Team  
**Severity**: Critical

