import { listSheets, createSheet, upsertSeededSheet } from "@/lib/revision-db";
import { validateSheet } from "@/lib/validate-questions";
import { withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSession(async () => {
  try {
    return Response.json({ sheets: await listSheets() });
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

export const POST = withSession(async (request) => {
  try {
    // The whole sheet goes into a JSONB column, so it is validated and
    // rebuilt from known fields rather than written as it arrived.
    const parsed = validateSheet(await request.json());
    if (!parsed.ok) {
      return Response.json({ error: parsed.reason }, { status: 400 });
    }

    // A posted id means the shipped sheet, which updates in place rather than
    // duplicating. Everything she builds herself takes a generated id.
    if (parsed.id) {
      const res = await upsertSeededSheet(
        parsed.id,
        parsed.title,
        parsed.subject,
        parsed.questions,
      );
      return Response.json(res);
    }

    const id = await createSheet(parsed.title, parsed.subject, parsed.questions);
    return Response.json({ id, created: true });
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
