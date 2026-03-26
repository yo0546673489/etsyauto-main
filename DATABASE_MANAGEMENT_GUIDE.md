# Database Management Guide

## Accessing Adminer (Web-Based Database Manager)

Adminer is a lightweight database management tool (similar to phpMyAdmin/XAMPP's database manager).

### Local Development Access

**URL:** http://localhost:8081

**Login Credentials:**
- **System:** PostgreSQL
- **Server:** `db`
- **Username:** `postgres`
- **Password:** `postgres_secure_password_change_me` (default) or check your `.env` file for `DB_PASSWORD`
- **Database:** `etsy_platform`

**Note:** If the password doesn't work, check the actual password by running:
```bash
docker compose exec db printenv POSTGRES_PASSWORD
```

### What You Can Do in Adminer

1. **View All Users**
   - Click on `users` table
   - See all registered users, their emails, names, and OAuth providers

2. **Delete Users**
   - Select the `users` table
   - Check the box next to users you want to delete
   - Click "Delete" at the bottom
   - **Note:** You should also delete related records in:
     - `memberships` table (user's organization membership)
     - `oauth_providers` table (if they signed in with Google/Facebook)

3. **View Organizations (Tenants)**
   - Click on `tenants` table
   - See all organizations/shops created

4. **Execute Custom SQL**
   - Click "SQL command" in the left menu
   - Run custom queries

---

## Common Database Operations

### Delete a User and All Related Data

```sql
-- Replace 'user@example.com' with the actual email
-- Step 1: Find the user ID
SELECT id, email, name FROM users WHERE email = 'user@example.com';

-- Step 2: Delete related data (replace USER_ID with actual ID)
DELETE FROM memberships WHERE user_id = USER_ID;
DELETE FROM oauth_providers WHERE user_id = USER_ID;

-- Step 3: Delete the user
DELETE FROM users WHERE id = USER_ID;
```

### Delete All Users (Clear Database)

**⚠️ WARNING: This will delete ALL users and organizations!**

```sql
-- Delete all data
DELETE FROM memberships;
DELETE FROM oauth_providers;
DELETE FROM shops;
DELETE FROM products;
DELETE FROM users;
DELETE FROM tenants;

-- Reset auto-increment counters (optional)
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE tenants_id_seq RESTART WITH 1;
ALTER SEQUENCE memberships_id_seq RESTART WITH 1;
```

### View Users with Their Organizations

```sql
SELECT 
    u.id,
    u.email,
    u.name,
    u.email_verified,
    t.name as organization,
    m.role
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
LEFT JOIN tenants t ON m.tenant_id = t.id
ORDER BY u.id;
```

### Find Users Who Signed In with Google

```sql
SELECT 
    u.id,
    u.email,
    u.name,
    op.provider,
    op.picture
FROM users u
JOIN oauth_providers op ON u.id = op.user_id
WHERE op.provider = 'google';
```

---

## Using Docker CLI for Database Access

### Access PostgreSQL CLI

```bash
docker compose exec db psql -U postgres -d etsy_platform
```

### Common psql Commands

```bash
\dt                    # List all tables
\d users              # Describe users table structure
\d+ users             # Detailed table info
\q                    # Quit psql
```

### Delete User via CLI

```bash
# Interactive psql
docker compose exec db psql -U postgres -d etsy_platform

# Then run SQL commands:
DELETE FROM memberships WHERE user_id = 11;
DELETE FROM oauth_providers WHERE user_id = 11;
DELETE FROM users WHERE id = 11;
\q
```

---

## Troubleshooting

### User Created via Google OAuth Can't Log In with Password

**Problem:** User signed up with Google, then tries to log in with email/password.

**Solution:** 
- The account has no password set
- User should either:
  1. Continue using "Sign in with Google" button, OR
  2. Use "Forgot Password" to set a password for email/password login

**Error Message Displayed:**
> "This account was created using Google sign-in. Please use the 'Google Sign-In' button to log in, or set a password using 'Forgot Password' to enable email/password login."

### User Has No Organization Membership

**Problem:** User exists but has no tenant/organization.

**Solution:**
```sql
-- Create a tenant for the user
INSERT INTO tenants (name, billing_tier, status, created_at, updated_at) 
VALUES ('User Shop', 'starter', 'active', NOW(), NOW()) 
RETURNING id;

-- Link user to tenant (replace USER_ID and TENANT_ID)
INSERT INTO memberships (user_id, tenant_id, role, invitation_status, accepted_at) 
VALUES (USER_ID, TENANT_ID, 'owner', 'accepted', NOW());
```

---

## Security Notes

1. **Adminer Access:**
   - Currently exposed on `127.0.0.1:8081` (localhost only)
   - Not accessible from outside your machine
   - For production, restrict further or disable

2. **Database Credentials:**
   - Never commit `.env` file to git
   - Use strong passwords in production
   - Current default password is `postgres` (change for production!)

3. **Backup Before Deleting:**
   ```bash
   # Backup database
   docker compose exec db pg_dump -U postgres etsy_platform > backup.sql
   
   # Restore database
   cat backup.sql | docker compose exec -T db psql -U postgres -d etsy_platform
   ```

---

## Quick Reference

| Task | Tool | URL/Command |
|------|------|-------------|
| Browse database | Adminer | http://localhost:8081 |
| SQL commands | Adminer | SQL command menu |
| CLI access | Docker | `docker compose exec db psql -U postgres -d etsy_platform` |
| View logs | Docker | `docker compose logs db` |
| Restart database | Docker | `docker compose restart db` |


