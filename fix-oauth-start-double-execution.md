# Cursor Prompt: Fix OAuth Start Page Double Execution

## Problem

`apps/web/app/oauth/etsy/start/page.tsx` calls `startOAuth()` twice due to
React StrictMode double-invoking useEffect in development, OR due to
component re-renders in production. This causes:

1. First call: validate ✅ → start ✅ → link marked as used → redirect to Etsy
2. Second call: validate ❌ → "link already been used" error shown briefly
3. When Etsy redirects back, Redis state may already be consumed → 
   "OAuth session expired" error on callback

## Fix — `apps/web/app/oauth/etsy/start/page.tsx`

Replace the entire file with:

```typescript
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, Suspense } from 'react'
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react'

function ConnectLinkHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const linkToken = searchParams.get('link_token')
  const [status, setStatus] = useState<'validating' | 'redirecting' | 'error'>('validating')
  const [errorMsg, setErrorMsg] = useState('')
  
  // Guard against double execution (React StrictMode / re-renders)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (!linkToken) {
      setStatus('error')
      setErrorMsg('No connection link token provided.')
      return
    }

    // Prevent double execution
    if (hasStarted.current) return
    hasStarted.current = true

    const startOAuth = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''

        // Validate first
        const validateRes = await fetch(
          `${baseUrl}/api/shops/connect-link/${linkToken}/validate`
        )
        if (!validateRes.ok) {
          const data = await validateRes.json()
          throw new Error(data.detail || 'Invalid or expired link.')
        }

        // Start OAuth — marks link as used and returns authorization_url
        setStatus('redirecting')
        const startRes = await fetch(
          `${baseUrl}/api/shops/connect-link/${linkToken}/start`,
          { method: 'POST' }
        )
        if (!startRes.ok) {
          const data = await startRes.json()
          throw new Error(data.detail || 'Failed to start connection.')
        }

        const { authorization_url } = await startRes.json()
        
        // Hard redirect to Etsy — no router.push (avoids re-render)
        window.location.replace(authorization_url)
      } catch (err: unknown) {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      }
    }

    startOAuth()
  }, [linkToken]) // Remove router from deps — not needed

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="max-w-md w-full mx-4 p-8 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl text-center">
        {status === 'validating' && (
          <>
            <Loader2 className="w-12 h-12 text-[var(--warning)] animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Validating Connection Link
            </h1>
            <p className="text-[var(--text-muted)] text-sm">
              Please wait while we verify your link...
            </p>
          </>
        )}
        {status === 'redirecting' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Redirecting to Etsy
            </h1>
            <p className="text-[var(--text-muted)] text-sm">
              You will be redirected to Etsy to approve the connection...
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Connection Failed
            </h1>
            <p className="text-red-400 text-sm mb-4">{errorMsg}</p>
            <button
              onClick={() => router.push('/settings?tab=shops')}
              className="px-4 py-2 bg-[var(--warning)] text-white rounded-lg hover:opacity-90 text-sm"
            >
              Go to Settings
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function OAuthStartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
          <Loader2 className="w-12 h-12 animate-spin text-[var(--warning)]" />
        </div>
      }
    >
      <ConnectLinkHandler />
    </Suspense>
  )
}
```

## Key changes

1. **`hasStarted` ref** — prevents `startOAuth` from running more than once
   regardless of StrictMode or re-renders
2. **`window.location.replace`** instead of `window.location.href` — cleaner
   redirect that doesn't add to browser history
3. **Removed `router` from useEffect deps** — it was causing unnecessary
   re-runs

## After changes

```powershell
docker compose build --no-cache web && docker compose up -d web
docker compose logs web -f
```

Wait for `next start`. Then test with a fresh connection link — the flow
should go directly to Etsy's grant access page with no intermediate errors.
