# Production Deployment Checklist

## Issue Resolution Summary

### Fixed Issues:
1. **Shop Connection Error (`KeyError: 'id'`)** - Server had outdated code
2. **Red Alerts Appearing White** - CSS overrides were neutralizing color classes

## Pre-Deployment Steps

### 1. Build Fresh Docker Images
```bash
# On your production server, run:
docker compose build --no-cache

# Or build specific services:
docker compose build --no-cache api worker web
```

### 2. Stop Existing Containers
```bash
docker compose down
```

### 3. Pull Latest Code
```bash
git pull origin main
```

### 4. Start Services
```bash
docker compose up -d
```

### 5. Verify Deployment
```bash
# Check container status
docker compose ps

# Check API logs
docker compose logs api --tail=50

# Check Web logs
docker compose logs web --tail=50

# Check Worker logs
docker compose logs worker --tail=50
```

## Common Production Issues

### Issue: Old Code Running
**Symptoms:** Error logs show old line numbers or outdated function signatures

**Solution:**
```bash
# Full rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Issue: CSS Not Applying
**Symptoms:** Styles look different than localhost

**Solution:**
- Clear browser cache (Ctrl+Shift+R)
- Verify `globals.css` has the color exceptions for red/green
- Rebuild web container: `docker compose build --no-cache web`

### Issue: Environment Variables Not Loading
**Symptoms:** 500 errors, missing configurations

**Solution:**
- Verify `.env` file exists on server
- Check all required variables are set:
  ```bash
  docker compose config
  ```

## Verification Tests

### 1. Test Shop Connection
1. Navigate to Settings page
2. Click "Connect Etsy"
3. Verify OAuth flow starts without errors

### 2. Test Alert Colors
1. Navigate to AI Generation page
2. Without selecting a product, check info banner is **red**
3. All warning modals should appear **red**

### 3. Test Order Status Colors
1. Navigate to Orders page
2. Verify:
   - Green for "Completed" and "Paid"
   - Red for "Cancelled"
   - Yellow for "In Transit" and "Unpaid"

## Environment-Specific Notes

### Local Development
- Uses hot reload
- CSS changes reflect immediately
- No need to rebuild for code changes

### Production
- Requires full rebuild for any code/CSS changes
- No hot reload
- Always use `--no-cache` flag to ensure fresh build

## Post-Deployment

### Monitor for Issues
```bash
# Watch logs in real-time
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web
```

### Common Commands
```bash
# Restart specific service
docker compose restart api

# View service status
docker compose ps

# Execute commands in container
docker compose exec api alembic upgrade heads
docker compose exec -T api python -c "from app.db.session import SessionLocal; print('DB OK')"
```

## Rollback Procedure

If deployment fails:

```bash
# 1. Stop services
docker compose down

# 2. Checkout previous working commit
git checkout <previous-commit-hash>

# 3. Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

## Support

If issues persist:
1. Check container logs: `docker compose logs <service>`
2. Verify environment variables
3. Ensure all migrations ran: `docker compose exec api alembic current`
4. Test database connectivity
5. Check Redis connectivity: `docker compose exec api redis-cli ping`
