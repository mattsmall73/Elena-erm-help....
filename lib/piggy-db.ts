import { db, sql } from "@vercel/postgres";
import { USER_ID } from "./user";
import { pencePerMinutes } from "./piggy";

/* Separate from lib/db.ts and lib/revision-db.ts for the same reason those are
   separate from each other: one app's queries cannot break another's. Same
   client, same POSTGRES_URL, no new dependency.

   USER_ID is a partition key and nothing more. Access control is the passcode
   gate in proxy.ts plus withSession on every route. */

export interface PiggyEntry {
  id: string;
  /** YYYY-MM-DD, the day where she is. */
  entryDate: string;
  mins: number;
}

export interface PiggyState {
  /** Everything not yet paid for, newest first. */
  open: PiggyEntry[];
  /** Days worked recently, paid or not, so the streak survives a payday. */
  recentDates: string[];
  /** Sum of every payout ever made. */
  lifetimePence: number;
}

/** How far back the streak can look. */
const RECENT_DAYS = 40;

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Postgres returns a date column as a Date; we want the key back unchanged. */
function dateKey(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    return [
      v.getUTCFullYear(),
      String(v.getUTCMonth() + 1).padStart(2, "0"),
      String(v.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }
  return "";
}

export async function getState(): Promise<PiggyState> {
  const open = await sql`
    SELECT id, entry_date, mins
    FROM piggy_entry
    WHERE user_id = ${USER_ID} AND payout_id IS NULL
    ORDER BY entry_date DESC, created_at DESC;
  `;

  const recent = await sql`
    SELECT DISTINCT entry_date
    FROM piggy_entry
    WHERE user_id = ${USER_ID}
      AND entry_date >= CURRENT_DATE - ${RECENT_DAYS}::int
    ORDER BY entry_date DESC;
  `;

  const paid = await sql`
    SELECT COALESCE(SUM(amount_pence), 0)::int AS total
    FROM piggy_payout
    WHERE user_id = ${USER_ID};
  `;

  return {
    open: open.rows.map((r) => ({
      id: r.id as string,
      entryDate: dateKey(r.entry_date),
      mins: r.mins as number,
    })),
    recentDates: recent.rows.map((r) => dateKey(r.entry_date)),
    lifetimePence: (paid.rows[0]?.total as number) ?? 0,
  };
}

export async function addEntry(entryDate: string, mins: number): Promise<PiggyEntry> {
  const entry: PiggyEntry = { id: id("pe"), entryDate, mins };
  await sql`
    INSERT INTO piggy_entry (id, user_id, entry_date, mins)
    VALUES (${entry.id}, ${USER_ID}, ${entryDate}::date, ${mins});
  `;
  return entry;
}

/**
 * Undo. Only ever touches an entry that has not been paid for, so a mistyped
 * number can be taken back and a settled week cannot be edited after the fact.
 */
export async function deleteOpenEntry(entryId: string): Promise<boolean> {
  const res = await sql`
    DELETE FROM piggy_entry
    WHERE id = ${entryId} AND user_id = ${USER_ID} AND payout_id IS NULL;
  `;
  return (res.rowCount ?? 0) > 0;
}

export interface Payout {
  id: string;
  mins: number;
  amountPence: number;
}

/**
 * Pay out everything outstanding, in one transaction.
 *
 * The order matters and is not the obvious one. The payout row is written
 * first with zero on it, because the entries carry a foreign key to it and
 * cannot point at a row that does not exist yet. Then the UPDATE claims every
 * unpaid entry in a single statement and reports back what it took, which is
 * what makes a second Payday arriving at the same moment harmless: the
 * WHERE payout_id IS NULL can only match each row once, so the second one
 * claims nothing, finds zero minutes and rolls itself away. Only then is the
 * total written onto the payout.
 *
 * The amount is computed here from the minutes the UPDATE actually claimed.
 * Nothing the browser sends is trusted with money.
 *
 * Everything outstanding rather than only this week: if a Payday gets missed,
 * the hours she worked must still be there to be paid for. That is a reading
 * of the brief rather than a quote from it.
 */
export async function payday(): Promise<Payout | null> {
  const payoutId = id("po");
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;

    await client.sql`
      INSERT INTO piggy_payout (id, user_id, mins, amount_pence)
      VALUES (${payoutId}, ${USER_ID}, 0, 0);
    `;

    const claimed = await client.sql`
      UPDATE piggy_entry
      SET payout_id = ${payoutId}
      WHERE user_id = ${USER_ID} AND payout_id IS NULL
      RETURNING mins;
    `;

    if (claimed.rows.length === 0) {
      await client.sql`ROLLBACK`;
      return null;
    }

    const mins = claimed.rows.reduce((sum, r) => sum + (r.mins as number), 0);
    const amountPence = pencePerMinutes(mins);

    await client.sql`
      UPDATE piggy_payout
      SET mins = ${mins}, amount_pence = ${amountPence}
      WHERE id = ${payoutId};
    `;

    await client.sql`COMMIT`;
    return { id: payoutId, mins, amountPence };
  } catch (err) {
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

/** True when the tables have not been created yet. */
export function isMissingTable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "42P01"
  );
}
