import { sql } from "@vercel/postgres";
import { readFileSync } from "node:fs";

/* Loads the Richard and John sheet. Run it again after editing the JSON
   and it updates in place rather than making a duplicate. */

const USER_ID = "elena";
const ID = "richard-and-john-1189-1216";

const sheet = JSON.parse(
  readFileSync(new URL("../data/richard-and-john.json", import.meta.url))
);

await sql`
  INSERT INTO revision_sheet (id, user_id, title, subject, questions)
  VALUES (${ID}, ${USER_ID}, ${sheet.title}, ${sheet.subject}, ${JSON.stringify(sheet.questions)}::jsonb)
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    subject = EXCLUDED.subject,
    questions = EXCLUDED.questions;
`;

console.log(`Loaded "${sheet.title}" with ${sheet.questions.length} questions.`);
