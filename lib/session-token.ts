// Pure token logic: no next/headers, no request context. proxy.ts imports only
// this, so the code running on every request stays small, and it can be
// exercised directly in a test.
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "doodle_session";

const TOKEN_VERSION = "v1";
const SESSION_DAYS = 365;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export interface Session {
  userId: string;
  /** Epoch ms. Infinity when no passcode is configured. */
  expiresAt: number;
}

/**
 * The gate is on only when DOODLE_PASSCODE is set.
 *
 * An unset passcode leaves every route open, which is how the app behaved
 * before this existed and matches how the rest of it degrades: no API key
 * means no AI, no database means localStorage, no passcode means no lock.
 * Set the variable in production or the apps are open to anyone with the URL.
 */
export function isGateEnabled(): boolean {
  return Boolean(process.env.DOODLE_PASSCODE);
}

/**
 * Signing key, derived from the passcode rather than used as one.
 *
 * A short passcode used directly as an HMAC key could be recovered offline
 * from a single captured cookie, so it goes through scrypt first. Derived once
 * per process and cached, because scrypt is deliberately slow.
 */
let cached: { passcode: string; key: Buffer } | null = null;
function signingKey(passcode: string): Buffer {
  if (cached?.passcode !== passcode) {
    cached = {
      passcode,
      key: scryptSync(passcode, "forgetful-doodle/session/v1", 32),
    };
  }
  return cached.key;
}

function mac(payload: string, passcode: string): string {
  return createHmac("sha256", signingKey(passcode))
    .update(payload)
    .digest("base64url");
}

/** Fixed-length compare. Returns false rather than throwing on a mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Warn once per process when production is running with no passcode.
 *
 * An unset passcode is a legitimate default, but a typo in the variable name
 * fails exactly like a deliberate choice: everything open, nothing on screen,
 * no error anywhere. So the state is announced rather than inferred, and any
 * near-miss variable name is named too. Key names only; no values are logged.
 */
const KNOWN_VARS = new Set(["DOODLE_PASSCODE", "DOODLE_USER_ID"]);

function nearMissNames(): string[] {
  return Object.keys(process.env).filter(
    (k) => !KNOWN_VARS.has(k) && (/PASS?C[O0]DE/i.test(k) || /^DOODLE/i.test(k)),
  );
}

if (process.env.NODE_ENV === "production" && !process.env.DOODLE_PASSCODE) {
  const suspects = nearMissNames();
  console.warn(
    "[doodle] DOODLE_PASSCODE is not set. Every page and every /api route is " +
      "open to anyone with the URL, and /api/generate will spend the " +
      "Anthropic credits on this key. Set DOODLE_PASSCODE to lock it, or " +
      "ignore this if open is intended.",
  );
  if (suspects.length > 0) {
    console.warn(
      `[doodle] These variables look close to the expected name, so this may ` +
        `be a typo rather than a choice: ${suspects.join(", ")}`,
    );
  }
}

const PASSCODE_SALT = "forgetful-doodle/passcode/v1";
const MAX_PASSCODE_CHARS = 200;

let cachedExpected: { passcode: string; hash: Buffer } | null = null;

/**
 * Compare a submitted passcode.
 *
 * scrypt runs on every attempt by design. A serverless function has no shared
 * state to count failed attempts in, so making each guess cost real CPU is the
 * only rate limit available; the expected side is cached, the submitted side
 * never is. Both sides end up the same length, so length never leaks either.
 *
 * This raises the cost of online guessing rather than removing it. The passcode
 * still has to be long enough to be worth guarding.
 */
export function verifyPasscode(input: unknown): boolean {
  const expected = process.env.DOODLE_PASSCODE;
  if (
    !expected ||
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > MAX_PASSCODE_CHARS
  ) {
    return false;
  }
  if (cachedExpected?.passcode !== expected) {
    cachedExpected = {
      passcode: expected,
      hash: scryptSync(expected, PASSCODE_SALT, 32),
    };
  }
  return timingSafeEqual(
    scryptSync(input, PASSCODE_SALT, 32),
    cachedExpected.hash,
  );
}

export function mintToken(userId: string): string | null {
  const passcode = process.env.DOODLE_PASSCODE;
  if (!passcode) return null;
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const payload = `${TOKEN_VERSION}.${encodeURIComponent(userId)}.${expiresAt}`;
  return `${payload}.${mac(payload, passcode)}`;
}

/**
 * Verify a token's signature and expiry. Pure, so both proxy.ts and the route
 * handlers can call it, and so it can be tested without a request.
 */
export function readToken(token: string | undefined | null): Session | null {
  const passcode = process.env.DOODLE_PASSCODE;
  if (!passcode || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, rawUserId, rawExpiry, signature] = parts;
  if (version !== TOKEN_VERSION) return null;

  const payload = `${version}.${rawUserId}.${rawExpiry}`;
  if (!safeEqual(signature, mac(payload, passcode))) return null;

  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  try {
    return { userId: decodeURIComponent(rawUserId), expiresAt };
  } catch {
    return null;
  }
}
