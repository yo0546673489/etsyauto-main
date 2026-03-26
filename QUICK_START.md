# ⚡ QUICK START - Get Running in 5 Minutes

## Prerequisites
- ✅ Docker Desktop installed and running
- ✅ 8GB RAM available
- ✅ 10GB disk space

That's it! No need for Python, Node.js, or anything else.

---

## Step 1: Setup (2 minutes)

```bash
# Navigate to project
cd etsy-automation-platform

# Create environment file
cp .env.example .env

# Generate JWT keys (macOS/Linux)
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# For Windows (use Git Bash or WSL)
# Same commands as above
```

**Edit .env file:**
```bash
# Open .env in any text editor
# Minimum required changes:

DB_PASSWORD=your_secure_password_here
NEXTAUTH_SECRET=your_random_secret_here

# Optional (can add later):
# ETSY_CLIENT_ID=
# ETSY_CLIENT_SECRET=
```

---

## Step 2: Start Everything (2 minutes)

```bash
# Build and start all services
docker compose up -d

# Wait ~30 seconds for all services to be ready
# You'll see:
# ✅ etsy-db       - Running
# ✅ etsy-redis    - Running
# ✅ etsy-api      - Running
# ✅ etsy-worker   - Running
# ✅ etsy-beat     - Running
# ✅ etsy-web      - Running
# ✅ etsy-prometheus - Running
# ✅ etsy-grafana  - Running
```

**Check if everything is running:**
```bash
docker compose ps

# Should show 8 services with "Up" status
```

---

## Step 3: Access the Application (1 minute)

### 🎨 Frontend Dashboard
Open: **http://localhost:3000**

You should see:
- ✅ Dark theme with blue-green gradient
- ✅ Sidebar with navigation
- ✅ Dashboard page
- ✅ Connection status cards
- ✅ Recent orders table

### 🔌 API Documentation
Open: **http://localhost:8080/docs**

You should see:
- ✅ Interactive Swagger UI
- ✅ All API endpoints listed
- ✅ Authentication section
- ✅ Try out any endpoint

### 📊 Monitoring
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

---

## What You Can Do Right Now

### 1. Explore the Dashboard ✅
- Navigate through all menu items
- See the connection status cards
- View the orders table with status badges
- Everything is pre-styled with your blue-green theme!

### 2. Test the API ✅
```bash
# Health check
curl http://localhost:8080/healthz

# Should return:
# {
#   "status": "healthy",
#   "service": "etsy-automation-api",
#   "version": "1.0.0"
# }

# Check metrics
curl http://localhost:8080/metrics
```

### 3. Check Database ✅
```bash
# Open PostgreSQL shell
docker compose exec db psql -U postgres -d etsy_platform

# Inside psql, run:
\dt

# You should see 10 tables:
# - tenants
# - users
# - memberships
# - shops
# - oauth_tokens
# - products
# - ai_generations
# - listing_jobs
# - schedules
# - orders
# - usage_costs
# - audit_logs
# - webhook_events

# Exit with:
\q
```

### 4. Check Redis ✅
```bash
# Open Redis CLI
docker compose exec redis redis-cli

# Test Redis
> PING
# Should return: PONG

> EXIT
```

### 5. View Logs ✅
```bash
# All services
docker compose logs

# Just API
docker compose logs api

# Just Frontend
docker compose logs web

# Just Worker
docker compose logs worker

# Follow logs (live)
docker compose logs -f
```

---

## Troubleshooting

### Problem: Port already in use

**Symptom:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# Check what's using the port
# macOS/Linux:
lsof -i :3000
lsof -i :8080

# Windows:
netstat -ano | findstr :3000
netstat -ano | findstr :8080

# Kill the process or change ports in docker-compose.yml
```

### Problem: Docker out of memory

**Symptom:**
```
Error: Cannot allocate memory
```

**Solution:**
```bash
# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory
# Set to at least 4GB, ideally 6-8GB
```

### Problem: Database connection failed

**Symptom:**
```
psycopg2.OperationalError: could not connect to server
```

**Solution:**
```bash
# Wait for database to fully start
docker compose logs db

# If still issues, restart database
docker compose restart db

# Wait 10 seconds, then restart API
docker compose restart api
```

### Problem: Frontend won't start

**Symptom:**
```
Error: Module not found
```

**Solution:**
```bash
# Rebuild frontend
docker compose build web
docker compose up -d web
```

---

## Useful Commands

### Start/Stop
```bash
docker compose up -d      # Start all services
docker compose down       # Stop all services
docker compose restart    # Restart all services
```

### View Status
```bash
docker compose ps         # List all services
docker compose top        # Show running processes
```

### View Logs
```bash
docker compose logs       # All logs
docker compose logs -f    # Follow logs (live)
docker compose logs api   # Specific service
```

### Database
```bash
# PostgreSQL shell
docker compose exec db psql -U postgres -d etsy_platform

# Run migrations (when needed)
docker compose exec api alembic upgrade head

# Create migration
docker compose exec api alembic revision -m "description"
```

### Clean Up
```bash
# Stop and remove containers
docker compose down

# Remove everything including volumes (⚠️ deletes data)
docker compose down -v

# Remove images too
docker compose down --rmi all
```

---

## Next Steps After Testing

### 1. Configure Environment (Optional)

Add these to `.env` when ready:

```bash
# Etsy API (Phase 1)
ETSY_CLIENT_ID=your_etsy_app_key
ETSY_CLIENT_SECRET=your_etsy_app_secret

```

### 2. Read Documentation

1. **DELIVERY_SUMMARY.md** - What you got
2. **NEXT_STEPS.md** - What to build next
3. **BUILD_GUIDE.md** - Detailed setup
4. **ARCHITECTURE.md** - System design

### 3. Start Development

```bash
# Read Phase 1 implementation guide
cat NEXT_STEPS.md

# Start with authentication
cd apps/api
# Implement JWT token generation
# See: app/core/security.py (create this file)
```

---

## Verification Checklist

Before moving to development, verify:

- [ ] Dashboard loads at http://localhost:3000
- [ ] API docs load at http://localhost:8080/docs
- [ ] `/healthz` returns healthy status
- [ ] Database has 10+ tables
- [ ] Redis responds to PING
- [ ] All 8 Docker services are "Up"
- [ ] No error messages in logs

**If all checked, you're ready! 🎉**

---

## Getting Help

**Issue**: Something not working?
1. Check logs: `docker compose logs`
2. Restart: `docker compose restart`
3. Clean slate: `docker compose down -v && docker compose up -d`

**Question**: How do I...?
1. Check **BUILD_GUIDE.md** for detailed instructions
2. Check **NEXT_STEPS.md** for implementation guidance
3. Check **ARCHITECTURE.md** for system design

---

## Summary

You now have a **fully working development environment** with:
- ✅ Beautiful dashboard UI (your design)
- ✅ Complete API backend (ready for logic)
- ✅ Database with full schema
- ✅ Worker infrastructure
- ✅ Monitoring stack

**Total time**: ~5 minutes  
**What works**: Infrastructure, UI, Database  
**What's next**: Add business logic (JWT, Etsy API, AI)

**Ready to build! 🚀**

---

## Pro Tips

1. **Use the Makefile**
   ```bash
   make start    # Instead of: docker compose up -d
   make logs     # Instead of: docker compose logs
   make health   # Check everything at once
   ```

2. **Keep logs open**
   ```bash
   # In a separate terminal
   make logs -f
   # See everything in real-time
   ```

3. **Quick health check**
   ```bash
   make health
   # Checks API, Frontend, DB, Redis all at once
   ```

4. **IDE Setup**
   - VS Code: Open `etsy-automation-platform` folder
   - Enable TypeScript and Python extensions
   - Auto-formatting will work with included configs

---

**That's it! You're up and running! 🎉**

*Any issues? Check BUILD_GUIDE.md → Troubleshooting section*
