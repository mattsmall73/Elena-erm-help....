import { NextResponse } from "next/server";
import { getState, saveState, isDbConfigured } from "@/lib/db";
import { validateProfileState } from "@/lib/validate-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// When there's no database (e.g. local dev without POSTGRES_URL), these return
// 503 and the client quietly runs on localStorage instead.

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "no-db" }, { status: 503 });
  }
  try {
    const state = await getState();
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "db-error" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "no-db" }, { status: 503 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  // saveState clears rows before writing the replacements, so a body that
  // cannot be trusted must be turned away before it reaches that. Validation
  // also strips unrecognised fields, which matters because a deck is stored
  // whole in a JSONB column.
  const parsed = validateProfileState(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }

  try {
    await saveState(parsed.state);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db-error" }, { status: 503 });
  }
}
