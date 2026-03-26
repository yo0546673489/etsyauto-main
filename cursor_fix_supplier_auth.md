# Cursor Prompt 1 — Fix Supplier Invitation Auth Flow

## Context
EtsyAuto platform. Stack: FastAPI backend, Next.js frontend, HttpOnly cookie-based auth.
This prompt fixes 5 bugs in the supplier invitation acceptance flow.

---

## Bug 1 — `accept_invitation` doesn't set HttpOnly cookies (CRITICAL)

**File:** `apps/api/app/api/endpoints/team.py`

In the `accept_invitation` endpoint, after creating `jwt_token`, replace the current
`return JSONResponse(...)` with the same pattern used in the login endpoint:

1. Create both an access token AND a refresh token
2. Call `set_auth_cookies(response, access_token, refresh_token)` 
3. Return a `Response` object with cookies set, not a plain `JSONResponse`

The final return should mirror the login endpoint exactly. Remove the `"token": jwt_token`
field from the JSON body — the token should only live in the HttpOnly cookie.

---

## Bug 2 — Frontend stores token in localStorage (dead code)

**File:** `apps/web/app/accept-invitation/page.tsx` (or similar path)

Remove this line entirely:
```javascript
localStorage.setItem('token', data.token);
```

After successful invitation acceptance, redirect immediately to `/dashboard` instead of
waiting 2 seconds — cookies will already be set by the backend.

---

## Bug 3 — Google OAuth redirect URI mismatch

**File:** `apps/api/app/core/config.py`

Change:
```python
GOOGLE_REDIRECT_URI: str = "http://localhost:3000/api/auth/callback/google"
```
To point to the actual backend callback route:
```python
GOOGLE_REDIRECT_URI: str = "http://localhost:3000/api/oauth/google/callback"
```

---

## Bug 4 — Manual CORS headers conflict with global middleware

**File:** `apps/api/app/api/endpoints/team.py`

In `accept_invitation`, remove the `headers=CORS_HEADERS` argument from any
`JSONResponse` or `Response` calls. Let the global `CustomCORSMiddleware` handle CORS.

---

## Bug 5 — Login redirects to `/dashboard` not role-specific path

**File:** `apps/web/lib/auth-context.tsx` (or wherever the login function is)

Find the line:
```javascript
router.push('/dashboard');
```
Replace with:
```javascript
router.push(getRoleDashboardPath(user.role));
```

This eliminates the double redirect for supplier users.
