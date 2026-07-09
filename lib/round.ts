import type { Card, MarkResult } from "./types";

// ---- Rules from the brief ----
export const ROUND_SIZE = 10;      // short rounds: 10 cards
export const BASE_POINTS = 10;     // 10 → 20 → 30 …
export const MAX_MULTIPLIER = 5;   // cap ×5
export const MAX_REQUEUE = 4;      // "Nearly"/"Nope" re-queue, cap 4

export interface QueueItem {
  card: Card;
  requeues: number;
}

export interface RoundState {
  queue: QueueItem[]; // current card is queue[0]
  streak: number; // consecutive "nailed it"
  score: number;
  resolved: number; // distinct cards finished
  total: number; // distinct cards this round
  nailed: number; // count nailed (for the finish screen)
  lastGain: number | null; // points from the last "nailed", for the pop
  done: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Draw up to ROUND_SIZE distinct cards and build the opening state. */
export function startRound(cards: Card[]): RoundState {
  const picked = shuffle(cards).slice(0, Math.min(ROUND_SIZE, cards.length));
  return {
    queue: picked.map((card) => ({ card, requeues: 0 })),
    streak: 0,
    score: 0,
    resolved: 0,
    total: picked.length,
    nailed: 0,
    lastGain: null,
    done: picked.length === 0,
  };
}

export function currentCard(state: RoundState): Card | null {
  return state.done || state.queue.length === 0 ? null : state.queue[0].card;
}

/** What the next "nailed it" would be worth right now. */
export function nextMultiplier(state: RoundState): number {
  return Math.min(state.streak + 1, MAX_MULTIPLIER);
}

/** Self-mark the current card and advance the round. */
export function mark(state: RoundState, result: MarkResult): RoundState {
  if (state.done || state.queue.length === 0) return state;

  const [current, ...rest] = state.queue;

  if (result === "nailed") {
    const streak = state.streak + 1;
    const gain = BASE_POINTS * Math.min(streak, MAX_MULTIPLIER);
    const queue = rest;
    return {
      ...state,
      queue,
      streak,
      score: state.score + gain,
      resolved: state.resolved + 1,
      nailed: state.nailed + 1,
      lastGain: gain,
      done: queue.length === 0,
    };
  }

  // "Nearly" or "Nope" — streak resets, card comes back later (capped).
  const canRequeue = current.requeues < MAX_REQUEUE;
  let queue: QueueItem[];
  let resolved = state.resolved;

  if (canRequeue) {
    const item: QueueItem = { card: current.card, requeues: current.requeues + 1 };
    // Drop it back a few places so it returns later in the round.
    const at = Math.min(rest.length, 3);
    queue = [...rest.slice(0, at), item, ...rest.slice(at)];
  } else {
    queue = rest; // given a fair few goes — let it rest, count it done
    resolved = state.resolved + 1;
  }

  return {
    ...state,
    queue,
    streak: 0,
    resolved,
    lastGain: null,
    done: queue.length === 0,
  };
}
