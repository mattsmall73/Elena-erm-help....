import { NextResponse } from "next/server";
import { getState, saveState, isDbConfigured } from "@/lib/db";
import type { ProfileState } from "@/lib/types";

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
  let state: ProfileState;
  try {
    state = (await req.json()) as ProfileState;
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  try {
    await saveState(state);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db-error" }, { status: 503 });
  }
}
