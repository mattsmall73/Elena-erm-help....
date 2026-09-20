/**
 * Everything about the piggy bank that is arithmetic rather than storage.
 *
 * Kept apart from lib/piggy-db.ts the same way lib/marking.ts is kept apart
 * from lib/revision-db.ts, so the money and the dates can be tested without a
 * database.
 */

/**
 * The deal, in one place because it was negotiated and may be negotiated
 * again. Pence per hour, an integer, so nothing here ever touches a float.
 */
export const RATE_PENCE_PER_HOUR = 100;

/** A coin per quarter of an hour, capped so a long entry still animates. */
export const MINS_PER_COIN = 15;
export const MAX_COINS = 12;

/** The pig looks full at ten hours in a week. */
export const PIG_FULL_MINS = 600;

/** One entry. Ten hours in a single sitting is a typo, not a day. */
export const MIN_ENTRY_MINS = 1;
export const MAX_ENTRY_MINS = 600;

/**
 * One hour fills a bar, on every bar, every week.
 *
 * Deliberately absolute rather than scaled to the week's busiest day. Scaled,
 * a 90 minute day in a quiet week would look identical to a 20 minute day in a
 * busy one, and the sparkle overlay would come and go for reasons she cannot
 * see on the screen.
 */
export const BAR_MINS = 60;

/** Money, always as whole pence. */
export function pencePerMinutes(mins: number): number {
  return Math.round((mins * RATE_PENCE_PER_HOUR) / 60);
}

export function formatPence(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "45m" below the hour, "1h30" above it, so the label matches the bar. */
export function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

export interface BarTiers {
  /** Percentages of the bar height, each 0 to 100. */
  cyan: number;
  amber: number;
  magenta: number;
  /** Past three hours the whole bar glows. */
  glow: boolean;
}

/**
 * How much of each layer shows for a day.
 *
 *   0 to 60      cyan rising
 *   60 to 120    full cyan, amber shimmer over it
 *   120 to 180   full cyan and amber, magenta shimmer over that
 *   past 180     all three full, and the bar glows
 */
export function barTiers(mins: number): BarTiers {
  const layer = (from: number) =>
    (Math.min(BAR_MINS, Math.max(0, mins - from)) / BAR_MINS) * 100;
  return {
    cyan: layer(0),
    amber: layer(BAR_MINS),
    magenta: layer(BAR_MINS * 2),
    glow: mins > BAR_MINS * 3,
  };
}

/* ---------------------------------------------------------------------------
   Dates.

   Every date here is a YYYY-MM-DD key in her local time, worked out in the
   browser and sent to the server as a string. The server never derives a day
   from its own clock: it runs in UTC, so an entry made at half past midnight
   in British Summer Time would land on the previous day and in the wrong week.
   Arithmetic below is done on the key itself, parsed at midday UTC, which is
   far enough from both midnight boundaries that no daylight saving shift can
   move it to the day either side.
--------------------------------------------------------------------------- */

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string" || !KEY_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && toKey(d) === s;
}

function toKey(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Today where she is, not where the server is. */
export function localDateKey(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

/** Monday of the week the given day falls in. Monday returns itself. */
export function mondayOf(key: string): string {
  const dow = parseKey(key).getUTCDay(); // 0 Sun, 1 Mon
  return addDays(key, -((dow + 6) % 7));
}

/** The seven keys Monday to Sunday for the week containing this day. */
export function weekDates(key: string): string[] {
  const monday = mondayOf(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Days worked in a row, counting back from today and allowing today to be
 * empty so the streak does not appear to break until a whole day is missed.
 */
export function streakFrom(worked: ReadonlySet<string>, todayKey: string): number {
  let cursor = worked.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (worked.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}
