#!/bin/sh
# Runtime env var injection for NEXT_PUBLIC_* variables
# Replaces build-time placeholders with actual runtime values
# This avoids Docker cache issues where baked-in values become stale

set -e

PLACEHOLDER="__NEXT_PUBLIC_MESSAGES_API_URL__"
ACTUAL="${NEXT_PUBLIC_MESSAGES_API_URL:-}"

if [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$PLACEHOLDER" ]; then
  echo "[entrypoint] Injecting NEXT_PUBLIC_MESSAGES_API_URL = $ACTUAL"
  find /app/.next -type f \( -name "*.js" -o -name "*.html" \) | \
    xargs grep -l "$PLACEHOLDER" 2>/dev/null | \
    while read f; do
      sed -i "s|$PLACEHOLDER|$ACTUAL|g" "$f"
    done
else
  echo "[entrypoint] NEXT_PUBLIC_MESSAGES_API_URL not set or already injected, skipping"
fi

exec node /app/.next/standalone/server.js
