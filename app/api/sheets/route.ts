import { listSheets, createSheet, type Question } from "@/lib/revision-db";
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
    const body = (await request.json()) as {
      title?: string;
      subject?: string;
      questions?: Question[];
    };

    if (!body.title?.trim() || !Array.isArray(body.questions) || body.questions.length === 0) {
      return Response.json(
        { error: "A sheet needs a name and at least one question." },
        { status: 400 }
      );
    }

    const id = await createSheet(
      body.title.trim(),
      body.subject?.trim() ?? "",
      body.questions
    );

    return Response.json({ id });
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
