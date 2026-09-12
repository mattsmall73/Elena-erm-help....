import { db, sql } from "@vercel/postgres";
import { USER_ID } from "./user";

/* Deliberately a separate file from lib/db.ts so that fixing one app
   cannot break the other. Same client, same POSTGRES_URL, no new
   dependency.

   USER_ID comes from lib/user.ts, the single definition shared with
   lib/db.ts and the session layer. Access control is the passcode gate
   in proxy.ts plus withSession on each route, so this is a partition
   key and nothing more. */

export type QuestionType = "short" | "long" | "judge";

export type Question = {
  label: string;
  type: QuestionType;
  prompt: string;
  given: string;
  shape: string[];
  hints: string[];
};

export type SheetSummary = {
  id: string;
  title: string;
  subject: string;
  question_count: number;
};

export type Sheet = {
  id: string;
  title: string;
  subject: string;
  questions: Question[];
};

export async function listSheets(): Promise<SheetSummary[]> {
  const res = await sql`
    SELECT id, title, subject,
           jsonb_array_length(questions) AS question_count
    FROM revision_sheet
    WHERE user_id = ${USER_ID}
    ORDER BY created_at DESC;
  `;
  return res.rows as SheetSummary[];
}

export async function getSheet(id: string) {
  const sheetRes = await sql`
    SELECT id, title, subject, questions
    FROM revision_sheet
    WHERE id = ${id} AND user_id = ${USER_ID};
  `;
  if (sheetRes.rows.length === 0) return null;

  const answerRes = await sql`
    SELECT question_index, answer, flagged
    FROM revision_answer
    WHERE sheet_id = ${id} AND user_id = ${USER_ID};
  `;

  const answers: Record<number, string> = {};
  const flags: Record<number, boolean> = {};
  for (const row of answerRes.rows) {
    answers[row.question_index as number] = row.answer as string;
    if (row.flagged) flags[row.question_index as number] = true;
  }

  return { sheet: sheetRes.rows[0] as Sheet, answers, flags };
}

export async function createSheet(
  title: string,
  subject: string,
  questions: Question[]
): Promise<string> {
  const id =
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) +
    "-" +
    Math.random().toString(36).slice(2, 7);

  /* Single statement. The questions array goes in as one JSON string
     because the tagged template will not accept an array as a value. */
  await sql`
    INSERT INTO revision_sheet (id, user_id, title, subject, questions)
    VALUES (${id}, ${USER_ID}, ${title}, ${subject}, ${JSON.stringify(questions)}::jsonb);
  `;

  return id;
}

/* One answer, one statement, upserted. Nothing is deleted, so there is
   nothing to lose if this fails halfway. */
export async function saveAnswer(
  sheetId: string,
  questionIndex: number,
  answer: string,
  flagged: boolean
) {
  await sql`
    INSERT INTO revision_answer (sheet_id, user_id, question_index, answer, flagged, updated_at)
    VALUES (${sheetId}, ${USER_ID}, ${questionIndex}, ${answer}, ${flagged}, NOW())
    ON CONFLICT (sheet_id, user_id, question_index)
    DO UPDATE SET answer = EXCLUDED.answer,
                  flagged = EXCLUDED.flagged,
                  updated_at = NOW();
  `;
}

/* The only place in this app that deletes anything, and the only place
   that needs more than one statement. If the second delete fails, the
   first is rolled back, so a sheet cannot end up with its questions
   gone and its answers stranded. */
export async function deleteSheet(id: string) {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    await client.sql`DELETE FROM revision_answer WHERE sheet_id = ${id} AND user_id = ${USER_ID};`;
    await client.sql`DELETE FROM revision_sheet  WHERE id = ${id}       AND user_id = ${USER_ID};`;
    await client.sql`COMMIT`;
  } catch (err) {
    try {
      await client.sql`ROLLBACK`;
    } catch {
      /* connection already gone, nothing to roll back against */
    }
    throw err;
  } finally {
    client.release();
  }
}
