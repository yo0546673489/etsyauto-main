# OAuth Token Error

## 📋 Issue Type
**Category**: Authentication / OAuth  
**Severity**: Critical  
**Component**: `oauth`

## 🔗 Runbook
**[OAuth Failure Runbook](../../runbooks/OAUTH_FAILURE.md)**

## 🚨 Quick Actions

### 1. Check Affected Scope
```sql
-- Count affected shops
SELECT COUNT(DISTINCT shop_id) 
FROM audit_logs 
WHERE action LIKE 'oauth.%' 
AND status = 'failure'
AND created_at > NOW() - INTERVAL '1 hour';
```

### 2. Check Error Type
Look at Sentry error tags:
- `error.type`: What kind of OAuth error?
- `shop_id`: Single shop or multiple?
- `tenant_id`: Which tenant(s) affected?

### 3. Common Causes
- ❌ **Invalid Grant**: Token revoked by user → Requires re-auth
- ❌ **Token Expired**: Refresh failed → Check refresh mechanism
- ❌ **Rate Limited**: Too many refresh attempts → Implement backoff
- ❌ **Etsy API Down**: External service issue → Wait for recovery

### 4. Immediate Mitigation
```bash
# If single shop affected:
docker exec etsy-postgres psql -U etsy_user -d etsy_automation -c \
  "UPDATE shops SET status='revoked' WHERE id=<SHOP_ID>;"

# If platform-wide:
docker-compose restart api worker
```

## 📊 Relevant Dashboards
- [Grafana OAuth Dashboard](http://localhost:3001/d/oauth-dashboard)
- [Prometheus Alerts](http://localhost:9090/alerts)

## 🔍 Investigation Checklist
- [ ] Check Etsy API status page
- [ ] Review recent token refresh attempts
- [ ] Check database oauth_tokens table
- [ ] Verify encryption key is correct
- [ ] Check audit logs for pattern

## 📞 Escalation
- **L1 (0-15min)**: On-call engineer follows runbook
- **L2 (15-30min)**: Backend team lead if persists
- **L3 (30min+)**: DevOps + Etsy support if API issue

## 📝 Post-Resolution
- [ ] Update audit log with resolution
- [ ] Notify affected tenants
- [ ] Document in post-mortem if recurring
- [ ] Update runbook if new scenario found

---
**Auto-generated from Sentry Issue Template**

