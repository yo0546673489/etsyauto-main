# 🔄 Runbook: Token Refresh Loop

## **Incident Type**
**Severity:** Critical  
**Impact:** OAuth tokens continuously refreshing, causing excessive API calls and potential account lockout

---

## **Symptoms**
- Repeated `token.refresh` entries in audit logs (> 10/minute for single shop)
- Redis lock contention warnings: "Failed to acquire refresh lock"
- Alert: "Token refresh rate > 60/hour for shop"
- Workers spending excessive time on token refresh
- Users reporting intermittent "Authentication failed" errors

---

## **Immediate Actions (< 3 minutes)**

### 1. **Verify the Loop**
```bash
# Check token refresh frequency per shop
docker compose exec db psql -U postgres etsy_automation -c "
SELECT shop_id, COUNT(*) as refresh_count,
       MAX(created_at) as last_refresh
FROM audit_logs
WHERE action = 'token.refresh'
  AND created_at > NOW() - INTERVAL '5 minutes'
GROUP BY shop_id
HAVING COUNT(*) > 5
ORDER BY refresh_count DESC;
"
```

### 2. **Identify Looping Shops**
```bash
# Get shop details
docker compose exec db psql -U postgres etsy_automation -c "
SELECT s.id, s.etsy_shop_id, s.display_name, s.status,
       ot.expires_at, ot.updated_at
FROM shops s
JOIN oauth_tokens ot ON s.id = ot.shop_id
WHERE s.id IN (<AFFECTED_SHOP_IDS>);
"
```

### 3. **Emergency Brake - Disable Affected Shops**
```bash
# Temporarily disconnect affected shops
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE shops
SET status = 'maintenance'
WHERE id IN (<SHOP_ID_1>, <SHOP_ID_2>);
"

# Notify users via in-app notification
curl -X POST http://localhost:8080/api/admin/notify \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": <TENANT_ID>,
    "message": "Shop temporarily offline for maintenance"
  }'
```

---

## **Root Cause Analysis (3-10 minutes)**

### **Check Token Manager State**
```bash
# Check Redis refresh locks
docker compose exec redis redis-cli

# In Redis CLI:
KEYS token:refresh:lock:*
GET token:refresh:lock:shop:<SHOP_ID>
TTL token:refresh:lock:shop:<SHOP_ID>

# Check cached tokens
GET token:cache:etsy:tenant:<TENANT_ID>:shop:<SHOP_ID>
```

### **Examine Token Expiry Logic**
```bash
# Check OAuth token data
docker compose exec db psql -U postgres etsy_automation -c "
SELECT shop_id, provider,
       expires_at,
       expires_at - NOW() as time_until_expiry,
       updated_at
FROM oauth_tokens
WHERE shop_id = <SHOP_ID>;
"
```

### **Common Causes**

| Cause | Symptom | Root Issue |
|-------|---------|------------|
| **Clock skew** | `expires_at` in past but token valid | Server time != Etsy time |
| **Race condition** | Multiple workers refreshing simultaneously | Redis lock not acquired properly |
| **Invalid refresh token** | Refresh succeeds but new token expires immediately | Etsy revoked app access |
| **Expiry miscalculation** | Token refreshed every request | `expires_at` set incorrectly (seconds vs ms) |
| **Preemptive refresh too aggressive** | Refresh triggered 55 min before expiry | `PREEMPTIVE_REFRESH_BUFFER` too large |

---

## **Diagnostic Queries**

### **Check Refresh Pattern**
```sql
-- View refresh timeline for affected shop
SELECT created_at, status_code, latency_ms, diff
FROM audit_logs
WHERE shop_id = <SHOP_ID>
  AND action = 'token.refresh'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

### **Check for Clock Skew**
```bash
# Compare server time with Etsy API
date -u
curl -I https://openapi.etsy.com/v3/application/shops/12345 | grep -i date

# Check token expiry vs current time
docker compose exec db psql -U postgres etsy_automation -c "
SELECT shop_id,
       expires_at,
       NOW() as current_time,
       EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
FROM oauth_tokens
WHERE shop_id = <SHOP_ID>;
"
```

---

## **Mitigation Steps**

### **Fix 1: Clear Stuck Locks (Quick)**
```bash
# Clear Redis refresh locks for affected shop
docker compose exec redis redis-cli DEL "token:refresh:lock:shop:<SHOP_ID>"

# Clear token cache to force fresh fetch
docker compose exec redis redis-cli DEL "token:cache:etsy:tenant:<TENANT_ID>:shop:<SHOP_ID>"
```

### **Fix 2: Adjust Refresh Buffer**
```python
# Edit: apps/api/app/services/token_manager.py
# Line ~25: Reduce preemptive refresh window

PREEMPTIVE_REFRESH_BUFFER = timedelta(minutes=5)  # Was: timedelta(minutes=55)
```

### **Fix 3: Fix Clock Skew (If Detected)**
```bash
# Sync system time with NTP
sudo systemctl restart systemd-timesyncd
timedatectl status

# Or manually sync
sudo ntpdate -s time.nist.gov
```

### **Fix 4: Revoke & Re-authorize (Nuclear Option)**
```bash
# Delete OAuth token (forces user to reconnect)
docker compose exec db psql -U postgres etsy_automation -c "
DELETE FROM oauth_tokens WHERE shop_id = <SHOP_ID>;
"

# Update shop status
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE shops
SET status = 'disconnected'
WHERE id = <SHOP_ID>;
"

# Notify user to reconnect shop via UI
```

---

## **Validation**

### 1. **Re-enable Shop**
```bash
docker compose exec db psql -U postgres etsy_automation -c "
UPDATE shops
SET status = 'connected'
WHERE id = <SHOP_ID>;
"
```

### 2. **Monitor for 15 Minutes**
```bash
# Watch for token refresh attempts (should be minimal)
docker compose logs -f api | grep "token.refresh"

# Check audit logs
docker compose exec db psql -U postgres etsy_automation -c "
SELECT COUNT(*) as refresh_count
FROM audit_logs
WHERE shop_id = <SHOP_ID>
  AND action = 'token.refresh'
  AND created_at > NOW() - INTERVAL '10 minutes';
"
# Expected: 0-1 refreshes
```

### 3. **Test API Calls**
```bash
# Trigger a test listing job to verify token works
curl -X POST http://localhost:8080/api/shops/<SHOP_ID>/listings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": <PRODUCT_ID>,
    "shop_id": <SHOP_ID>
  }'
```

---

## **Recovery**

### **Cleanup Failed Jobs**
```bash
# Find jobs that failed due to auth issues during loop
docker compose exec db psql -U postgres etsy_automation -c "
SELECT id, product_id, error_message
FROM listing_jobs
WHERE shop_id = <SHOP_ID>
  AND status = 'failed'
  AND error_code IN ('AUTH_FAILED', 'TOKEN_REFRESH_FAILED')
  AND created_at > NOW() - INTERVAL '1 hour';
"

# Retry jobs
# (Use retry API endpoint for each job)
```

---

## **Post-Incident**

### **Code Review Checklist**
1. **Verify single-flight pattern** in `token_manager.py`:
   ```python
   # Ensure Redis lock is properly acquired
   lock_acquired = redis_client.set(
       lock_key, 
       "locked", 
       nx=True,  # Only set if not exists
       ex=30     # Lock expires in 30s
   )
   ```

2. **Check expiry calculation**:
   ```python
   # Ensure expires_in is in seconds, not milliseconds
   expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
   ```

3. **Verify preemptive refresh logic**:
   ```python
   # Should NOT refresh if > 5 min remaining
   if expires_at - datetime.utcnow() > timedelta(minutes=5):
       return cached_token
   ```

### **Add Monitoring**
1. **Alert**: Token refresh rate > 10/hour for any shop
2. **Dashboard**: Add "Token Refresh Frequency" panel
3. **Metric**: Track `token_refresh_loop_detected_total`

### **Documentation**
- Add incident to postmortem log
- Update `TOKEN_MANAGEMENT.md` with lessons learned

---

## **Preventive Measures**
- [ ] Implement exponential backoff on refresh failures
- [ ] Add circuit breaker: max 5 refreshes/hour per shop
- [ ] Log warning if refresh triggered with > 10 min remaining
- [ ] Add integration test for refresh race conditions

---

## **Escalation**

If token loop persists after 20 minutes:
1. **Disable shop** permanently until manual review
2. **Check Etsy Developer Portal**: Verify app status, rate limits
3. **Contact Etsy Support**: Report OAuth token behavior (include shop ID, timestamps)

---

## **Useful Commands**

```bash
# View all active Redis locks
docker compose exec redis redis-cli KEYS "token:refresh:lock:*"

# Check TokenManager logs
docker compose logs api | grep "TokenManager"

# Force token cache invalidation for all shops
docker compose exec redis redis-cli --scan --pattern "token:cache:*" | xargs docker compose exec redis redis-cli DEL
```

---

**Last Updated:** 2026-02-09  
**Owner:** Platform Team  
**Version:** 1.0
