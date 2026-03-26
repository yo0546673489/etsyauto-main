# Troubleshooting Guide

## Issue: Dashboard Not Showing

If you see a blank dashboard or get redirected to login, follow these steps:

### Step 1: Check if services are running

```bash
# Check if containers are running
docker ps

# You should see these containers:
# - etsy-automation-platform-api-1
# - etsy-automation-platform-web-1
# - etsy-automation-platform-db-1
# - etsy-automation-platform-redis-1
```

### Step 2: Check API health

```bash
# Test the API
curl http://localhost:8080/healthz

# Expected response:
# {"status":"healthy","service":"etsy-automation-api","version":"1.0.0","environment":"development"}
```

### Step 3: Check browser console

1. Open your browser DevTools (F12)
2. Go to the Console tab
3. Look for these logs:
   - `🔍 Loading user...` - Auth context is trying to load user
   - `✅ User loaded:` - Successfully loaded user (you should be logged in)
   - `❌ Failed to load user:` - Failed to load user (check the error)

### Step 4: Check Network tab

1. Open DevTools → Network tab
2. Refresh the page
3. Look for API calls to `http://localhost:8080/api/auth/me`
4. Check the response:
   - **Status 200**: User is authenticated
   - **Status 401**: Not authenticated (token missing/invalid)
   - **Status 500**: Server error
   - **Failed**: API not running or CORS issue

### Step 5: Check localStorage

1. Open DevTools → Application tab → Local Storage → `http://localhost:3000`
2. Look for `auth_token`
3. If missing: You need to login/register
4. If present: Check if the token is valid

### Step 6: Test manual API call

```bash
# Register a test user
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "tenant_name": "Test Shop"
  }'

# You should get a response with an access_token
```

### Step 7: Check API logs

```bash
# View API logs
docker compose logs -f api

# Look for errors like:
# - JWT key files not found
# - Database connection errors
# - CORS errors
```

### Step 8: Check database

```bash
# Connect to database
docker compose exec db psql -U postgres -d etsy_platform

# Check if tables exist
\dt

# Check if there are users
SELECT id, email, name FROM users;

# Exit
\q
```

## Common Issues

### 1. JWT Keys Not Found

**Symptom:** API logs show "Warning: JWT key files not found"

**Solution:**
```bash
cd apps/api
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
docker compose restart api
```

### 2. CORS Error

**Symptom:** Browser console shows CORS policy error

**Solution:** Check that `.env` has correct CORS_ORIGINS or restart API:
```bash
docker compose restart api
```

### 3. Database Not Created

**Symptom:** API logs show database connection errors

**Solution:**
```bash
# Recreate database
docker compose down -v
docker compose up -d db
# Wait 5 seconds for postgres to start
docker compose up -d api web
```

### 4. Port Already in Use

**Symptom:** "Address already in use" error

**Solution:**
```bash
# On Windows
netstat -ano | findstr :3000
netstat -ano | findstr :8080

# Kill the process using the port
taskkill /PID <PID> /F

# On Mac/Linux
lsof -ti:3000 | xargs kill -9
lsof -ti:8080 | xargs kill -9
```

### 5. Frontend Build Error

**Symptom:** Next.js compilation errors

**Solution:**
```bash
cd apps/web
rm -rf .next node_modules
npm install
docker compose restart web
```

## Quick Reset

If all else fails, perform a complete reset:

```bash
# Stop everything
docker compose down -v

# Remove node_modules
cd apps/web && rm -rf .next node_modules && cd ../..

# Restart
docker compose up -d

# Check logs
docker compose logs -f
```

## Still Having Issues?

1. Check Docker is running: `docker --version`
2. Check Docker Compose is running: `docker compose version`
3. Ensure `.env` file exists in root directory
4. Ensure JWT keys exist in `apps/api/` directory
5. Try accessing API docs directly: http://localhost:8080/docs

## Expected Behavior

1. Visit http://localhost:3000
2. You should be redirected to http://localhost:3000/login
3. Click "Sign up for free"
4. Fill in the registration form
5. After registration, you should be redirected to http://localhost:3000/ (dashboard)
6. You should see:
   - Sidebar on the left
   - TopBar at the top with your name
   - Dashboard content (Welcome message, Connection Status, Recent Orders)

## Debug Mode

Enable additional logging by checking the browser console. You should see:
- `🔍 Loading user...` on every page load
- `✅ User loaded:` followed by user object if logged in
- `❌ Failed to load user:` followed by error if not logged in
