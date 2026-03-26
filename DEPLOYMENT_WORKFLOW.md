# Production Deployment Workflow

This document describes the standardized process for deploying updates to production safely and efficiently.

## Overview

Our deployment workflow includes:
- ✅ Automated database backups
- ✅ Health checks
- ✅ Automatic rollback on failure
- ✅ Migration management
- ✅ Zero-downtime deployments

## Quick Start

### On Your Local Machine

1. **Make your changes** and test locally
2. **Commit and push** to GitHub:
   ```bash
   git add .
   git commit -m "Your change description"
   git push origin main
   ```

### On Production Server (VPS)

Simply run the deployment script:
```bash
cd /home/deploy/etsyauto
./deploy-to-production.sh
```

That's it! The script handles everything automatically.

## What the Deployment Script Does

### Step 1: Pre-deployment Checks
- Verifies `.env` file exists
- Checks that required services are running

### Step 2: Database Backup
- Creates timestamped backup: `backups/db_backup_YYYYMMDD_HHMMSS.sql`
- Keeps last 5 backups, removes older ones
- **Critical**: This allows rollback if something goes wrong

### Step 3: Pull Latest Code
- Fetches latest code from GitHub
- Shows commit changes

### Step 4: Build & Restart Services
- Rebuilds Docker containers with new code
- Restarts all services

### Step 5: Run Database Migrations
- Applies any pending Alembic migrations
- **If migrations fail**: Automatically rolls back database and code

### Step 6: Health Checks
- Verifies API is responding (`/healthz`)
- Verifies Web is responding
- **If health checks fail**: Alerts for manual intervention

### Step 7: Cleanup
- Removes old backups (keeps last 5)

## Manual Deployment Steps (If Script Unavailable)

If you need to deploy manually:

```bash
# 1. Backup database
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres etsy_platform > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Pull latest code
git pull origin main

# 3. Rebuild and restart
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 4. Run migrations
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# 5. Check logs
docker compose -f docker-compose.prod.yml logs -f api worker
```

## Rollback Procedure

If deployment fails and automatic rollback doesn't work:

```bash
# 1. Find your backup
ls -lt backups/

# 2. Restore database
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres etsy_platform < backups/db_backup_YYYYMMDD_HHMMSS.sql

# 3. Rollback code to previous commit
git log --oneline  # Find the previous commit hash
git reset --hard <PREVIOUS_COMMIT_HASH>

# 4. Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

## First-Time Setup

### 1. Make Script Executable
```bash
cd /home/deploy/etsyauto
chmod +x deploy-to-production.sh
```

### 2. Create Backups Directory
```bash
mkdir -p backups
```

### 3. Verify Git Configuration
```bash
git remote -v  # Should show your GitHub repo
git branch     # Should be on 'main'
```

## Database Reset (Clean Slate)

If you need to reset the database completely (⚠️ **DELETES ALL DATA**):

```bash
cd /home/deploy/etsyauto

# Stop services
docker compose -f docker-compose.prod.yml down

# Remove database volume
docker volume rm etsyauto_postgres_data

# Start services (creates fresh DB)
docker compose -f docker-compose.prod.yml up -d

# Wait for DB to initialize
sleep 10

# Apply all migrations from scratch
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# Restart all services
docker compose -f docker-compose.prod.yml restart
```

## Monitoring & Troubleshooting

### View Real-Time Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific services
docker compose -f docker-compose.prod.yml logs -f api worker web
```

### Check Service Status
```bash
docker compose -f docker-compose.prod.yml ps
```

### Check Migration Status
```bash
docker compose -f docker-compose.prod.yml exec api alembic current
docker compose -f docker-compose.prod.yml exec api alembic history
```

### Check Database Schema
```bash
# List all tables
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d etsy_platform -c "\dt"

# Describe a specific table
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d etsy_platform -c "\d users"
```

## Common Issues & Solutions

### Issue: Migration Conflicts (Multiple Heads)

**Symptoms**: `ERROR: Multiple head revisions are present`

**Solution**:
```bash
# Check heads
docker compose -f docker-compose.prod.yml exec api alembic heads

# Merge heads (on local machine first)
docker compose exec api alembic merge -m "merge heads" <HEAD1> <HEAD2>

# Commit and push
git add apps/api/alembic/versions/
git commit -m "Merge migration heads"
git push origin main

# Then deploy normally
```

### Issue: Missing Environment Variables

**Symptoms**: Services crash on startup

**Solution**:
```bash
# Check .env file
cat .env

# Compare with .env.example
diff .env .env.example

# Add any missing variables
nano .env
```

### Issue: Port Already in Use

**Symptoms**: `Error: port is already allocated`

**Solution**:
```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove any orphaned containers
docker ps -a | grep etsy | awk '{print $1}' | xargs docker rm -f

# Start again
docker compose -f docker-compose.prod.yml up -d
```

## Best Practices

### Before Deployment
1. ✅ Test changes locally with `docker compose up`
2. ✅ Run migrations locally first
3. ✅ Commit with clear, descriptive messages
4. ✅ Push to GitHub
5. ✅ Verify GitHub Actions pass (if configured)

### During Deployment
1. ✅ Use the deployment script
2. ✅ Monitor logs during deployment
3. ✅ Test critical functionality after deployment

### After Deployment
1. ✅ Verify health endpoints
2. ✅ Test login functionality
3. ✅ Check for errors in logs
4. ✅ Test one critical user flow

## Environment Variables Checklist

Required in production `.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres:yourpassword@db:5432/etsy_platform
DB_PASSWORD=yourpassword

# API
API_SECRET_KEY=your-secret-key
NEXTAUTH_SECRET=your-nextauth-secret
ENCRYPTION_KEY=your-encryption-key

# Frontend
NEXT_PUBLIC_API_URL=https://etsyauto.bigbotdrivers.com

# Etsy API
ETSY_CLIENT_ID=your-client-id
ETSY_CLIENT_SECRET=your-client-secret
ETSY_REDIRECT_URI=https://etsyauto.bigbotdrivers.com/api/etsy/callback

# Redis
REDIS_URL=redis://redis:6379/0
```

## Support

If you encounter issues not covered here:

1. Check logs: `docker compose -f docker-compose.prod.yml logs -f`
2. Check service status: `docker compose -f docker-compose.prod.yml ps`
3. Review recent commits: `git log --oneline -10`
4. Check database state: `docker compose -f docker-compose.prod.yml exec api alembic current`

## Future Improvements

- [ ] Add CI/CD pipeline (GitHub Actions)
- [ ] Add automated testing before deployment
- [ ] Add Slack/Discord notifications on deployment
- [ ] Add performance monitoring (New Relic, DataDog)
- [ ] Add blue-green deployment for zero-downtime
