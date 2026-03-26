# Cursor Prompt: Fix OAuth Connection Success Flow

## Two problems to fix

### Problem 1 — Settings page ignores `?etsy=connected` query param
The callback redirects to `/settings?etsy=connected` but the settings page
never reads this param, so no success message is shown.

### Problem 2 — Callback page has no auth session
The person who opened the connection link is unauthenticated. After the
callback succeeds, `router.replace('/settings?etsy=connected')` fails
because DashboardLayout redirects unauthenticated users to `/login`.

The fix: redirect to a standalone success page that requires NO auth,
then let the user navigate to settings themselves.

---

## Fix 1 — Create a standalone success page

Create `apps/web/app/oauth/etsy/success/page.tsx`:

```typescript
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const shopName = searchParams.get('shop') || 'Your shop';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
      <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-8 text-center">
        <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Shop Connected!
        </h1>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          <span className="font-semibold text-[var(--text-primary)]">{shopName}</span> has
          been successfully connected to Etsy Auto. You can now close this window or
          go back to your dashboard.
        </p>
        <a
          href="/dashboard"
          className="inline-block px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

export default function OAuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]" />
    }>
      <SuccessContent />
    </Suspense>
  );
}
```

This page requires NO authentication — it's a public standalone page.

---

## Fix 2 — Update callback page to redirect to success page

In `apps/web/app/oauth/etsy/callback/page.tsx`, find:

```typescript
await shopsApi.connectEtsy(code, state);
router.replace('/settings?etsy=connected');
```

Replace with:

```typescript
const result = await shopsApi.connectEtsy(code, state);
const shopName = result?.shop?.display_name || result?.display_name || '';
const params = shopName ? `?shop=${encodeURIComponent(shopName)}` : '';
router.replace(`/oauth/etsy/success${params}`);
```

---

## Fix 3 — Add success toast to settings page

In `apps/web/app/settings/page.tsx`, find where the component reads
search params (look for `useSearchParams`) or add it if not present.

Add this `useEffect` near the top of the `SettingsPageContent` component,
after the existing state declarations:

```typescript
const searchParams = useSearchParams();

useEffect(() => {
  if (searchParams.get('etsy') === 'connected') {
    setNotification({
      show: true,
      type: 'success',
      title: t('settings.shopConnected') || 'Shop Connected',
      message: t('settings.shopConnectedMsg') || 'Your Etsy shop has been successfully connected.',
    });
    // Clean the URL without reloading
    window.history.replaceState({}, '', '/settings?tab=shops');
  }
}, [searchParams]);
```

Also add `useSearchParams` to the imports from `next/navigation` if not
already imported.

---

## Fix 4 — Make success and callback pages bypass DashboardLayout auth check

Check if `apps/web/app/oauth/etsy/` pages are wrapped by the DashboardLayout.
If they are, add a layout.tsx in `apps/web/app/oauth/` that renders children
directly without any auth check:

Create `apps/web/app/oauth/layout.tsx`:

```typescript
export default function OAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

This ensures all `/oauth/*` pages are public and bypass the dashboard
auth requirement.

---

## After changes

```powershell
docker compose build --no-cache web
docker compose up -d web
```

Then test:
1. Generate new connection link
2. Open in incognito
3. Connect on Etsy
4. Should land on `/oauth/etsy/success` with shop name and "Go to Dashboard" button
5. When logged-in user visits `/settings?etsy=connected` they see success toast
