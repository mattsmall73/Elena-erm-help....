import { db } from "@vercel/postgres";

/* Creates the two tables the revision app needs. Touches nothing that
   Forgetful Doodle uses. Safe to run more than once. */

const client = await db.connect();

try {
  await client.sql`BEGIN`;

  await client.sql`
    CREATE TABLE IF NOT EXISTS revision_sheet (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      title text NOT NULL,
      subject text NOT NULL DEFAULT '',
      questions jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `;

  await client.sql`
    CREATE TABLE IF NOT EXISTS revision_answer (
      sheet_id text NOT NULL,
      user_id text NOT NULL,
      question_index int NOT NULL,
      answer text NOT NULL DEFAULT '',
      flagged boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sheet_id, user_id, question_index)
    );
  `;

  await client.sql`COMMIT`;
  console.log("Tables ready: revision_sheet, revision_answer");
} catch (err) {
  try { await client.sql`ROLLBACK`; } catch {}
  console.error("Failed, nothing was changed:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
}
