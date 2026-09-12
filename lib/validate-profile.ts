import type { Card, Deck, DeckBest, ProfileState } from "./types";

/**
 * Bounds for an incoming profile. These are far above anything the app itself
 * produces (a round is 10 cards, a generated deck is 8 to 12) and exist to stop
 * an unbounded body reaching Postgres, not to constrain real use.
 */
export const LIMITS = {
  decks: 200,
  cardsPerDeck: 500,
  bests: 2000,
  titleChars: 300,
  cardChars: 4000,
  idChars: 200,
  score: 10_000_000,
  dayStreak: 100_000,
} as const;

export type Validated =
  | { ok: true; state: ProfileState }
  | { ok: false; reason: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

/** A non-negative integer within range. Rejects NaN, Infinity and fractions. */
function int(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max
    ? v
    : null;
}

/** An epoch-millisecond timestamp. Allows 0, which older rows default to. */
function stamp(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.floor(v)
    : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function card(v: unknown): Card | null {
  if (!isObject(v)) return null;
  const id = str(v.id, LIMITS.idChars);
  const prompt = str(v.prompt, LIMITS.cardChars);
  const answer = str(v.answer, LIMITS.cardChars);
  if (id === null || prompt === null || answer === null) return null;
  return { id, prompt, answer };
}

/**
 * Rebuilds the deck from known fields only. The whole object is written into a
 * JSONB column, so anything unrecognised is dropped rather than stored.
 *
 * subjectId is checked as a bounded string rather than against the subject
 * union: a stricter check would reject any deck saved before a subject was
 * renamed, and a rejected body means her sync stops working with no visible
 * cause. Junk is already excluded by the length bound.
 */
function deck(v: unknown): Deck | null {
  if (!isObject(v)) return null;
  const id = str(v.id, LIMITS.idChars);
  const subjectId = str(v.subjectId, LIMITS.idChars);
  const title = str(v.title, LIMITS.titleChars);
  if (id === null || subjectId === null || title === null) return null;
  if (!Array.isArray(v.cards) || v.cards.length > LIMITS.cardsPerDeck) {
    return null;
  }

  const cards: Card[] = [];
  for (const raw of v.cards) {
    const c = card(raw);
    if (c === null) return null;
    cards.push(c);
  }

  const out: Deck = {
    id,
    subjectId: subjectId as Deck["subjectId"],
    title,
    cards,
  };
  if (v.seed === true) out.seed = true;
  if (v.comingSoon === true) out.comingSoon = true;
  if (v.source === "ai" || v.source === "handmade") out.source = v.source;
  const createdAt = stamp(v.createdAt);
  if (createdAt !== null) out.createdAt = createdAt;
  return out;
}

/**
 * Validate and normalise a posted profile.
 *
 * Anything that fails is rejected outright rather than repaired, so a
 * malformed or hostile body never reaches the write path. saveState clears
 * rows before writing the replacements, so a body that cannot be trusted must
 * not get that far.
 */
export function validateProfileState(input: unknown): Validated {
  if (!isObject(input)) return { ok: false, reason: "Expected an object." };

  const dayStreak = int(input.dayStreak, LIMITS.dayStreak);
  if (dayStreak === null) return { ok: false, reason: "Invalid dayStreak." };

  if (typeof input.comfortReading !== "boolean") {
    return { ok: false, reason: "Invalid comfortReading." };
  }

  let lastPlayed: string | null = null;
  if (input.lastPlayed !== null && input.lastPlayed !== undefined) {
    const raw = str(input.lastPlayed, 10);
    if (raw === null || !ISO_DATE.test(raw)) {
      return { ok: false, reason: "lastPlayed must be YYYY-MM-DD or null." };
    }
    lastPlayed = raw;
  }

  if (!isObject(input.bests)) return { ok: false, reason: "Invalid bests." };
  const bestEntries = Object.entries(input.bests);
  if (bestEntries.length > LIMITS.bests) {
    return { ok: false, reason: "Too many deck scores." };
  }
  const bests: Record<string, DeckBest> = {};
  for (const [deckId, raw] of bestEntries) {
    if (deckId.length > LIMITS.idChars) {
      return { ok: false, reason: "Deck id too long." };
    }
    if (!isObject(raw)) return { ok: false, reason: "Invalid score entry." };
    const score = int(raw.score, LIMITS.score);
    const updatedAt = stamp(raw.updatedAt);
    if (score === null || updatedAt === null) {
      return { ok: false, reason: "Invalid score entry." };
    }
    bests[deckId] = { score, updatedAt };
  }

  if (!Array.isArray(input.customDecks)) {
    return { ok: false, reason: "Invalid customDecks." };
  }
  if (input.customDecks.length > LIMITS.decks) {
    return { ok: false, reason: "Too many decks." };
  }
  const customDecks: Deck[] = [];
  for (const raw of input.customDecks) {
    const d = deck(raw);
    if (d === null) return { ok: false, reason: "Invalid deck." };
    customDecks.push(d);
  }

  return {
    ok: true,
    state: { bests, dayStreak, lastPlayed, customDecks, comfortReading: input.comfortReading },
  };
}
