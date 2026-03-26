# Cursor Prompt: Add Etsy Attribution Notice

## Required by Etsy API Terms of Use

The following text must appear prominently on both the login page and
the settings page near the Connect Shop button:

> "The term 'Etsy' is a trademark of Etsy, Inc. This application uses
> the Etsy API but is not endorsed or certified by Etsy, Inc."

---

## Change 1 — Login Page

Find `apps/web/app/login/page.tsx`.

Add this at the bottom of the page, below the login form, before the
closing of the main container:

```tsx
{/* Etsy Attribution Notice - Required by Etsy API Terms */}
<p className="mt-6 text-center text-xs text-[var(--text-muted)] max-w-sm mx-auto leading-relaxed">
  The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application
  uses the Etsy API but is not endorsed or certified by Etsy, Inc.
</p>
```

If there is also a signup/register page, add the same notice there too.

---

## Change 2 — Settings Page

Find `apps/web/app/settings/page.tsx`.

Locate the Etsy connections section — the area with the "Connect Shop"
button. Add the notice **above** the Connect Shop button:

```tsx
{/* Etsy Attribution Notice - Required by Etsy API Terms */}
<p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
  The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application
  uses the Etsy API but is not endorsed or certified by Etsy, Inc.
</p>
```

---

## Do NOT change

- Any backend files
- Any app name or branding
- Any API calls or logic

---

## After changes

```powershell
docker compose build --no-cache web && docker compose up -d web
docker compose logs web -f
```

Wait for `next start`, then verify the notice appears on both pages.
