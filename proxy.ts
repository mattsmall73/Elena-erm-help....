import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isGateEnabled, readToken } from "@/lib/session-token";

// Reachable without a passcode: the unlock screen, and the route that checks it.
const OPEN_PATHS = ["/unlock", "/api/unlock"];

function isOpen(pathname: string): boolean {
  return OPEN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * One gate in front of everything, so a route added later is covered by
 * default rather than by remembering to cover it.
 *
 * This reads the cookie and nothing else. Proxy runs on every request,
 * prefetches included, and the Next docs are explicit that it should not be
 * the only line of defence, so each route also calls verifySession by way of
 * withSession. This is the early turn-away; that is the real check.
 */
export function proxy(request: NextRequest) {
  if (!isGateEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isOpen(pathname)) return NextResponse.next();

  if (readToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // An API caller wants a status code, not a login page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Enter the passcode to continue.", code: "locked" },
      { status: 401 },
    );
  }

  const unlock = new URL("/unlock", request.nextUrl);
  if (pathname !== "/") unlock.searchParams.set("next", pathname);
  return NextResponse.redirect(unlock);
}

export const config = {
  // Everything except static assets. Without the exclusions the redirect would
  // catch the unlock page's own CSS and fonts and render it unstyled.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
