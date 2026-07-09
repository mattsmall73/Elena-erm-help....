// Core data model for Forgetful Doodle 2.0

export type MarkResult = "nailed" | "nearly" | "nope";

export type Accent = "cyan" | "magenta" | "amber";

export type SubjectId =
  | "history"
  | "rs"
  | "dance"
  | "english-lit"
  | "combined-science"
  | "maths"
  | "food"
  | "english-language";

export interface Subject {
  id: SubjectId;
  name: string;
  board?: string;
  accent: Accent;
  /**
   * History, English Literature and RS need a topic or notes before the AI
   * generates — the content is the school's specific choice, and free-running
   * produces confident, wrong cards.
   */
  requiresContext: boolean;
  /** No seed decks — always generated on demand from a topic name. */
  onDemand?: boolean;
  blurb: string;
}

export interface Card {
  id: string;
  prompt: string;
  answer: string;
}

export interface Deck {
  id: string;
  subjectId: SubjectId;
  title: string;
  cards: Card[];
  /** Built-in decks that ship with the app. */
  seed?: boolean;
  /** Deck she made herself (AI-generated or hand-built). */
  source?: "ai" | "handmade";
  /** Placeholder decks shown in the grid but not yet playable. */
  comingSoon?: boolean;
  createdAt?: number;
}

// ---- Persistence shapes ----

export interface DeckBest {
  score: number;
  updatedAt: number;
}

export interface ProfileState {
  /** Best score per deck id. The opponent is always her past self. */
  bests: Record<string, DeckBest>;
  /** Consecutive days played. */
  dayStreak: number;
  /** ISO date (YYYY-MM-DD) she last completed a round. */
  lastPlayed: string | null;
  /** Decks she made — generated or hand-built. */
  customDecks: Deck[];
  /** Comfort-reading toggle. */
  comfortReading: boolean;
}

export const emptyProfile: ProfileState = {
  bests: {},
  dayStreak: 0,
  lastPlayed: null,
  customDecks: [],
  comfortReading: false,
};
