import { db, sql } from "@vercel/postgres";
import type { Deck, ProfileState } from "./types";
import { emptyProfile } from "./types";

// Single implicit user (it's just Elena). Everything is keyed to this id.
//
// This is a partition key, not a credential: it says which rows belong to the
// profile, and nothing about who is allowed to read or write them. Anyone able
// to reach the route gets this profile. Access control belongs in front of the
// route, not here.
const USER_ID = process.env.DOODLE_USER_ID || "elena";

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

  // Two of these statements clear rows before writing the replacements, so the
  // whole save runs in one transaction. Without it a save that dies part-way
  // leaves the delete committed and the inserts missing, which loses every
  // deck she has made.
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;

    await client.sql`
      INSERT INTO profile (user_id, day_streak, last_played, comfort, updated_at)
      VALUES (${USER_ID}, ${state.dayStreak}, ${state.lastPlayed}, ${state.comfortReading}, ${now})
      ON CONFLICT (user_id) DO UPDATE SET
        day_streak = EXCLUDED.day_streak,
        last_played = EXCLUDED.last_played,
        comfort = EXCLUDED.comfort,
        updated_at = EXCLUDED.updated_at;
    `;

    // Upsert best scores in one statement (keep the higher of stored vs
    // incoming, so a stale client can never lower a personal best).
    const bestEntries = Object.entries(state.bests);
    if (bestEntries.length > 0) {
      const rows: string[] = [];
      const values: (string | number)[] = [];
      bestEntries.forEach(([deckId, best], i) => {
        const p = i * 4;
        rows.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`);
        values.push(USER_ID, deckId, best.score, best.updatedAt);
      });
      await client.query(
        `INSERT INTO deck_best (user_id, deck_id, score, updated_at)
         VALUES ${rows.join(", ")}
         ON CONFLICT (user_id, deck_id) DO UPDATE SET
           score = GREATEST(deck_best.score, EXCLUDED.score),
           updated_at = EXCLUDED.updated_at;`,
        values,
      );
    }

    // Reconcile custom decks. The posted set is the source of truth, so clear
    // and re-insert; the volume is a handful of rows. Deduplicated by deck id
    // because the primary key would reject a repeat and fail the whole save.
    await client.sql`DELETE FROM custom_deck WHERE user_id = ${USER_ID};`;

    const decks = [...new Map(state.customDecks.map((d) => [d.id, d])).values()];
    if (decks.length > 0) {
      const rows: string[] = [];
      const values: (string | number)[] = [];
      decks.forEach((deck, i) => {
        const p = i * 4;
        rows.push(`($${p + 1}, $${p + 2}, $${p + 3}::jsonb, $${p + 4})`);
        values.push(USER_ID, deck.id, JSON.stringify(deck), deck.createdAt ?? now);
      });
      await client.query(
        `INSERT INTO custom_deck (user_id, deck_id, data, created_at)
         VALUES ${rows.join(", ")};`,
        values,
      );
    }

    await client.sql`COMMIT`;
  } catch (err) {
    // A rollback on an already-broken connection throws in turn; swallow that
    // so the caller sees the failure that actually matters.
    try {
      await client.sql`ROLLBACK`;
    } catch {
      /* connection is gone; the transaction dies with it */
    }
    throw err;
  } finally {
    client.release();
  }
}
