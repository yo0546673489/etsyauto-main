# Cursor Prompt: Refactor Etsy OAuth to Use /oauth/etsy/callback

## Background

The app has a custom-built OAuth flow (NOT NextAuth). The callback page
currently lives at `apps/web/app/oauth/etsy/callback/page.tsx` which is
correct. However `.env` was changed to point to the wrong path. This
refactor restores the correct path and cleans everything up consistently.

---

## Step 1 — Revert `.env`

Change:
```
ETSY_REDIRECT_URI=http://localhost:3000/api/auth/callback/etsy
```

Back to:
```
ETSY_REDIRECT_URI=http://localhost:3000/oauth/etsy/callback
```

---

## Step 2 — Delete the wrongly created callback page (if it exists)

If the file `apps/web/app/api/auth/callback/etsy/page.tsx` was created,
delete it along with its parent directories if they are now empty:
- `apps/web/app/api/auth/callback/etsy/`
- `apps/web/app/api/auth/callback/` (if empty)
- `apps/web/app/api/auth/` (if empty)
- `apps/web/app/api/` (if empty — only if it has no other contents)

---

## Step 3 — Ensure callback page is at the correct path

Make sure this file exists and is correct:
`apps/web/app/oauth/etsy/callback/page.tsx`

It should contain exactly:

```typescript
'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { shopsApi } from '@/lib/api';

function EtsyOAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError('Missing authorization code or state from Etsy.');
      return;
    }

    const connect = async () => {
      try {
        await shopsApi.connectEtsy(code, state);
        router.replace('/settings?etsy=connected');
      } catch (err: any) {
        const detail = err?.detail || 'Failed to connect Etsy shop.';
        setError(detail);
      }
    };

    connect();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
      <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Connecting Etsy…</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          We are finalizing your Etsy connection. You will be redirected shortly.
        </p>
        {error && (
          <div className="mt-4 text-sm text-[var(--danger)] bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EtsyOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
          <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 text-center">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Loading…</h1>
          </div>
        </div>
      }
    >
      <EtsyOAuthCallbackContent />
    </Suspense>
  );
}
```

---

## Step 4 — Verify backend config matches

In `apps/api/app/core/config.py`, confirm the default is:
```python
ETSY_REDIRECT_URI: str = "http://localhost:3000/oauth/etsy/callback"
```

If it still shows `http://localhost:3000/api/auth/callback/etsy`, update
it to `http://localhost:3000/oauth/etsy/callback`.

---

## Step 5 — Restart API to pick up env change

```powershell
docker compose restart api
```

No web rebuild needed — the callback page already exists at the correct
path and the production bundle already includes it.

---

## After this is done

Update the Etsy Developer Portal callback URL:
1. Go to https://www.etsy.com/developers/your-apps
2. Edit your app
3. Set callback URL to: `http://localhost:3000/oauth/etsy/callback`
4. Save

The full OAuth flow will then be:
```
[Generate link] → /oauth/etsy/start?link_token=xxx
     ↓
[Backend validates + marks used] → returns authorization_url
     ↓
[Redirect to Etsy] → user logs in + grants access
     ↓
[Etsy redirects back] → /oauth/etsy/callback?code=xxx&state=xxx
     ↓
[Callback page] → calls shopsApi.connectEtsy(code, state)
     ↓
[Success] → /settings?etsy=connected
```

## Do NOT change
- `apps/web/app/oauth/etsy/start/page.tsx`
- Any other backend files
- Any other frontend pages
