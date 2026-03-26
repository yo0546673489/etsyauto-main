# Runbook: Celery Queue Saturation

## 🚨 Alert

**Alert Names**: `HighQueueDepth` / `CriticalQueueDepth` / `NoActiveWorkers`  
**Severity**: Warning → Critical  
**Thresholds**: 
- Warning: >100 tasks
- Critical: >500 tasks
- Critical: 0 active workers

## 📊 Symptoms

- Queue depth increasing continuously
- Tasks not processing or very slow
- User operations timing out
- Grafana worker dashboard showing high queue depth
- Metrics: `celery_queue_depth > 100`
- Dead Letter Queue growing
- High task retry rate

## 🔍 Diagnosis

### 1. Check Sentry for Worker Errors

**Sentry Query:**
```
is:unresolved error.type:CeleryError OR error.type:TaskError OR error.type:WorkerLostError
```

**Look for:**
- Task failure patterns
- Worker crashes
- Database connection errors
- Memory issues
- Timeout errors

### 2. Check Grafana Worker Dashboard

**URL**: `http://localhost:3001/d/worker-dashboard`

**Key Metrics:**
- Queue depth trend
- Active workers count
- Task execution rate
- Task failure rate %
- Task retry rate
- Dead letter queue depth

### 3. Check Celery Worker Status

```bash
# Check worker health
docker-compose ps worker

# Check worker logs
docker logs etsy-worker --tail=100

# Inspect active/reserved tasks
docker exec etsy-worker celery -A app.worker.celery_app inspect active
docker exec etsy-worker celery -A app.worker.celery_app inspect reserved

# Check worker stats
docker exec etsy-worker celery -A app.worker.celery_app inspect stats

# Check registered tasks
docker exec etsy-worker celery -A app.worker.celery_app inspect registered
```

### 4. Check Redis Queue

```bash
docker exec etsy-redis redis-cli

# Check queue lengths
LLEN celery
LLEN celery:high_priority
LLEN celery:low_priority

# Check scheduled tasks
ZCARD celery:scheduled

# Check failed tasks
LLEN celery:failed
```

### 5. Check Resource Usage

```bash
# Worker container resources
docker stats etsy-worker --no-stream

# Database connections
docker exec etsy-postgres psql -U etsy_user -d etsy_automation -c "SELECT count(*) FROM pg_stat_activity;"

# Redis memory
docker exec etsy-redis redis-cli INFO memory
```

## 🛠️ Resolution

### Scenario 1: Workers Down/Crashed

**Symptoms:**
- `celery_active_workers = 0`
- Queue depth growing
- No task processing

**Actions:**
1. **Check worker container:**
   ```bash
   docker-compose ps worker
   docker logs etsy-worker --tail=50
   ```

2. **Restart workers:**
   ```bash
   docker-compose restart worker
   
   # Or if needed, recreate:
   docker-compose up -d --force-recreate worker
   ```

3. **Verify workers started:**
   ```bash
   docker exec etsy-worker celery -A app.worker.celery_app inspect ping
   ```

4. **Check for startup errors:**
   ```bash
   docker logs etsy-worker --tail=100 | grep -i error
   ```

5. **If crash loop, check for:**
   - Import errors in task modules
   - Database connection failures
   - Missing environment variables
   ```bash
   docker exec etsy-worker env | grep -E "DATABASE|REDIS|CELERY"
   ```

### Scenario 2: Database Connection Pool Exhausted

**Symptoms:**
- Tasks failing with `OperationalError: connection pool exhausted`
- Workers alive but not processing
- Database showing many connections

**Actions:**
1. **Check database connections:**
   ```sql
   SELECT 
       count(*),
       state,
       wait_event_type
   FROM pg_stat_activity 
   WHERE datname = 'etsy_automation'
   GROUP BY state, wait_event_type;
   ```

2. **Kill idle connections:**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'etsy_automation'
   AND state = 'idle'
   AND state_change < NOW() - INTERVAL '10 minutes';
   ```

3. **Increase connection pool:**
   ```python
   # In apps/api/app/core/database.py
   # Increase pool_size and max_overflow
   engine = create_engine(
       DATABASE_URL,
       pool_size=20,  # Increase from 10
       max_overflow=40  # Increase from 20
   )
   ```

4. **Restart workers to reset connections:**
   ```bash
   docker-compose restart worker
   ```

### Scenario 3: Memory Leak/OOM

**Symptoms:**
- Worker memory usage >90%
- Kernel OOM messages in logs
- Workers restarting frequently

**Actions:**
1. **Check memory usage:**
   ```bash
   docker stats etsy-worker --no-stream
   docker logs etsy-worker | grep -i "memory\|oom\|killed"
   ```

2. **Increase worker memory limit:**
   ```yaml
   # In docker-compose.yml
   services:
     worker:
       deploy:
         resources:
           limits:
             memory: 2G  # Increase from 1G
   ```

3. **Enable worker autorestart:**
   ```python
   # In celery_app.py
   celery_app.conf.worker_max_tasks_per_child = 1000  # Restart after 1000 tasks
   celery_app.conf.worker_max_memory_per_child = 400000  # 400MB
   ```

4. **Scale workers horizontally:**
   ```bash
   docker-compose up -d --scale worker=3
   ```

5. **Profile memory usage:**
   ```python
   # Add to task
   import tracemalloc
   tracemalloc.start()
   # ... task code ...
   snapshot = tracemalloc.take_snapshot()
   top_stats = snapshot.statistics('lineno')
   ```

### Scenario 4: Slow Tasks Blocking Queue

**Symptoms:**
- Queue depth growing
- Tasks taking very long (>5 minutes)
- Few tasks completing

**Actions:**
1. **Identify slow tasks:**
   ```bash
   docker exec etsy-worker celery -A app.worker.celery_app inspect active | jq '.[] | .[] | select(.time_start | tonumber < (now - 300))'
   ```

2. **Check task duration metrics:**
   ```bash
   curl "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95, rate(celery_task_duration_seconds_bucket[5m]))"
   ```

3. **Revoke slow tasks:**
   ```bash
   # Get task IDs
   docker exec etsy-worker celery -A app.worker.celery_app inspect active
   
   # Revoke specific task
   docker exec etsy-worker celery -A app.worker.celery_app control revoke <TASK_ID>
   
   # Revoke all tasks (nuclear option)
   docker exec etsy-worker celery -A app.worker.celery_app purge
   ```

4. **Add task timeouts:**
   ```python
   # In task definition
   @celery_app.task(time_limit=300, soft_time_limit=280)  # 5 min hard, 4:40 soft
   def my_task():
       pass
   ```

5. **Investigate why tasks are slow:**
   - Check external API latency (Etsy)
   - Check database query performance
   - Check for N+1 queries
   - Review Sentry performance monitoring

### Scenario 5: Retry Storm

**Symptoms:**
- High retry rate: `celery_task_retried_total`
- Same tasks failing repeatedly
- Queue depth oscillating

**Actions:**
1. **Check retry patterns:**
   ```bash
   docker logs etsy-worker | grep "Retry" | tail -50
   ```

2. **Identify failing task:**
   ```bash
   curl "http://localhost:9090/api/v1/query?query=rate(celery_task_retried_total[5m])"
   ```

3. **Stop retry storm:**
   ```python
   # Temporarily disable retries
   @celery_app.task(autoretry_for=(), max_retries=0)
   ```

4. **Fix root cause:**
   - If external API down, pause tasks
   - If data issue, fix data
   - If bug, deploy hotfix

5. **Clear failed tasks:**
   ```bash
   # Purge dead letter queue
   docker exec etsy-redis redis-cli DEL celery:failed
   ```

### Scenario 6: Scheduled Task Avalanche

**Symptoms:**
- Sudden spike in queue depth at specific times
- Pattern repeats (e.g., every hour)
- Scheduled tasks overwhelming workers

**Actions:**
1. **Check scheduled tasks:**
   ```bash
   docker exec etsy-worker celery -A app.worker.celery_app inspect scheduled
   ```

2. **Disable problematic schedules:**
   ```sql
   UPDATE schedules SET status = 'paused' WHERE id = <SCHEDULE_ID>;
   ```

3. **Spread out schedule times:**
   ```sql
   -- Add jitter to cron schedules
   UPDATE schedules
   SET cron_expr = '*/15 * * * *'  -- Change from '0 * * * *'
   WHERE type = 'sync';
   ```

4. **Implement task throttling:**
   ```python
   # In apps/api/app/worker/tasks/schedule_tasks.py
   @celery_app.task(rate_limit='10/s')  # Max 10 per second
   def scheduled_sync():
       pass
   ```

5. **Use priority queues:**
   ```python
   # High-priority tasks
   publish_listing.apply_async(args=[...], priority=9)
   
   # Low-priority tasks
   sync_products.apply_async(args=[...], priority=1)
   ```

## 🔄 Recovery Steps

### 1. Drain Queue Gradually

```bash
# Start with minimal workers
docker-compose up -d worker
docker exec etsy-worker celery -A app.worker.celery_app control pool_shrink 2

# Monitor queue depth
watch -n 5 'curl -s "http://localhost:9090/api/v1/query?query=celery_queue_depth" | jq'

# Gradually increase capacity
docker exec etsy-worker celery -A app.worker.celery_app control pool_grow 2

# Scale workers
docker-compose up -d --scale worker=3
```

### 2. Verify Task Processing

```bash
# Check task throughput
curl "http://localhost:9090/api/v1/query?query=rate(celery_task_succeeded_total[5m])"

# Check failure rate
curl "http://localhost:9090/api/v1/query?query=rate(celery_task_failed_total[5m])/rate(celery_task_started_total[5m])"
```

### 3. Monitor Dead Letter Queue

```bash
# Should remain at 0
curl "http://localhost:9090/api/v1/query?query=celery_dead_letter_queue_depth"
```

## 📊 Post-Incident Analysis

### 1. Query Task Statistics

```sql
-- Task execution stats during incident
SELECT 
    task_name,
    COUNT(*) as total_runs,
    AVG(latency_ms)/1000 as avg_duration_sec,
    COUNT(CASE WHEN status = 'failure' THEN 1 END) as failures,
    COUNT(CASE WHEN attempt > 1 THEN 1 END) as retries
FROM audit_logs
WHERE action LIKE 'celery.%'
AND created_at BETWEEN '<INCIDENT_START>' AND '<INCIDENT_END>'
GROUP BY task_name
ORDER BY total_runs DESC;
```

### 2. Identify Bottlenecks

```sql
-- Slowest tasks
SELECT 
    action,
    MAX(latency_ms)/1000 as max_duration_sec,
    AVG(latency_ms)/1000 as avg_duration_sec
FROM audit_logs
WHERE created_at BETWEEN '<INCIDENT_START>' AND '<INCIDENT_END>'
GROUP BY action
HAVING AVG(latency_ms) > 10000
ORDER BY max_duration_sec DESC;
```

### 3. Review Sentry Issues

Check for patterns in task failures:
- Common exception types
- Affected tenants/shops
- Time of day patterns

## 📞 Escalation

### Level 1: On-Call Engineer (0-15 min)
- Restart workers
- Check basic health
- Apply standard fixes

### Level 2: Backend Team (15-30 min)
- If workers won't start
- If memory/resource issues
- If code changes needed

### Level 3: DevOps + Database Team (30+ min)
- If database issues
- If infrastructure scaling needed
- If Redis cluster issues

## 🔗 Related Links

- [Celery Best Practices](https://docs.celeryproject.org/en/stable/userguide/tasks.html#best-practices)
- [Worker Implementation](../apps/api/app/worker/)
- [Task Definitions](../apps/api/app/worker/tasks/)
- [Grafana Worker Dashboard](http://localhost:3001/d/worker-dashboard)
- [Redis Queue Monitoring](http://localhost:6379)

## 📝 Preventive Measures

### Already Implemented:
1. ✅ Task retry with exponential backoff
2. ✅ Max concurrency per shop
3. ✅ Queue depth monitoring
4. ✅ Worker health checks
5. ✅ Task duration metrics
6. ✅ Dead letter queue tracking

### Recommendations:
1. **Auto-scaling Workers**
   - Scale workers based on queue depth
   - Use Kubernetes HPA or Docker Swarm

2. **Task Circuit Breaker**
   - Auto-disable failing tasks
   - Require manual re-enable

3. **Graceful Degradation**
   - Queue non-critical tasks for later
   - Process high-priority tasks first

4. **Worker Pools**
   - Separate workers for different task types
   - Prevent slow tasks from blocking fast ones

5. **Alerting Improvements**
   - Alert on queue depth growth rate
   - Alert on worker crash loops
   - Alert on DLQ growth

---

**Last Updated**: December 2025  
**Owner**: Backend Team / DevOps  
**Severity**: Critical

