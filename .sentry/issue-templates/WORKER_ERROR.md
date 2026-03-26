# Celery Worker / Queue Error

## 📋 Issue Type
**Category**: Background Jobs / Workers  
**Severity**: Critical / Warning  
**Component**: `worker`

## 🔗 Runbook
**[Queue Saturation Runbook](../../runbooks/QUEUE_SATURATION.md)**

## 🚨 Quick Actions

### 1. Check Worker Health
```bash
# Are workers running?
docker-compose ps worker

# Check worker logs
docker logs etsy-worker --tail=100

# Ping workers
docker exec etsy-worker celery -A app.worker.celery_app inspect ping
```

### 2. Check Queue Status
```bash
# Queue depth
curl "http://localhost:9090/api/v1/query?query=celery_queue_depth"

# Active workers
curl "http://localhost:9090/api/v1/query?query=celery_active_workers"

# Dead letter queue
curl "http://localhost:9090/api/v1/query?query=celery_dead_letter_queue_depth"
```

### 3. Identify Issue Type

#### Workers Down:
```bash
docker-compose restart worker
```

#### Queue Saturated (>100 tasks):
```bash
# Check what's in queue
docker exec etsy-worker celery -A app.worker.celery_app inspect reserved

# Revoke long-running tasks
docker exec etsy-worker celery -A app.worker.celery_app control revoke <TASK_ID>
```

#### Memory Issues:
```bash
# Check memory usage
docker stats etsy-worker --no-stream

# Restart workers to free memory
docker-compose restart worker
```

#### Database Connection Pool Exhausted:
```sql
-- Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname='etsy_automation' AND state='idle' 
AND state_change < NOW() - INTERVAL '10 minutes';
```

#### Retry Storm:
```bash
# Check retry rate
curl "http://localhost:9090/api/v1/query?query=rate(celery_task_retried_total[5m])"

# Purge failed tasks
docker exec etsy-redis redis-cli DEL celery:failed
```

## 📊 Relevant Dashboards
- [Grafana Worker Dashboard](http://localhost:3001/d/worker-dashboard)
- [Grafana API Dashboard](http://localhost:3001/d/api-dashboard)

## 🔍 Investigation Checklist
- [ ] Check worker container status
- [ ] Review worker error logs
- [ ] Check database connection count
- [ ] Check Redis memory usage
- [ ] Review recent task deployments
- [ ] Check external API availability (Etsy)
- [ ] Verify environment variables set

## 📞 Escalation
- **L1 (0-15min)**: Restart workers, clear queue
- **L2 (15-30min)**: Backend team if code issues
- **L3 (30min+)**: DevOps if infrastructure/scaling needed

## 🔧 Common Fixes

### Restart Workers
```bash
docker-compose restart worker
```

### Scale Workers
```bash
docker-compose up -d --scale worker=3
```

### Purge Queue (Nuclear Option)
```bash
docker exec etsy-worker celery -A app.worker.celery_app purge
# WARNING: Deletes all pending tasks!
```

### Check Task Definition
```bash
# List registered tasks
docker exec etsy-worker celery -A app.worker.celery_app inspect registered

# Check task routing
docker exec etsy-worker celery -A app.worker.celery_app inspect active_queues
```

## 📝 Recovery Verification
```bash
# Workers active
curl "http://localhost:9090/api/v1/query?query=celery_active_workers"

# Queue draining
watch -n 5 'curl -s "http://localhost:9090/api/v1/query?query=celery_queue_depth" | jq'

# Tasks completing
curl "http://localhost:9090/api/v1/query?query=rate(celery_task_succeeded_total[5m])"

# Failure rate normal (<5%)
curl "http://localhost:9090/api/v1/query?query=rate(celery_task_failed_total[5m])/rate(celery_task_started_total[5m])*100"
```

## 📝 Post-Resolution
- [ ] Document root cause
- [ ] Review task timeouts
- [ ] Check if worker scaling needed
- [ ] Update task code if bug found
- [ ] Add monitoring if new failure mode

---
**Auto-generated from Sentry Issue Template**

