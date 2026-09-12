-- Ummm Less Panic: the two tables it needs.
--
-- Paste this into the Neon console SQL editor and run it. Safe to run again:
-- every statement is guarded, so a second run changes nothing.
--
-- Nothing Forgetful Doodle uses is touched. Its tables are profile,
-- deck_best and custom_deck, and none of them are mentioned here.

BEGIN;

CREATE TABLE IF NOT EXISTS revision_sheet (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  title       text NOT NULL,
  subject     text NOT NULL DEFAULT '',
  questions   jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- sheet_id references the sheet and cascades on delete, so answers cannot
-- outlive the sheet they belong to and a sheet id that does not exist cannot
-- have answers written against it. Deleting a sheet is then one statement.
CREATE TABLE IF NOT EXISTS revision_answer (
  sheet_id        text NOT NULL
                    REFERENCES revision_sheet (id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  question_index  int NOT NULL,
  answer          text NOT NULL DEFAULT '',
  flagged         boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sheet_id, user_id, question_index)
);

-- Marks, keyed the same way as revision_answer and cascading the same way, so
-- a mark cannot outlive the sheet it belongs to.
--
-- previous_mark and previous_level exist so a re-mark can show movement. The
-- whole coaching loop depends on her rewriting a paragraph and marking it
-- again, and "was 8, now 10" is the payoff for doing that.
--
-- max_level is stored because the running grade is a mean level as a
-- proportion of the scheme's top level, and that ceiling differs by question.
CREATE TABLE IF NOT EXISTS revision_mark (
  sheet_id        text NOT NULL
                    REFERENCES revision_sheet (id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  question_index  int NOT NULL,
  mark            int,
  max_mark        int,
  level           int,
  max_level       int,
  previous_mark   int,
  previous_level  int,
  feedback        jsonb NOT NULL,
  marked_at       timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sheet_id, user_id, question_index)
);

COMMIT;

-- Check it worked. Expect six rows for revision_sheet, six for
-- revision_answer, eleven for revision_mark, and a cascading foreign key on
-- each of the two child tables.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('revision_sheet', 'revision_answer', 'revision_mark')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS child_table, conname, confdeltype
FROM pg_constraint
WHERE conrelid IN ('revision_answer'::regclass, 'revision_mark'::regclass)
  AND contype = 'f'
ORDER BY 1;
