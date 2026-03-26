import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Global middleware placeholder. Auth is handled client-side; this matcher
 * excludes public routes so future session checks won't block them.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Exclude:
     * - Next internals and favicon
     * - /messaging/activate (public activation landing)
     * - /api (proxied to backend)
     */
    '/((?!_next/static|_next/image|favicon.ico|messaging/activate|api).*)',
  ],
};
