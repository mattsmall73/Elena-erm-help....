import type { ProfileState } from "./types";

/**
 * Reconcile the local profile with the server's copy.
 *
 * Decks are unioned rather than replaced. A deck the server doesn't have is
 * kept when it has never synced (she made it here, offline or after a failed
 * POST) and dropped when it has (she deleted it on another device). Best
 * scores take the higher of the two, matching the GREATEST in saveState.
 * Comfort reading stays local, since it describes the screen she is reading on.
 */
export function mergeProfiles(
  local: ProfileState,
  server: ProfileState,
  syncedIds: Set<string>,
): ProfileState {
  const bests: ProfileState["bests"] = { ...server.bests };
  for (const [deckId, localBest] of Object.entries(local.bests)) {
    const serverBest = bests[deckId];
    if (!serverBest || localBest.score > serverBest.score) {
      bests[deckId] = localBest;
    }
  }

  const serverIds = new Set(server.customDecks.map((d) => d.id));
  const unpushed = local.customDecks.filter(
    (d) => !serverIds.has(d.id) && !syncedIds.has(d.id),
  );

  const lastPlayed =
    [local.lastPlayed, server.lastPlayed]
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;

  return {
    bests,
    dayStreak: Math.max(local.dayStreak, server.dayStreak),
    lastPlayed,
    customDecks: [...unpushed, ...server.customDecks],
    comfortReading: local.comfortReading,
  };
}
