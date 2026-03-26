# 🔧 Runbook: Redis Restart

## **Incident Type**
**Severity:** Medium-High  
**Impact:** Redis service down, affecting caching, rate limiting, and background jobs

---

## **Symptoms**
- Workers unable to process jobs
- Rate limiter errors: "Failed to connect to Redis"
- Token cache misses (excessive Etsy API calls for tokens)
- Celery tasks not being queued
- Alert: "Redis connection pool exhausted"
- Users experiencing slow response times

---

## **Immediate Actions (< 2 minutes)**

### 1. **Verify Redis Status**
```bash
# Check if Redis container is running
docker compose ps redis

# Check Redis health
docker compose exec redis redis-cli PING
# Expected: PONG

# If container is down, check logs
docker compose logs redis --tail 50
```

### 2. **Assess Impact**
```bash
# Check which services are affected
docker compose logs api --tail 20 | grep -i redis
docker compose logs worker --tail 20 | grep -i redis

# Check Celery queue status
docker compose exec worker celery -A app.worker.celery_app inspect stats
```

---

## **Decision Tree**

### **Scenario A: Redis Container Stopped**
→ Proceed to **Quick Restart**

### **Scenario B: Redis Running but Unresponsive**
→ Proceed to **Graceful Restart**

### **Scenario C: Redis OOM (Out of Memory)**
→ Proceed to **Memory Management**

### **Scenario D: Redis Data Corruption**
→ Proceed to **Recovery from Backup**

---

## **Quick Restart (Scenario A)**

### **Step 1: Restart Redis Container**
```bash
# Restart Redis container
docker compose restart redis

# Wait for health check
docker compose ps redis
# Status should show "healthy" after ~10 seconds
```

### **Step 2: Verify Services Reconnect**
```bash
# Check API reconnection
docker compose logs api --tail 10 | grep -i redis

# Check worker reconnection
docker compose logs worker --tail 10 | grep -i redis

# Test Redis connection
docker compose exec redis redis-cli PING
```

### **Step 3: Smoke Test**
```bash
# Test rate limiter
curl -X POST http://localhost:8080/api/products \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title_raw": "Test", "description_raw": "Test"}'

# Test Celery queue
curl -X POST http://localhost:8080/api/shops/<SHOP_ID>/listings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "shop_id": 1}'
```

**If successful** → Proceed to [Validation](#validation)  
**If failed** → Proceed to **Graceful Restart**

---

## **Graceful Restart (Scenario B)**

### **Step 1: Drain Active Connections**
```bash
# Stop accepting new connections (switch to maintenance mode)
docker compose exec redis redis-cli CONFIG SET stop-writes-on-bgsave-error no

# Monitor active connections
docker compose exec redis redis-cli CLIENT LIST
```

### **Step 2: Backup Current Data (Optional)**
```bash
# Trigger a manual save
docker compose exec redis redis-cli SAVE

# Copy RDB file out of container
docker compose cp redis:/data/dump.rdb ./backups/redis-backup-$(date +%Y%m%d-%H%M%S).rdb
```

### **Step 3: Stop Services Gracefully**
```bash
# Stop workers first (prevents job loss)
docker compose stop worker beat

# Stop API (stops new requests to Redis)
docker compose stop api

# Now safe to restart Redis
docker compose restart redis
```

### **Step 4: Restart Services**
```bash
# Start Redis
docker compose up -d redis

# Wait for health check
sleep 10

# Start API
docker compose up -d api

# Start workers
docker compose up -d worker beat
```

---

## **Memory Management (Scenario C)**

### **Check Redis Memory Usage**
```bash
# Check memory stats
docker compose exec redis redis-cli INFO memory

# Key metrics to check:
# - used_memory_human
# - maxmemory
# - maxmemory_policy
```

### **Immediate Fix: Increase Memory Limit**
```yaml
# Edit: docker-compose.yml
# Under redis service, add:
redis:
  ...
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### **Cleanup Strategies**

#### **Option A: Flush Unnecessary Data**
```bash
# List key patterns and sizes
docker compose exec redis redis-cli --bigkeys

# Flush specific pattern (e.g., old rate limit keys)
docker compose exec redis redis-cli --scan --pattern "rate_limit:*" | \
  xargs docker compose exec redis redis-cli DEL

# Flush expired keys manually
docker compose exec redis redis-cli KEYS "*" | \
  xargs -I {} docker compose exec redis redis-cli TTL {} | \
  awk '$1 == -1 {print $0}'  # Find keys without expiry
```

#### **Option B: Adjust Eviction Policy**
```bash
# Set LRU eviction for all keys
docker compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Or evict only keys with TTL
docker compose exec redis redis-cli CONFIG SET maxmemory-policy volatile-lru
```

---

## **Recovery from Backup (Scenario D)**

### **Step 1: Identify Latest Backup**
```bash
# List available backups
ls -lh ./backups/redis-backup-*

# Or check automated backups
docker compose exec db ls -lh /backups/
```

### **Step 2: Restore from Backup**
```bash
# Stop Redis
docker compose stop redis

# Copy backup into Redis container
docker compose cp ./backups/redis-backup-<TIMESTAMP>.rdb redis:/data/dump.rdb

# Start Redis (will load from dump.rdb)
docker compose up -d redis

# Verify data restored
docker compose exec redis redis-cli DBSIZE
```

---

## **Validation**

### **1. Health Checks**
```bash
# Redis health
docker compose exec redis redis-cli PING
# Expected: PONG

# Check all services
docker compose ps
# All should show "Up" and "healthy"
```

### **2. Functional Tests**

#### **Test Rate Limiter**
```bash
# Verify token bucket works
docker compose exec redis redis-cli GET "rate_limit:shop:1:tokens"
# Expected: numeric value
```

#### **Test Token Cache**
```bash
# Check token cache keys
docker compose exec redis redis-cli KEYS "token:cache:*"
# Expected: list of token keys
```

#### **Test Celery Queue**
```bash
# Check Celery can queue tasks
docker compose exec worker celery -A app.worker.celery_app inspect active_queues
# Expected: list of queues
```

#### **Test Idempotency Cache**
```bash
# Verify idempotency keys work
docker compose exec redis redis-cli KEYS "idempotency:*"
```

### **3. Metrics Check**
```bash
# Open Prometheus
# Navigate to: http://localhost:9090

# Run queries:
# 1. Redis connection pool: redis_connection_pool_in_use
# 2. Rate limit rejections: rate(rate_limit_rejections_total[5m])
# 3. Token cache hit rate: token_cache_hits / (token_cache_hits + token_cache_misses)
```

---

## **Post-Restart Checklist**

### **Data Integrity**
- [ ] Verify critical keys exist (rate limits, tokens)
- [ ] Check for data loss (compare DBSIZE before/after)
- [ ] Validate TTL on expiring keys

### **Performance**
- [ ] Monitor Redis CPU usage (should be < 50%)
- [ ] Check memory usage (should be < 80% of max)
- [ ] Verify latency (p99 < 10ms)

### **Application State**
- [ ] Re-queue any failed jobs from during outage
- [ ] Check for stuck listing jobs
- [ ] Verify token refresh still works

---

## **Common Issues & Solutions**

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Persistence disabled** | Data lost after restart | Enable RDB or AOF persistence |
| **Memory fragmentation** | High memory but few keys | Run `redis-cli DEBUG RELOAD` |
| **Slow queries** | High latency | Identify with `SLOWLOG GET 10` |
| **Connection pool exhausted** | "Too many clients" error | Increase `maxclients` in config |
| **Disk full** | Cannot save RDB | Clear old backups, increase volume size |

---

## **Preventive Maintenance**

### **Regular Tasks**
```bash
# Weekly: Check memory fragmentation
docker compose exec redis redis-cli INFO memory | grep fragmentation

# Monthly: Review key distribution
docker compose exec redis redis-cli --bigkeys

# Quarterly: Test backup restore (DR drill)
```

### **Monitoring Setup**
1. **Alert**: Redis memory > 80% of max
2. **Alert**: Redis connection pool exhausted (in_use > 80%)
3. **Dashboard**: Add "Redis Health" panel to Grafana
4. **Metric**: Track `redis_up`, `redis_memory_used_bytes`, `redis_connected_clients`

---

## **Escalation**

If Redis issues persist after 15 minutes:
1. **Check infrastructure**: Disk I/O, network latency, host memory
2. **Review logs**: Look for Redis errors, segfaults, OOM kills
3. **Consider**: Migrate to managed Redis (AWS ElastiCache, Redis Cloud)

---

## **Useful Commands**

```bash
# Debug Redis performance
docker compose exec redis redis-cli --latency
docker compose exec redis redis-cli --latency-history
docker compose exec redis redis-cli INFO stats

# Check slow queries
docker compose exec redis redis-cli SLOWLOG GET 10

# Monitor real-time commands
docker compose exec redis redis-cli MONITOR

# Check persistence status
docker compose exec redis redis-cli INFO persistence

# Force background save
docker compose exec redis redis-cli BGSAVE
```

---

**Last Updated:** 2026-02-09  
**Owner:** Platform Team  
**Version:** 1.0
