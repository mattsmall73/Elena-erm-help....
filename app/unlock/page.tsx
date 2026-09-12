import { UnlockForm } from "@/components/UnlockForm";

/**
 * Where a request lands once the passcode is in.
 *
 * Only a path on this origin is allowed through. A value starting "//" would
 * be read as protocol-relative and send her off-site, so it is refused along
 * with anything that is not an absolute path.
 */
function safeNext(raw: string | string[] | undefined): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
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
