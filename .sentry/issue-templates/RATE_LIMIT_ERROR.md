# Rate Limit Error (429)

## 📋 Issue Type
**Category**: Rate Limiting / API  
**Severity**: Critical / Warning  
**Component**: `rate_limiter`

## 🔗 Runbook
**[Rate Limit 429 Storm Runbook](../../runbooks/RATE_LIMIT_429_STORM.md)**

## 🚨 Quick Actions

### 1. Check Scope of Impact
```bash
# Check 429 rate
curl "http://localhost:9090/api/v1/query?query=rate(etsy_api_rate_limits_total[5m])"

# Check affected shops
curl "http://localhost:9090/api/v1/query?query=etsy_api_rate_limits_total"
```

### 2. Identify Pattern
- **Single Shop**: One shop overwhelming API → Throttle that shop
- **Platform-Wide**: All shops hitting limits → Global throttling needed
- **Time-Based**: Spike at specific times → Schedule spreading needed
- **Thundering Herd**: Queue drain causing burst → Pace task execution

### 3. Immediate Mitigation

#### If Single Shop:
```sql
-- Pause shop temporarily
UPDATE shops SET rate_limit_paused=true, rate_limit_pause_until=NOW() + INTERVAL '30 minutes'
WHERE id=<SHOP_ID>;
```

#### If Platform-Wide:
```bash
# Reduce global rate limit
docker exec etsy-redis redis-cli SET rate_limit:global:max_requests 50

# Pause non-critical workers
docker-compose stop worker
docker-compose up -d worker --scale worker=1
```

#### If Queue Saturation:
```bash
# Stop task consumption
docker-compose stop worker

# Restart with rate limiting
docker-compose up -d worker
docker exec etsy-worker celery -A app.worker.celery_app control rate_limit listing.publish 10/s
```

## 📊 Relevant Dashboards
- [Grafana Rate Limiter Dashboard](http://localhost:3001/d/rate-limiter-dashboard)
- [Grafana Worker Dashboard](http://localhost:3001/d/worker-dashboard)

## 🔍 Investigation Checklist
- [ ] Check Etsy API status (https://status.etsy.com)
- [ ] Review token bucket utilization
- [ ] Check queue depth for saturation
- [ ] Identify which endpoint is rate limited
- [ ] Check for scheduled task avalanche
- [ ] Review recent deployment changes

## 📞 Escalation
- **L1 (0-15min)**: Apply rate limit adjustments
- **L2 (15-30min)**: Backend team if requires code changes
- **L3 (30min+)**: Architecture team if algorithm redesign needed

## 📝 Recovery Verification
```bash
# Check 429 rate dropped
curl "http://localhost:9090/api/v1/query?query=rate(etsy_api_rate_limits_total[5m])"

# Verify token bucket recovered
curl "http://localhost:9090/api/v1/query?query=rate_limiter_token_bucket_size"

# Check success rate
curl "http://localhost:9090/api/v1/query?query=rate(celery_task_succeeded_total[5m])"
```

## 📝 Post-Resolution
- [ ] Review rate limit configuration
- [ ] Update shop-specific limits if needed
- [ ] Adjust scheduled task timing
- [ ] Document in incident log
- [ ] Update rate limiter if new pattern

---
**Auto-generated from Sentry Issue Template**

