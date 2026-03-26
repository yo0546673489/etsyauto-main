# Log check summary (from docker compose logs)

## Web container (`etsy-web`)
- **Status:** Running, started with `next start` (Next.js 14.2.35), "Ready in 4.4s"
- **No errors** in the last 150 lines; no request-level logging (normal for prod mode)
- Static chunk requests (`/_next/static/chunks/...`) **do not** go through middleware (matcher excludes `_next/static`), so they are served directly by Next.js. `ERR_CONNECTION_RESET` on those means the TCP connection was closed while the browser was loading JS (server closed it, or network/proxy reset it).

## API container (`etsy-api`)
- **Repeated 401 Unauthorized** in the logs:
  - `GET /api/auth/me` → **401**
  - `POST /api/auth/refresh` → **401**
- **Meaning:** The app is calling the API (via the Next.js proxy), but the **access token cookie is missing or invalid**, and **refresh also failed** (expired or no refresh cookie). So the **session is effectively expired**; the user needs to log in again.

## Likely sequence
1. You open the owner dashboard; the page HTML loads.
2. The browser requests JS chunks; **some of those connections are reset** → `ERR_CONNECTION_RESET`.
3. In parallel, the app calls `/api/auth/me` (and then refresh); the API returns **401** because cookies are invalid/expired.
4. Result: page can’t load fully (chunks fail) and/or you get logged out (401).

## Recommendations
1. **Restart the web container** to clear any bad connection state and free memory:
   ```bash
   docker compose restart web
   ```
2. **Log in again** – the 401s indicate your session has expired; after restart, open http://localhost:3000/login and sign in.
3. **Optional:** Give the web container more Node memory to reduce risk of OOM closing connections (add to `web` service in docker-compose):
   ```yaml
   environment:
     NODE_OPTIONS: "--max-old-space-size=1024"
   ```
4. **Favicon 404:** Add a `favicon.ico` under `apps/web/app/` or `public/` to remove the 404 (cosmetic only).
