# Cursor Prompt: Move Etsy OAuth Callback Page to Correct Path

## Problem

The Etsy Developer Portal has `http://localhost:3000/api/auth/callback/etsy`
registered as the callback URL. But the actual Next.js page handling the
callback lives at `apps/web/app/oauth/etsy/callback/page.tsx`, which serves
`/oauth/etsy/callback`.

When Etsy redirects back after authorization, it goes to
`/api/auth/callback/etsy` — but there's no page there, causing the
connection to fail.

## Fix

### Step 1 — Create the correct directory and page

Create a new file at:
`apps/web/app/api/auth/callback/etsy/page.tsx`

With this exact content (copied from the existing callback page):

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

### Step 2 — Delete the old callback page

Delete the file at:
`apps/web/app/oauth/etsy/callback/page.tsx`

And delete the now-empty directory:
`apps/web/app/oauth/etsy/callback/`

Keep `apps/web/app/oauth/etsy/start/page.tsx` — that page is still needed
and its URL (`/oauth/etsy/start`) does not need to match Etsy's portal.

### Step 3 — Rebuild the web container

Since the web container runs in production mode, run:

```powershell
docker compose build --no-cache web
docker compose up -d web
docker compose logs web --tail=5
```

Wait for `✓ Ready`.

---

## After the fix

The OAuth flow will be:
1. User opens connection link → `/oauth/etsy/start?link_token=xxx`
2. Start page validates token → calls backend → gets `authorization_url`
3. Redirects to Etsy for login + approval
4. Etsy redirects back to `http://localhost:3000/api/auth/callback/etsy?code=xxx&state=xxx`
5. New callback page at `/api/auth/callback/etsy` handles it → calls `shopsApi.connectEtsy`
6. On success → redirects to `/settings?etsy=connected`

## Do NOT change

- `apps/web/app/oauth/etsy/start/page.tsx`
- `apps/web/lib/api.ts`
- Any backend files
- `.env` (already updated separately)
