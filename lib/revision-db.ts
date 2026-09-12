import { sql } from "@vercel/postgres";
import { USER_ID } from "./user";
import type { StoredMark } from "./marking";

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

  const marks = await listMarks(id);

  return { sheet: sheetRes.rows[0] as Sheet, answers, flags, marks };
}

/**
 * Write the shipped sheet, updating it in place if it is already there.
 *
 * Answers are never touched. That is the point: a sheet gets improved, the
 * hints are refreshed, and anything she has written against it survives,
 * which a delete and reload cannot offer.
 *
 * Matching runs id first, then title. The title step exists because the sheet
 * loaded before ids were fixed has a generated id with a random suffix that
 * nothing can predict, so an id-only match would make a second copy of it and
 * there is no delete control to clear up with. It is confined to the seed path,
 * since a sheet built by hand never sends an id, and it only acts on an
 * unambiguous single match. When it matches, the row keeps its own id, so its
 * answers stay attached.
 */
export async function upsertSeededSheet(
  id: string,
  title: string,
  subject: string,
  questions: Question[],
): Promise<{ id: string; created: boolean }> {
  const json = JSON.stringify(questions);

  // created_at is deliberately absent from every SET below, so an update keeps
  // the date the sheet first appeared.
  const byId = await sql`
    UPDATE revision_sheet
    SET title = ${title}, subject = ${subject}, questions = ${json}::jsonb
    WHERE id = ${id} AND user_id = ${USER_ID}
    RETURNING id;
  `;
  if (byId.rowCount === 1) return { id, created: false };

  const byTitle = await sql`
    UPDATE revision_sheet
    SET subject = ${subject}, questions = ${json}::jsonb
    WHERE user_id = ${USER_ID}
      AND title = ${title}
      AND (SELECT COUNT(*) FROM revision_sheet
           WHERE user_id = ${USER_ID} AND title = ${title}) = 1
    RETURNING id;
  `;
  if (byTitle.rowCount === 1) {
    return { id: byTitle.rows[0].id as string, created: false };
  }

  // ON CONFLICT so two quick presses cannot turn into a primary key error.
  //
  // The user_id guard matters: the primary key is the id alone, so without it
  // a conflict would update whichever profile owns that id. Tested, and it
  // did exactly that before the guard was here. Nothing can reach this with a
  // different owner today, since there is one profile, and the cost of being
  // wrong later is writing over someone else's sheet.
  const inserted = await sql`
    INSERT INTO revision_sheet (id, user_id, title, subject, questions)
    VALUES (${id}, ${USER_ID}, ${title}, ${subject}, ${json}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      subject = EXCLUDED.subject,
      questions = EXCLUDED.questions
    WHERE revision_sheet.user_id = EXCLUDED.user_id
    RETURNING id;
  `;
  if (inserted.rowCount !== 1) {
    // The id exists and belongs to another profile, so the guard refused it.
    // Step one already ruled out this profile owning it.
    throw new Error(`Sheet id ${id} belongs to another profile.`);
  }
  return { id, created: true };
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

export interface MarkRow extends StoredMark {
  feedback: unknown;
  markedAt: number;
}

/** Every mark on a sheet, for the running grade and for showing past feedback. */
export async function listMarks(sheetId: string): Promise<MarkRow[]> {
  const res = await sql`
    SELECT question_index, mark, max_mark, level, max_level,
           previous_mark, previous_level, feedback,
           (EXTRACT(EPOCH FROM marked_at) * 1000)::bigint AS marked_ms
    FROM revision_mark
    WHERE sheet_id = ${sheetId} AND user_id = ${USER_ID}
    ORDER BY question_index;
  `;
  return res.rows.map((r) => ({
    questionIndex: r.question_index as number,
    mark: r.mark as number | null,
    maxMark: r.max_mark as number | null,
    level: r.level as number | null,
    maxLevel: r.max_level as number | null,
    previousMark: r.previous_mark as number | null,
    previousLevel: r.previous_level as number | null,
    feedback: r.feedback,
    markedAt: Number(r.marked_ms),
  }));
}

/**
 * Store a mark, moving whatever was there into the previous columns.
 *
 * Every SET expression sees the row as it was, so previous_mark picks up the
 * old mark in the same statement that overwrites it. That is what lets a
 * re-mark show "was 8, now 10", which is the payoff for rewriting a paragraph.
 *
 * No user_id guard is needed on the conflict here, unlike revision_sheet: this
 * primary key already includes user_id, so a conflict can only ever be her own
 * earlier mark on the same question.
 */
export async function saveMark(
  sheetId: string,
  questionIndex: number,
  m: {
    mark: number | null;
    maxMark: number | null;
    level: number | null;
    maxLevel: number | null;
    feedback: unknown;
  },
): Promise<void> {
  await sql`
    INSERT INTO revision_mark
      (sheet_id, user_id, question_index, mark, max_mark, level, max_level, feedback)
    VALUES (${sheetId}, ${USER_ID}, ${questionIndex}, ${m.mark}, ${m.maxMark},
            ${m.level}, ${m.maxLevel}, ${JSON.stringify(m.feedback)}::jsonb)
    ON CONFLICT (sheet_id, user_id, question_index) DO UPDATE SET
      previous_mark = revision_mark.mark,
      previous_level = revision_mark.level,
      mark = EXCLUDED.mark,
      max_mark = EXCLUDED.max_mark,
      level = EXCLUDED.level,
      max_level = EXCLUDED.max_level,
      feedback = EXCLUDED.feedback,
      marked_at = NOW();
  `;
}

/** One question and her answer to it. */
export interface OtherAnswer {
  questionIndex: number;
  prompt: string;
  answer: string;
}

/**
 * Her other answers on the same sheet, most recently written first.
 *
 * Sent to the marker as reference only, so it can notice knowledge she already
 * has and has not used in the answer being marked. Pointing out that she used
 * something two questions ago is the most encouraging correction available,
 * because it means she knew it.
 *
 * Capped and truncated: ten answers keeps the request bounded, and recency is
 * the right order because the sheet she is working through now is the one she
 * is most likely to be able to reuse.
 */
export async function listOtherAnswers(
  sheetId: string,
  excludeIndex: number,
  limit = 10,
  maxChars = 1200,
): Promise<OtherAnswer[]> {
  const res = await sql`
    SELECT a.question_index,
           COALESCE(s.questions -> a.question_index ->> 'prompt', '') AS prompt,
           left(a.answer, ${maxChars}) AS answer
    FROM revision_answer a
    JOIN revision_sheet s ON s.id = a.sheet_id AND s.user_id = a.user_id
    WHERE a.sheet_id = ${sheetId}
      AND a.user_id = ${USER_ID}
      AND a.question_index <> ${excludeIndex}
      AND length(trim(a.answer)) > 0
    ORDER BY a.updated_at DESC
    LIMIT ${limit};
  `;
  return res.rows.map((r) => ({
    questionIndex: r.question_index as number,
    prompt: r.prompt as string,
    // Already truncated in SQL; sliced again so the cap holds if that changes.
    answer: (r.answer as string).slice(0, maxChars),
  }));
}

export async function getAnswerForMarking(
  sheetId: string,
  questionIndex: number,
): Promise<{ question: Question; answer: string } | null> {
  const res = await sql`
    SELECT s.questions -> ${questionIndex} AS question,
           COALESCE(a.answer, '') AS answer
    FROM revision_sheet s
    LEFT JOIN revision_answer a
      ON a.sheet_id = s.id AND a.user_id = s.user_id
         AND a.question_index = ${questionIndex}
    WHERE s.id = ${sheetId} AND s.user_id = ${USER_ID};
  `;
  const row = res.rows[0];
  if (!row || row.question === null) return null;
  return { question: row.question as Question, answer: row.answer as string };
}

/* One statement, because revision_answer.sheet_id cascades on delete. The
   database removes the answers with the sheet, so there is no window in which
   the questions are gone and the answers are stranded, and no transaction
   needed to close one. */
export async function deleteSheet(id: string) {
  await sql`DELETE FROM revision_sheet WHERE id = ${id} AND user_id = ${USER_ID};`;
}
