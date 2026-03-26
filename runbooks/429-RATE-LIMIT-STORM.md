# 🚨 Runbook: 429 Rate Limit Storm

## **Incident Type**
**Severity:** High  
**Impact:** Etsy API calls failing due to rate limit exceeded

---

## **Symptoms**
- Multiple 429 errors in logs from Etsy API
- Listing publish jobs stuck in `pending` or `processing`
- Alert: "Etsy 429 streak >= 10"
- Users reporting "Rate limit exceeded" errors

---

## **Immediate Actions (< 5 minutes)**

### 1. **Verify the Incident**
```bash
# Check recent Etsy API errors in logs
docker compose logs api | grep "429"

# Check rate limit metrics
curl http://localhost:9090/api/v1/query?query=rate_limit_rejections_total
```

### 2. **Identify Affected Shops**
```bash
# Query audit logs for affected shops
docker compose exec db psql -U postgres etsy_automation -c "
SELECT shop_id, COUNT(*) as error_count
FROM audit_logs
WHERE action LIKE 'etsy%'
  AND status_code = 429
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY shop_id
ORDER BY error_count DESC
LIMIT 10;
"
```

### 3. **Emergency Brake - Pause Publishing**
```bash
# Pause all active schedules to stop new jobs
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE schedules
SET status = 'paused'
WHERE status = 'active';
"
```

---

## **Root Cause Analysis (5-15 minutes)**

### **Check Rate Limiter State**
```bash
# Check Redis token bucket state for affected shops
docker compose exec redis redis-cli

# In Redis CLI:
KEYS rate_limit:shop:*
GET rate_limit:shop:<SHOP_ID>:tokens
TTL rate_limit:shop:<SHOP_ID>:tokens
```

### **Common Causes**

| Cause | Check | Solution |
|-------|-------|----------|
| **Concurrent job spike** | Check active Celery workers | Reduce `max_concurrent` in `listing_tasks.py` |
| **Token bucket misconfigured** | Verify `app/services/rate_limiter.py` settings | Adjust rate: 10 req/s → 5 req/s |
| **Retry storm** | Check retry_count in `listing_jobs` table | Increase backoff delay |
| **External tool hammering API** | Check audit logs for non-worker actors | Identify and block rogue client |

---

## **Mitigation Steps (15-30 minutes)**

### **Option A: Reduce Concurrency (Quick Fix)**
```python
# Edit: apps/api/app/worker/tasks/listing_tasks.py
# Line ~120: Reduce max_concurrent per shop

acquired_slot = _acquire_shop_concurrency_slot(redis_client, shop_id, max_concurrent=1)  # Was: 3
```

### **Option B: Adjust Rate Limiter**
```python
# Edit: apps/api/app/services/rate_limiter.py
# Reduce bucket capacity and refill rate

self.capacity = 20  # Was: 50
self.refill_rate = 5.0  # Was: 10.0 (tokens per second)
```

### **Option C: Increase Backoff Delay**
```python
# Edit: apps/api/app/worker/tasks/listing_tasks.py
# Line ~665: Increase 429 retry delay

countdown = min(300, 120 * (2 ** job.retry_count))  # Was: 60 * (2 ** ...)
```

---

## **Validation**

### 1. **Restart Workers**
```bash
docker compose restart worker beat
```

### 2. **Monitor for 10 Minutes**
```bash
# Watch for 429 errors (should be zero)
docker compose logs -f api | grep "429"

# Check Prometheus metrics
# Navigate to: http://localhost:9090
# Query: rate(rate_limit_rejections_total[5m])
```

### 3. **Re-enable Schedules (Gradually)**
```bash
# Re-enable one schedule at a time
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE schedules
SET status = 'active'
WHERE id = <SCHEDULE_ID>;
"
```

---

## **Recovery**

### **Retry Failed Jobs**
```bash
# Query failed jobs from the storm period
docker compose exec db psql -U postgres etsy_automation -c "
SELECT id, shop_id, error_code
FROM listing_jobs
WHERE status = 'failed'
  AND error_code = 'RATE_LIMIT'
  AND created_at > NOW() - INTERVAL '1 hour'
LIMIT 50;
"

# Retry jobs (using API endpoint)
curl -X POST http://localhost:8080/api/listing-jobs/<JOB_ID>/retry \
  -H "Authorization: Bearer <TOKEN>"
```

---

## **Post-Incident**

### **Update Monitoring**
1. **Verify Alert Thresholds**:
   - 429 streak alert threshold: 10 → 5
   - Add alert for rate limit token depletion

2. **Dashboard Review**:
   - Check Grafana "Etsy API" dashboard
   - Verify rate limit utilization chart

### **Documentation**
1. Add incident to `TROUBLESHOOTING.md`
2. Update `GAP_AND_READINESS_ANALYSIS.md` if systemic issue
3. Log RCA in team incident tracker

### **Preventive Measures**
- [ ] Implement adaptive rate limiting (scale down on 429)
- [ ] Add circuit breaker pattern
- [ ] Implement job priority queue (critical jobs first)
- [ ] Add rate limit headroom monitoring (warn at 80% capacity)

---

## **Escalation**

If issue persists after 30 minutes:
1. **Contact Etsy Support**: support@etsy.com (mention shop ID, timestamp)
2. **Notify team lead**: Incident may require API quota increase
3. **Consider**: Temporary migration to manual publishing workflow

---

## **Useful Commands**

```bash
# Check Celery queue depth
docker compose exec worker celery -A app.worker.celery_app inspect active

# Force flush Redis rate limit keys (nuclear option)
docker compose exec redis redis-cli FLUSHDB

# Check Etsy API health
curl -I https://openapi.etsy.com/v3/application/shops/12345
```

---

**Last Updated:** 2026-02-09  
**Owner:** Platform Team  
**Version:** 1.0
