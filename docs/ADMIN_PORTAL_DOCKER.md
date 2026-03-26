# Super-admin portal (Docker)

The admin app runs as the `admin` service (`etsy-admin`) on **port 3002**. It does **not** need `NEXT_PUBLIC_*` vars; API calls go through Next.js rewrites to `http://api:8080`.

## 1. Configure `.env` (repo root)

Set a long secret (same value is both env and login password):

```env
ADMIN_PORTAL_SECRET=your_secret_at_least_16_characters
```

The `api` service passes this into the container as `ADMIN_PORTAL_SECRET` (see `docker-compose.yml`).

## 2. Build and run

```bash
docker compose up -d --build db redis api admin
```

Open **http://localhost:3002**, sign in with the password equal to `ADMIN_PORTAL_SECRET`.

## 3. Database column (existing DBs only)

If `tenants` was created before `messaging_access` existed, run once against Postgres:

```bash
docker compose exec -T db psql -U postgres -d etsy_platform -f - < apps/api/scripts/add_tenant_messaging_access.sql
```

(On Windows PowerShell you can paste the SQL from `apps/api/scripts/add_tenant_messaging_access.sql` into Adminer or `psql` instead.)

## 4. Troubleshooting

| Issue | Check |
|--------|--------|
| Login fails / 503 | `ADMIN_PORTAL_SECRET` set and ≥16 chars in `.env`; restart `api` |
| API errors from admin UI | `api` healthy: `curl http://localhost:8080/healthz` |
| Rewrites fail | Admin image built with `API_INTERNAL_URL=http://api:8080` (default in `apps/admin/Dockerfile`) |

## 5. Production (`docker-compose.prod.yml`)

If you add an `admin` service there, keep `API_INTERNAL_URL=http://api:8080` and expose or reverse-proxy port **3002** (or add an Nginx `location` for the admin app).
