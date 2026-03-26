# Runbook: OAuth Token Failure

## 🚨 Alert

**Alert Name**: `OAuthTokenRefreshFailures`  
**Severity**: Critical  
**Threshold**: >5 token refresh failures per second

## 📊 Symptoms

- Sentry alerts showing `oauth_token_refresh_failures_total` spike
- Users unable to access Etsy shop data
- API requests returning 401 Unauthorized
- Grafana OAuth dashboard showing high failure rate
- Metrics showing: `oauth_token_refresh_failures_total{error_type="..."}`

## 🔍 Diagnosis

### 1. Check Sentry for Error Details

**Sentry Query:**
```
is:unresolved error.type:OAuthError OR error.type:TokenRefreshError
```

**Look for:**
- Error message (e.g., "invalid_grant", "token_expired", "rate_limit")
- Affected `tenant_id` and `shop_id` tags
- Frequency and pattern (single shop vs. platform-wide)

### 2. Check Grafana OAuth Dashboard

**URL**: `http://localhost:3001/d/oauth-dashboard`

**Key Metrics:**
- Token refresh failure rate by shop
- Active OAuth tokens count
- Tokens expiring soon
- Refresh success rate %

### 3. Check Prometheus Alerts

```bash
curl http://localhost:9090/api/v1/query?query=oauth_token_refresh_failures_total
```

### 4. Query Database for Token Status

```sql
-- Check OAuth tokens
SELECT 
    tenant_id,
    shop_id,
    expires_at,
    updated_at,
    EXTRACT(EPOCH FROM (expires_at - NOW())) AS seconds_until_expiry
FROM oauth_tokens
WHERE expires_at < NOW() + INTERVAL '1 hour'
ORDER BY expires_at;

-- Check recent refresh attempts
SELECT * FROM audit_logs
WHERE action LIKE 'oauth.%'
ORDER BY created_at DESC
LIMIT 50;
```

## 🛠️ Resolution

### Scenario 1: Etsy API Outage

**Symptoms:**
- All shops failing
- Error: `503 Service Unavailable` or `Connection timeout`

**Actions:**
1. Check Etsy API status: https://www.etsy.com/developers/status
2. Enable graceful degradation:
   ```bash
   # Pause all OAuth-dependent tasks
   docker exec etsy-worker celery -A app.worker.celery_app control shutdown
   ```
3. Wait for Etsy API recovery
4. Resume workers:
   ```bash
   docker-compose restart worker
   ```

### Scenario 2: Invalid Grant (Token Revoked)

**Symptoms:**
- Specific shop(s) failing
- Error: `invalid_grant` or `token_revoked`

**Actions:**
1. Identify affected shop:
   ```sql
   SELECT * FROM oauth_tokens WHERE shop_id = <SHOP_ID>;
   ```

2. Mark token as revoked:
   ```sql
   UPDATE shops SET status = 'revoked' WHERE id = <SHOP_ID>;
   ```

3. Notify tenant to re-authenticate:
   ```sql
   INSERT INTO notifications (user_id, tenant_id, type, title, message)
   VALUES (
       <USER_ID>,
       <TENANT_ID>,
       'error',
       'Etsy Connection Lost',
       'Please reconnect your Etsy shop in Settings > Shops'
   );
   ```

4. Send email to user (if configured in Alertmanager)

### Scenario 3: Rate Limit on Token Endpoint

**Symptoms:**
- Multiple shops failing
- Error: `429 Too Many Requests` on `/oauth/token`

**Actions:**
1. Implement exponential backoff:
   ```python
   # Already implemented in apps/api/app/services/etsy_oauth.py
   # Verify backoff is working:
   ```
   ```bash
   docker logs etsy-api | grep "OAuth backoff"
   ```

2. Increase backoff delay if needed:
   ```python
   # In apps/api/app/services/etsy_oauth.py
   # Update RETRY_BACKOFF_BASE from 2 to 5 seconds
   ```

3. Spread out refresh schedule:
   ```sql
   -- Update scheduled refresh to avoid thundering herd
   UPDATE oauth_tokens 
   SET next_refresh_at = expires_at - INTERVAL '1 hour' + (RANDOM() * INTERVAL '30 minutes')
   WHERE expires_at > NOW();
   ```

### Scenario 4: Database Connection Issues

**Symptoms:**
- Token refresh succeeds but fails to save
- Error: `OperationalError: could not connect to server`

**Actions:**
1. Check database connectivity:
   ```bash
   docker exec etsy-api python -c "from app.core.database import engine; engine.connect()"
   ```

2. Check database connection pool:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'etsy_automation';
   ```

3. Restart database if needed:
   ```bash
   docker-compose restart postgres
   ```

4. Clear stale connections:
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE datname = 'etsy_automation' AND state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes';
   ```

### Scenario 5: Encryption Key Issues

**Symptoms:**
- Token decrypt failures
- Error: `cryptography.fernet.InvalidToken`

**Actions:**
1. Verify encryption key is set:
   ```bash
   docker exec etsy-api env | grep ENCRYPTION_KEY
   ```

2. If key changed, tokens need re-encryption:
   ```sql
   -- CRITICAL: Only run if you have the old key
   -- Contact DevOps for key rotation procedure
   ```

3. As temporary fix, force users to re-authenticate:
   ```sql
   UPDATE shops SET status = 'revoked';
   ```

## 🔄 Post-Incident

### 1. Review Audit Logs

```sql
SELECT * FROM audit_logs
WHERE action LIKE 'oauth.%'
AND created_at > NOW() - INTERVAL '1 hour'
AND status = 'failure'
ORDER BY created_at;
```

### 2. Check Affected Tenants

```sql
SELECT DISTINCT tenant_id, shop_id, error_message
FROM audit_logs
WHERE action = 'oauth.token_refresh'
AND status = 'failure'
AND created_at > NOW() - INTERVAL '1 hour';
```

### 3. Verify Recovery

**Metrics to check:**
- `oauth_token_refresh_total{status="success"}` trending up
- `oauth_token_refresh_failures_total` back to baseline
- Active shops count restored

### 4. Update Runbook

Document any new failure modes discovered

## 📞 Escalation

### Level 1: On-Call Engineer
- Follow this runbook
- Check Sentry, Grafana, Prometheus
- Attempt standard resolutions

### Level 2: Backend Team Lead
- If issue persists > 30 minutes
- If affecting > 50% of shops
- If database or encryption issues suspected

### Level 3: DevOps + Etsy API Support
- If Etsy API issue confirmed
- If infrastructure changes needed
- If key rotation required

## 🔗 Related Links

- [Etsy OAuth Documentation](https://developers.etsy.com/documentation/essentials/authentication)
- [Etsy API Status](https://www.etsy.com/developers/status)
- [OAuth Implementation](../apps/api/app/services/etsy_oauth.py)
- [Token Refresh Task](../apps/api/app/worker/tasks/token_tasks.py)
- [Grafana OAuth Dashboard](http://localhost:3001/d/oauth-dashboard)
- [Sentry OAuth Errors](https://sentry.io/organizations/your-org/issues/?query=is%3Aunresolved+error.type%3AOAuthError)

## 📝 Preventive Measures

1. **Proactive Token Refresh**
   - Refresh tokens 1 hour before expiry
   - Already implemented in scheduled task

2. **Single-Flight Refresh**
   - Prevent concurrent refresh attempts
   - Implemented with Redis locks

3. **Exponential Backoff**
   - Handle rate limits gracefully
   - Implemented in OAuth service

4. **Monitoring**
   - Alert on >5 failures/second
   - Dashboard shows real-time status
   - Audit logs track all attempts

5. **User Notifications**
   - Auto-notify users of auth issues
   - Provide clear re-auth instructions

---

**Last Updated**: December 2025  
**Owner**: Backend Team  
**Severity**: Critical

