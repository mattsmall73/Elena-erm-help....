import {
  listSheets,
  createSheet,
  upsertSeededSheet,
  saveSourcePages,
  deleteSheet,
  missingTable,
} from "@/lib/revision-db";
import { validateSheet, validateSourcePages } from "@/lib/validate-questions";
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
    const body = (await request.json()) as Record<string, unknown> | null;
    const parsed = validateSheet(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.reason }, { status: 400 });
    }
    const pages = validateSourcePages(body?.sourcePages);
    if (!pages.ok) {
      return Response.json({ error: pages.reason }, { status: 400 });
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

    // An English Language paper brings images of its source pages. If they
    // cannot be stored, the sheet goes too: a paper without its source is
    // worse than no paper, since every question points at it.
    if (pages.pages.length > 0) {
      try {
        await saveSourcePages(id, pages.pages);
      } catch (err) {
        await deleteSheet(id).catch(() => {});
        if (missingTable(err)) {
          console.error(
            "[sheets] revision_source is missing. Run scripts/schema.sql to create it.",
          );
          return Response.json(
            {
              error:
                "English Language papers need one more database step. Ask Dad to run the setup script in Neon.",
            },
            { status: 503 },
          );
        }
        throw err;
      }
    }

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
