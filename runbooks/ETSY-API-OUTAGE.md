# 🚨 Runbook: Etsy API Outage

## **Incident Type**
**Severity:** Critical  
**Impact:** Etsy Open API unavailable, blocking all listing operations and order sync

---

## **Symptoms**
- Persistent 502/503/504 errors from `openapi.etsy.com`
- Listing publish jobs failing with "Connection timeout"
- Order sync failing
- Alert: "Etsy API health check failing"
- Etsy Status Page showing incidents: https://status.etsy.com

---

## **Immediate Actions (< 3 minutes)**

### 1. **Verify Outage**
```bash
# Test Etsy API directly
curl -I https://openapi.etsy.com/v3/application/shops/12345 \
  -H "x-api-key: $ETSY_CLIENT_ID"

# Expected during outage: 502, 503, 504, or connection timeout

# Check Etsy Status Page
curl -s https://status.etsy.com/api/v2/status.json | jq .
```

### 2. **Determine Scope**
```bash
# Check if all endpoints are affected
curl -I https://openapi.etsy.com/v3/public/ping

# Check specific endpoints
curl -I https://openapi.etsy.com/v3/application/listings/123456789
curl -I https://openapi.etsy.com/v3/application/shops/12345/receipts
```

### 3. **Activate Outage Mode**
```bash
# Pause all automated publishing
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE schedules
SET status = 'paused'
WHERE status = 'active' AND type IN ('publish', 'sync');
"

# Set maintenance flag (prevents new jobs)
docker compose exec redis redis-cli SET "etsy:maintenance" "true" EX 3600
```

---

## **Outage Classification**

### **Type A: Full Outage**
All Etsy API endpoints down → **Go to Full Outage Response**

### **Type B: Partial Outage**
Specific endpoints down (e.g., listings but not receipts) → **Go to Partial Outage Response**

### **Type C: Degraded Performance**
API responding but very slow (> 10s latency) → **Go to Degraded Performance Response**

---

## **Full Outage Response**

### **Step 1: Notify Users**
```bash
# Create system-wide notification
curl -X POST http://localhost:8080/api/admin/system-notification \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "warning",
    "title": "Etsy API Outage",
    "message": "We are experiencing issues with Etsy'\''s API. Listing publishing and order sync are temporarily unavailable. We'\''re monitoring the situation.",
    "dismissible": false
  }'
```

### **Step 2: Stop Workers (Prevent Job Buildup)**
```bash
# Stop Celery workers
docker compose stop worker beat

# Workers will automatically resume when started later
```

### **Step 3: Monitor Etsy Status**
```bash
# Set up monitoring loop
while true; do
  echo "$(date): Checking Etsy API..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://openapi.etsy.com/v3/public/ping)
  if [ "$STATUS" == "200" ]; then
    echo "✅ Etsy API is back online!"
    break
  else
    echo "❌ Etsy API still down (status: $STATUS)"
  fi
  sleep 60  # Check every minute
done
```

### **Step 4: Recovery (When API Returns)**
```bash
# Clear maintenance flag
docker compose exec redis redis-cli DEL "etsy:maintenance"

# Start workers
docker compose up -d worker beat

# Re-enable schedules (gradually)
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE schedules
SET status = 'active'
WHERE type IN ('publish', 'sync')
  AND status = 'paused';
"

# Trigger order sync manually for all shops
curl -X POST http://localhost:8080/api/orders/sync \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## **Partial Outage Response**

### **Identify Affected Endpoints**
```bash
# Test each endpoint category
ENDPOINTS=(
  "/application/listings"
  "/application/shops"
  "/application/receipts"
  "/application/users"
)

for EP in "${ENDPOINTS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://openapi.etsy.com/v3$EP/test" \
    -H "x-api-key: $ETSY_CLIENT_ID")
  echo "$EP: $STATUS"
done
```

### **Selective Pause**
```bash
# If listings endpoint down, pause only publish schedules
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE schedules
SET status = 'paused'
WHERE type = 'publish' AND status = 'active';
"

# If receipts endpoint down, pause only order sync
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE schedules
SET status = 'paused'
WHERE type = 'sync' AND status = 'active';
"
```

---

## **Degraded Performance Response**

### **Adjust Timeouts**
```python
# Edit: apps/api/app/services/etsy_client.py
# Increase timeout for API calls

async with httpx.AsyncClient(timeout=60.0) as client:  # Was: 30.0
    response = await client.request(...)
```

### **Reduce Concurrency**
```python
# Edit: apps/api/app/worker/tasks/listing_tasks.py
# Reduce max concurrent jobs per shop

acquired_slot = _acquire_shop_concurrency_slot(redis_client, shop_id, max_concurrent=1)  # Was: 3
```

### **Increase Retry Delays**
```python
# Edit: apps/api/app/worker/tasks/listing_tasks.py
# Increase backoff for server errors

countdown = min(600, 300 * (2 ** job.retry_count))  # Was: 180 * ...
```

---

## **Recovery Procedures**

### **Step 1: Validate API Health**
```bash
# Check Etsy Status Page
curl https://status.etsy.com/api/v2/status.json | jq '.status.description'
# Expected: "All Systems Operational"

# Test API with real token
curl https://openapi.etsy.com/v3/application/shops/<SHOP_ID> \
  -H "x-api-key: $ETSY_CLIENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# Expected: 200 OK
```

### **Step 2: Resume Operations**
```bash
# Clear maintenance mode
docker compose exec redis redis-cli DEL "etsy:maintenance"

# Restart workers
docker compose up -d worker beat

# Re-enable schedules gradually (one at a time)
SCHEDULE_IDS=$(docker compose exec db psql -U postgres etsy_automation -t -c "
SELECT id FROM schedules WHERE status = 'paused' LIMIT 5;
")

for SCHED_ID in $SCHEDULE_IDS; do
  docker compose exec db psql -U postgres etsy_automation -c "
  UPDATE schedules SET status = 'active' WHERE id = $SCHED_ID;
  "
  sleep 60  # Wait 1 minute between re-enablements
done
```

### **Step 3: Process Backlog**
```bash
# Check queue depth
docker compose exec worker celery -A app.worker.celery_app inspect active | grep -c "task"

# Retry failed jobs from outage period
docker compose exec db psql -U postgres etsy_automation -c "
SELECT id, shop_id, error_message
FROM listing_jobs
WHERE status = 'failed'
  AND error_code IN ('CONNECTION_TIMEOUT', 'SERVICE_UNAVAILABLE')
  AND created_at > NOW() - INTERVAL '4 hours'
ORDER BY created_at;
"

# Retry jobs via API (batch script)
```

---

## **User Communication**

### **During Outage**
```
Subject: Etsy API Service Disruption

We're experiencing an outage with Etsy's API service. This affects:
- Listing publishing
- Order synchronization
- Product syncing

We're monitoring the situation and operations will automatically resume once Etsy resolves the issue.

Current Status: [Etsy Status Page Link]
```

### **After Recovery**
```
Subject: Etsy API Services Restored

Etsy's API is back online. All automated operations have resumed:
✅ Listing publishing active
✅ Order sync active
✅ Scheduled tasks running

Any failed jobs during the outage will be automatically retried.
```

---

## **Post-Incident Analysis**

### **Data Collection**
```bash
# Export failed jobs during outage
docker compose exec db psql -U postgres etsy_automation -c "
COPY (
  SELECT id, shop_id, status, error_code, error_message, created_at
  FROM listing_jobs
  WHERE error_code IN ('CONNECTION_TIMEOUT', 'SERVICE_UNAVAILABLE')
    AND created_at BETWEEN '<OUTAGE_START>' AND '<OUTAGE_END>'
) TO '/tmp/outage_jobs.csv' WITH CSV HEADER;
"

# Export audit logs
docker compose exec db psql -U postgres etsy_automation -c "
COPY (
  SELECT created_at, action, status_code, latency_ms, shop_id
  FROM audit_logs
  WHERE action LIKE 'etsy%'
    AND created_at BETWEEN '<OUTAGE_START>' AND '<OUTAGE_END>'
) TO '/tmp/outage_audit.csv' WITH CSV HEADER;
"
```

### **Metrics to Review**
1. **Duration**: Total outage time
2. **Impact**: Number of failed jobs, affected shops
3. **Recovery Time**: Time to clear backlog
4. **Detection Time**: Alert to response time

---

## **Preventive Measures**

### **Implement Circuit Breaker**
```python
# Add to etsy_client.py
class EtsyCircuitBreaker:
    def __init__(self, failure_threshold=10, timeout=300):
        self.failure_count = 0
        self.threshold = failure_threshold
        self.timeout = timeout
        self.open_until = None
    
    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.threshold:
            self.open_until = time.time() + self.timeout
    
    def is_open(self):
        if self.open_until and time.time() < self.open_until:
            return True
        if self.open_until and time.time() >= self.open_until:
            self.failure_count = 0  # Reset
            self.open_until = None
        return False
```

### **Add Health Check**
```python
# Add scheduled task (every 2 minutes)
@celery_app.task
def check_etsy_api_health():
    try:
        response = httpx.get("https://openapi.etsy.com/v3/public/ping", timeout=10)
        if response.status_code != 200:
            trigger_alert("etsy_api_down")
    except Exception:
        trigger_alert("etsy_api_unreachable")
```

### **Monitoring**
- [ ] Alert: Etsy API error rate > 50%
- [ ] Alert: Etsy API latency p99 > 30s
- [ ] Dashboard: "Etsy API Health" with uptime graph
- [ ] Metric: Track `etsy_api_availability` (1 = up, 0 = down)

---

## **Escalation**

If outage > 2 hours:
1. **Check Etsy Developer Forums**: https://community.etsy.com/t5/Developer-APIs/bd-p/developers
2. **Tweet @EtsyDev**: Public status inquiry
3. **Contact Etsy Support**: support@etsy.com (mention Developer API)

---

## **Useful Links**
- Etsy Status Page: https://status.etsy.com
- Etsy API Docs: https://developers.etsy.com
- Etsy Developer Community: https://community.etsy.com/t5/Developer-APIs/bd-p/developers

---

**Last Updated:** 2026-02-09  
**Owner:** Platform Team  
**Version:** 1.0
