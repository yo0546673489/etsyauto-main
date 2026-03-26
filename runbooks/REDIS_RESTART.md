# Runbook: Redis Restart

## 🚨 Alert

**Alert Names**: `RedisDown`, `RedisConnectionErrors`, `HighRedisLatency`  
**Severity**: Warning → Critical  
**Thresholds**: Redis unavailable >1 minute or connection errors spike

## 📊 Symptoms

- API/worker logs show `ConnectionError` or `Timeout` to Redis
- Token bucket and rate-limiter failures
- Celery broker connection drops or queue stalls
- Metrics: Redis availability or latency alerts firing

## 🔍 Diagnosis

### 1. Check Redis container status
```bash
docker compose ps redis
docker compose logs -f redis
```

### 2. Check Redis health from the API container
```bash
docker compose exec -T api redis-cli -h redis ping
```

### 3. Check Redis memory and eviction
```bash
docker compose exec -T redis redis-cli INFO memory
docker compose exec -T redis redis-cli INFO stats
```

## 🛠️ Resolution

### Scenario 1: Redis container crashed
```bash
docker compose restart redis
```

### Scenario 2: Redis running but unresponsive
```bash
docker compose exec -T redis redis-cli ping
docker compose restart redis
```

### Scenario 3: Redis memory pressure / eviction
1. Inspect memory usage:
   ```bash
   docker compose exec -T redis redis-cli INFO memory
   ```
2. If near max, restart Redis:
   ```bash
   docker compose restart redis
   ```
3. Consider increasing Redis memory or setting `maxmemory-policy` in production.

## 🔄 Recovery Verification

```bash
docker compose exec -T redis redis-cli ping
docker compose exec -T api curl -s http://localhost:8080/healthz
```

Expected:
- Redis responds with `PONG`
- API health endpoint is `200 OK`

## 📞 Escalation

- If Redis restarts repeatedly or data loss is suspected, escalate to DevOps.
- Check persistent volume health and host disk usage:
  ```bash
  df -h
  docker system df
  ```

## 📝 Post-Incident

- Capture logs from API/worker around the failure window.
- Review Redis memory and eviction settings.
- Add monitoring thresholds if missing.
