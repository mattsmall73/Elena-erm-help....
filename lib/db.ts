import { sql } from "@vercel/postgres";
import type { Deck, ProfileState } from "./types";
import { emptyProfile } from "./types";

// Single implicit user (it's just Elena). Everything is keyed to this id.
const USER_ID = "elena";

export class DbNotConfiguredError extends Error {}

/** True when a Postgres connection string is present in the environment. */
export function isDbConfigured(): boolean {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL,
  );
}

function assertConfigured() {
  if (!isDbConfigured()) {
    throw new DbNotConfiguredError("No Postgres connection configured.");
  }
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS profile (
          user_id      TEXT PRIMARY KEY,
          day_streak   INTEGER NOT NULL DEFAULT 0,
          last_played  TEXT,
          comfort      BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at   BIGINT NOT NULL DEFAULT 0
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS deck_best (
          user_id     TEXT NOT NULL,
          deck_id     TEXT NOT NULL,
          score       INTEGER NOT NULL,
          updated_at  BIGINT NOT NULL,
          PRIMARY KEY (user_id, deck_id)
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS custom_deck (
          user_id     TEXT NOT NULL,
          deck_id     TEXT NOT NULL,
          data        JSONB NOT NULL,
          created_at  BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, deck_id)
        );
      `;
    })().catch((err) => {
      schemaReady = null; // let a later request retry
      throw err;
    });
  }
  return schemaReady;
}

export async function getState(): Promise<ProfileState> {
  assertConfigured();
  await ensureSchema();

  const [profileRes, bestsRes, decksRes] = await Promise.all([
    sql`SELECT day_streak, last_played, comfort FROM profile WHERE user_id = ${USER_ID};`,
    sql`SELECT deck_id, score, updated_at FROM deck_best WHERE user_id = ${USER_ID};`,
    sql`SELECT data FROM custom_deck WHERE user_id = ${USER_ID} ORDER BY created_at DESC;`,
  ]);

  const profileRow = profileRes.rows[0];
  const bests: ProfileState["bests"] = {};
  for (const row of bestsRes.rows) {
    bests[row.deck_id as string] = {
      score: row.score as number,
      updatedAt: Number(row.updated_at),
    };
  }
  const customDecks = decksRes.rows.map((r) => r.data as Deck);

  return {
    ...emptyProfile,
    bests,
    dayStreak: profileRow ? (profileRow.day_streak as number) : 0,
    lastPlayed: profileRow ? ((profileRow.last_played as string) ?? null) : null,
    comfortReading: profileRow ? Boolean(profileRow.comfort) : false,
    customDecks,
  };
}

export async function saveState(state: ProfileState): Promise<void> {
  assertConfigured();
  await ensureSchema();

  const now = Date.now();

  await sql`
    INSERT INTO profile (user_id, day_streak, last_played, comfort, updated_at)
    VALUES (${USER_ID}, ${state.dayStreak}, ${state.lastPlayed}, ${state.comfortReading}, ${now})
    ON CONFLICT (user_id) DO UPDATE SET
      day_streak = EXCLUDED.day_streak,
      last_played = EXCLUDED.last_played,
      comfort = EXCLUDED.comfort,
      updated_at = EXCLUDED.updated_at;
  `;

  // Upsert best scores (keep the higher of stored vs incoming).
  for (const [deckId, best] of Object.entries(state.bests)) {
    await sql`
      INSERT INTO deck_best (user_id, deck_id, score, updated_at)
      VALUES (${USER_ID}, ${deckId}, ${best.score}, ${best.updatedAt})
      ON CONFLICT (user_id, deck_id) DO UPDATE SET
        score = GREATEST(deck_best.score, EXCLUDED.score),
        updated_at = EXCLUDED.updated_at;
    `;
  }

  // Reconcile custom decks: the posted set is the source of truth, so clear
  // and re-insert (the data volume is tiny — a handful of decks).
  await sql`DELETE FROM custom_deck WHERE user_id = ${USER_ID};`;
  for (const deck of state.customDecks) {
    await sql`
      INSERT INTO custom_deck (user_id, deck_id, data, created_at)
      VALUES (${USER_ID}, ${deck.id}, ${JSON.stringify(deck)}::jsonb, ${deck.createdAt ?? now});
    `;
  }
}
