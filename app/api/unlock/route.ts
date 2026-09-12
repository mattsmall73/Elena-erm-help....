import { NextResponse } from "next/server";
import { createSession, isGateEnabled, verifyPasscode } from "@/lib/session";
import { USER_ID } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Nothing to unlock when no passcode is configured.
  if (!isGateEnabled()) {
    return NextResponse.json({ ok: true, locked: false });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that." }, { status: 400 });
  }

  const passcode =
    typeof body === "object" && body !== null
      ? (body as { passcode?: unknown }).passcode
      : undefined;

  if (!verifyPasscode(passcode)) {
    return NextResponse.json(
      { error: "That passcode doesn't match. Try again." },
      { status: 401 },
    );
  }

  await createSession(USER_ID);
  return NextResponse.json({ ok: true });
}
