# Incident Runbooks

## 📚 Overview

This directory contains operational runbooks for handling common incidents in the Etsy Automation Platform.

## 🚨 Available Runbooks

| Runbook | Severity | Avg Resolution Time | Last Updated |
|---------|----------|---------------------|--------------|
| [OAuth Token Failure](./OAUTH_FAILURE.md) | Critical | 15-30 min | Dec 2025 |
| [429 Rate Limit Storm](./RATE_LIMIT_429_STORM.md) | Critical/Warning | 10-45 min | Dec 2025 |
| [Queue Saturation](./QUEUE_SATURATION.md) | Critical | 15-60 min | Dec 2025 |
| [Redis Restart](./REDIS_RESTART.md) | Warning/Critical | 5-20 min | Feb 2026 |

## 🔗 Quick Links

### Monitoring & Dashboards
- **Sentry**: Track errors and exceptions
- **Grafana**: http://localhost:3001
  - API Dashboard
  - OAuth Dashboard
  - Worker Dashboard
  - Rate Limiter Dashboard
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### Key Metrics
```bash
# OAuth failures
curl "http://localhost:9090/api/v1/query?query=oauth_token_refresh_failures_total"

# Rate limit hits
curl "http://localhost:9090/api/v1/query?query=rate(etsy_api_rate_limits_total[5m])"

# Queue depth
curl "http://localhost:9090/api/v1/query?query=celery_queue_depth"

# Active workers
curl "http://localhost:9090/api/v1/query?query=celery_active_workers"
```

### Common Commands

#### Check System Health
```bash
# All services status
docker-compose ps

# Recent logs
docker logs etsy-api --tail=100
docker logs etsy-worker --tail=100
docker logs etsy-postgres --tail=100
docker logs etsy-redis --tail=100
```

#### Database Queries
```sql
-- Recent errors
SELECT * FROM audit_logs 
WHERE status = 'failure' 
ORDER BY created_at DESC LIMIT 50;

-- OAuth token status
SELECT shop_id, expires_at, updated_at 
FROM oauth_tokens 
ORDER BY expires_at LIMIT 10;

-- Active schedules
SELECT * FROM schedules 
WHERE status = 'active';
```

#### Worker Management
```bash
# Worker status
docker exec etsy-worker celery -A app.worker.celery_app inspect ping

# Active tasks
docker exec etsy-worker celery -A app.worker.celery_app inspect active

# Queue stats
docker exec etsy-worker celery -A app.worker.celery_app inspect stats

# Purge queue (emergency)
docker exec etsy-worker celery -A app.worker.celery_app purge
```

## 📞 Escalation Matrix

### Level 1: On-Call Engineer
- **When**: First responder for all alerts
- **Actions**: Follow runbook, apply standard fixes
- **Escalate to L2 if**: Issue persists >30 min or affects >25% of users

### Level 2: Team Lead (Backend/DevOps)
- **When**: L1 escalation or complex issues
- **Actions**: Code fixes, infrastructure changes
- **Escalate to L3 if**: Requires architectural changes or vendor support

### Level 3: Architecture Team + Vendors
- **When**: L2 escalation or platform-wide outage
- **Actions**: Major changes, vendor coordination
- **Contact**: Etsy API Support, AWS Support, etc.

## 🔄 Incident Response Process

### 1. Detect (0-5 min)
- Alert fires in Alertmanager
- Notification sent (email/Slack/webhook)
- On-call engineer acknowledges

### 2. Diagnose (5-15 min)
- Check Sentry for errors
- Review Grafana dashboards
- Query Prometheus metrics
- Check service logs

### 3. Mitigate (15-30 min)
- Follow relevant runbook
- Apply quick fixes
- Communicate to stakeholders

### 4. Resolve (30-60 min)
- Verify fix
- Monitor recovery
- Document actions taken

### 5. Post-Mortem (Within 48h)
- Write incident report
- Update runbook if needed
- Implement preventive measures

## 📝 Runbook Template

When creating new runbooks, use this structure:

```markdown
# Runbook: [Incident Name]

## 🚨 Alert
- Alert Name
- Severity
- Threshold

## 📊 Symptoms
- Observable behaviors
- Metrics to check

## 🔍 Diagnosis
- How to investigate
- Key queries/commands

## 🛠️ Resolution
- Scenario-based fixes
- Step-by-step actions

## 🔄 Recovery Verification
- How to confirm resolution

## 📊 Post-Incident
- Data to collect
- Analysis to perform

## 📞 Escalation
- When and to whom

## 🔗 Links
- Related docs/code

## 📝 Preventive Measures
- How to avoid in future
```

## 🔄 Runbook Maintenance

### Review Schedule
- **Monthly**: Review metrics/thresholds
- **Quarterly**: Update procedures
- **After incidents**: Add new scenarios

### Update Process
1. PR with runbook changes
2. Review by team lead
3. Merge to main
4. Announce in team chat

### Version Control
All runbooks are version controlled in Git. See commit history for changes.

## 📚 Additional Resources

### External Documentation
- [Etsy API Docs](https://developers.etsy.com/documentation)
- [Celery Best Practices](https://docs.celeryproject.org/en/stable/userguide/tasks.html)
- [Sentry Documentation](https://docs.sentry.io/)
- [Prometheus Querying](https://prometheus.io/docs/prometheus/latest/querying/basics/)

### Internal Documentation
- [Architecture Overview](../docs/ARCHITECTURE.md)
- [API Documentation](../apps/api/README.md)
- [Observability Guide](../observability/README.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)

---

**Maintained by**: DevOps & Backend Teams  
**Last Review**: December 2025  
**Next Review**: March 2026

