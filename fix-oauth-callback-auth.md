# Cursor Prompt: Fix Etsy OAuth Callback — Remove Auth Requirement

## Root Cause

`POST /api/shops/etsy/callback` has `Depends(require_permission(...))` which
requires an authenticated user. But when a connection link is used, the person
opening the link has no session cookie — they're connecting from a fresh
browser. This causes a 401 and redirects to the login page.

The tenant/user context is already stored in Redis during the `/start` step:
```python
redis_client.setex(f"etsy_oauth_state:{state}", 600, json.dumps({
    "code_verifier": ...,
    "user_id": ...,
    "tenant_id": ...,
    "shop_name": ...,
    "from_connect_link": True,
}))
```

So the callback endpoint already has everything it needs from Redis via the
`state` parameter. It should NOT require a logged-in user.

---

## Fix — `apps/api/app/api/endpoints/shops.py`

### Change the callback endpoint signature

Find:
```python
@router.post("/etsy/callback", tags=["Shops"])
async def etsy_oauth_callback(
    request: OAuthCallbackRequest,
    context: UserContext = Depends(require_permission(Permission.CONNECT_SHOP)),
    db: Session = Depends(get_db)
):
```

Replace with:
```python
@router.post("/etsy/callback", tags=["Shops"])
async def etsy_oauth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db),
    context: Optional[UserContext] = Depends(get_optional_user_context),
):
```

### Add `get_optional_user_context` dependency

In `apps/api/app/api/dependencies.py`, add a new dependency function that
returns the user context if authenticated, or None if not:

```python
async def get_optional_user_context(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[UserContext]:
    """Returns user context if authenticated, None otherwise. Does not raise."""
    try:
        return await get_user_context(request, db)
    except HTTPException:
        return None
```

Add `Optional` to the imports at the top of the file:
```python
from typing import Optional
```

### Update the callback function body

Inside `etsy_oauth_callback`, find where it uses `context` to get tenant/user
info and replace it with logic that:

1. First looks up the state from Redis to get `tenant_id`, `user_id`,
   `from_connect_link`
2. Falls back to `context` if available (for the old direct OAuth flow)
3. Raises a clear error if neither is available

The function should look like this:

```python
@router.post("/etsy/callback", tags=["Shops"])
async def etsy_oauth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db),
    context: Optional[UserContext] = Depends(get_optional_user_context),
):
    """
    Step 2: Handle OAuth callback from Etsy.
    Works both for authenticated users (direct connect) and
    unauthenticated users (connection link flow).
    """
    # Look up PKCE state from Redis
    state_key = f"etsy_oauth_state:{request.state}"
    state_data_raw = redis_client.get(state_key)

    if not state_data_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth session expired or invalid. Please generate a new connection link.",
        )

    state_data = json.loads(state_data_raw)
    redis_client.delete(state_key)  # consume it — one time use

    code_verifier = state_data.get("code_verifier")
    tenant_id = state_data.get("tenant_id")
    user_id = state_data.get("user_id")
    shop_name = state_data.get("shop_name")
    from_connect_link = state_data.get("from_connect_link", False)

    # If not from connect link, require authenticated context
    if not from_connect_link:
        if not context:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
            )
        tenant_id = context.tenant_id
        user_id = context.user_id

    if not tenant_id or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing tenant or user context in OAuth state.",
        )

    # Exchange code for tokens
    try:
        token_data = await etsy_oauth.exchange_code(
            code=request.code,
            code_verifier=code_verifier,
        )
    except Exception as e:
        logger.error(f"Etsy token exchange failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange authorization code: {str(e)}",
        )

    # ... rest of the existing function body that saves the shop/token ...
    # Keep everything after token exchange exactly as it is, just make sure
    # it uses the local `tenant_id` and `user_id` variables instead of
    # `context.tenant_id` and `context.user_id`
```

### Replace all `context.tenant_id` and `context.user_id` in callback body

After the changes above, scan the rest of `etsy_oauth_callback` and replace:
- `context.tenant_id` → `tenant_id`
- `context.user_id` → `user_id`

---

## Also fix: double validate call in frontend

In `apps/web/app/oauth/etsy/callback/page.tsx`, the component calls
`shopsApi.connectEtsy(code, state)` which hits the callback. That's correct.

But in `apps/web/app/oauth/etsy/start/page.tsx`, after returning from Etsy,
the page should NOT re-validate the link token. The start page's only job
is to validate → start → redirect to Etsy. Once the user returns from Etsy,
they land on the callback page, not the start page. The start page does not
need any changes.

---

## After changes

```powershell
docker compose restart api
```

No frontend rebuild needed.

Then test:
1. Generate a fresh connection link
2. Open it in a new incognito window (simulates unauthenticated user)
3. Should validate → redirect to Etsy → return to callback → connect shop
4. Should redirect to `/settings?etsy=connected`
