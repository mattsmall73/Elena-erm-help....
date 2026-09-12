import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { USER_ID } from "./user";
import {
  SESSION_COOKIE,
  type Session,
  isGateEnabled,
  mintToken,
  readToken,
} from "./session-token";

export {
  SESSION_COOKIE,
  isGateEnabled,
  mintToken,
  readToken,
  verifyPasscode,
} from "./session-token";
export type { Session } from "./session-token";

const SESSION_SECONDS = 365 * 24 * 60 * 60;

/** Cookie options. secure is dropped in dev so http://localhost still works. */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

/** Route-handler only: cookies() is writable there and in Server Actions. */
export async function createSession(userId: string): Promise<boolean> {
  const token = mintToken(userId);
  if (!token) return false;
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions());
  return true;
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

/**
 * The real check, run inside the route rather than only in front of it.
 *
 * proxy.ts turns unauthenticated traffic away early, but the Next docs are
 * explicit that it should not be the only line of defence, so every route
 * verifies for itself as well.
 */
export async function verifySession(): Promise<Session | null> {
  if (!isGateEnabled()) {
    return { userId: USER_ID, expiresAt: Infinity };
  }
  const store = await cookies();
  return readToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Wrap a route handler so it cannot be reached without a session.
 *
 * One line per route, and the session arrives as an argument, so a new route
 * either has the wrapper or visibly does not:
 *
 *   export const GET = withSession(async (req, ctx, session) => { ... });
 *
 * Context is passed straight through, so a dynamic route keeps its params
 * (which are a promise in Next 16):
 *
 *   export const GET = withSession<{ params: Promise<{ id: string }> }>(
 *     async (req, { params }, session) => { const { id } = await params; ... },
 *   );
 */
export function withSession<C = unknown>(
  handler: (req: NextRequest, ctx: C, session: Session) => Promise<Response>,
): (req: NextRequest, ctx: C) => Promise<Response> {
  return async (req: NextRequest, ctx: C) => {
    const session = await verifySession();
    if (!session) {
      // lib/safe-json.ts surfaces the `error` field to the reader, so the
      // human sentence goes there and the machine code alongside it.
      return Response.json(
        { error: "Enter the passcode to continue.", code: "locked" },
        { status: 401 },
      );
    }
    return handler(req, ctx, session);
  };
}
