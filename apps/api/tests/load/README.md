# Load Testing

Performance testing for the Etsy Automation Platform using Locust.

## Setup

```bash
pip install locust
```

## Running Tests

### Quick Test (10 users, 1 minute)
```bash
cd apps/api/tests/load
locust -f locustfile.py --host=http://localhost:8080 \
       --users 10 --spawn-rate 2 --run-time 1m --headless
```

### Full Load Test (1000 listings across 10 shops)
```bash
locust -f locustfile.py --host=http://localhost:8080 \
       --users 50 --spawn-rate 5 --run-time 10m --headless
```

### Interactive Web UI
```bash
locust -f locustfile.py --host=http://localhost:8080
# Open http://localhost:8089 in browser
```

## Test Scenarios

### Regular Users (80% of traffic)
- List products
- Get dashboard stats  
- List orders
- Create products
- Generate AI content
- Sync orders
- Check listing jobs

### Admin Users (20% of traffic)
- List all shops
- View audit logs
- Get metrics

## Performance Targets

**SRS Requirements:**
- 1,000 listings across 10 shops
- Response time: < 500ms (p95)
- Throughput: > 100 req/sec
- Error rate: < 1%

## Interpreting Results

```
Total Requests: 10,000
Failed Requests: 50 (0.5%)
Median Response Time: 120ms
95th Percentile: 450ms
Requests/sec: 150
```

✅ **PASS** - All metrics within targets

## Pre-Test Checklist

- [ ] All services running (`docker compose ps`)
- [ ] Test database seeded with shops 1-10
- [ ] Test user created (`load_test@example.com`)
- [ ] Redis cache cleared
- [ ] Monitoring dashboards open (Grafana)

## Post-Test Analysis

1. Check Grafana for CPU/memory spikes
2. Review error logs: `docker compose logs api --tail 100`
3. Check database slow queries
4. Verify Redis hit rate
5. Review Prometheus metrics at `/metrics`
