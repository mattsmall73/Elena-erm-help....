import { UnlockForm } from "@/components/UnlockForm";

/**
 * Where a request lands once the passcode is in.
 *
 * Checked by resolving rather than by blocklist. Refusing "//" and absolute
 * URLs is not enough: browsers normalise a backslash to a forward slash, so
 * "/\\evil.com" becomes protocol-relative and leaves the origin. Resolving the
 * value against a throwaway origin and requiring it to still be there catches
 * that and whatever else normalisation does, rather than the cases thought of
 * in advance.
 */
const PROBE_ORIGIN = "https://unlock.invalid";

function safeNext(raw: string | string[] | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    return "/";
  }
  if (!raw.startsWith("/")) return "/";
  try {
    const resolved = new URL(raw, PROBE_ORIGIN);
    if (resolved.origin !== PROBE_ORIGIN) return "/";
    // Rebuild from the parsed parts so only a path and query survive, then
    // check the result itself. Resolving "/..//evil.com" keeps the probe origin
    // but yields the pathname "//evil.com", which is protocol-relative all over
    // again, so the value handed back is what has to be verified.
    const path = `${resolved.pathname}${resolved.search}`;
    if (!path.startsWith("/") || path.startsWith("//")) return "/";
    return path;
  } catch {
    return "/";
  }
}

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-5">
      <UnlockForm next={safeNext(next)} />
    </main>
  );
}
