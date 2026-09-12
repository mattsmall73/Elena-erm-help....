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

COMMIT;

-- Check it worked. Expect five rows for revision_sheet, six for
-- revision_answer, and one foreign key named revision_answer_sheet_id_fkey.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('revision_sheet', 'revision_answer')
ORDER BY table_name, ordinal_position;

SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = 'revision_answer'::regclass
  AND contype = 'f';
