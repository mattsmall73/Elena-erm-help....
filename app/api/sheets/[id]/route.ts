import { getSheet, deleteSheet } from "@/lib/revision-db";
import { withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Next 16: params is async. */
type Context = { params: Promise<{ id: string }> };

export const GET = withSession<Context>(async (request, { params }) => {
  try {
    const { id } = await params;
    const found = await getSheet(id);
    if (!found) {
      return Response.json({ error: "That sheet is not here." }, { status: 404 });
    }
    return Response.json(found);
  } catch (err) {
    // The message stays server-side. A Postgres error names tables, columns
    // and sometimes the connection, and this reached the browser verbatim.
    console.error("[sheets] request failed:", err);
    return Response.json(
      { error: "Something went wrong at our end. Try that again." },
      { status: 500 },
    );
  }
});

export const DELETE = withSession<Context>(async (request, { params }) => {
  try {
    const { id } = await params;
    await deleteSheet(id);
    return Response.json({ ok: true });
  } catch (err) {
    // The message stays server-side. A Postgres error names tables, columns
    // and sometimes the connection, and this reached the browser verbatim.
    console.error("[sheets] request failed:", err);
    return Response.json(
      { error: "Something went wrong at our end. Try that again." },
      { status: 500 },
    );
  }
});
