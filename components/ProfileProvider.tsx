"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Deck, ProfileState } from "@/lib/types";
import { emptyProfile } from "@/lib/types";
import { mergeProfiles } from "@/lib/profile-merge";

const STORAGE_KEY = "forgetful-doodle:profile";
// Deck ids the server has confirmed it holds. This is what lets a merge tell
// "made here, not pushed yet" apart from "deleted on another device"; without
// it, either new decks get dropped or deleted ones come back.
const SYNCED_KEY = "forgetful-doodle:synced-decks";

interface RoundOutcome {
  beatBest: boolean;
  best: number;
  newDayStreak: number;
  isNewDay: boolean;
}

interface ProfileContextValue {
  profile: ProfileState;
  ready: boolean;
  bestFor: (deckId: string) => number;
  recordRound: (deckId: string, score: number) => RoundOutcome;
  saveCustomDeck: (deck: Deck) => void;
  deleteCustomDeck: (deckId: string) => void;
  setComfortReading: (on: boolean) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// ---- date helpers (local time) ----
function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isYesterday(prev: string, today: string): boolean {
  const t = new Date(today + "T00:00:00");
  t.setDate(t.getDate() - 1);
  return todayKey(t) === prev;
}

function readLocal(): ProfileState {
  if (typeof window === "undefined") return emptyProfile;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile;
    return { ...emptyProfile, ...(JSON.parse(raw) as ProfileState) };
  } catch {
    return emptyProfile;
  }
}

function readSyncedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SYNCED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSyncedIds(ids: string[]): void {
  try {
    window.localStorage.setItem(SYNCED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [ready, setReady] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const persist = useCallback((next: ProfileState) => {
    setProfile(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
    // Best-effort push to the server; ignored if no DB is configured. The
    // response matters for one reason: a confirmed save is what marks these
    // deck ids as synced, so a later merge can tell a deletion elsewhere from
    // a deck that has never left this device.
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((res) => {
        if (res.ok) writeSyncedIds(next.customDecks.map((d) => d.id));
      })
      .catch(() => {});
  }, []);

  // Load: localStorage first (instant), then reconcile with the server if a DB
  // is configured. If there's no server/DB, we simply run on localStorage.
  useEffect(() => {
    const local = readLocal();
    setProfile(local);
    setReady(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const server = (await res.json()) as ProfileState | null;
        if (server && !cancelled) {
          const merged = mergeProfiles(
            profileRef.current,
            { ...emptyProfile, ...server },
            readSyncedIds(),
          );
          setProfile(merged);
          writeSyncedIds(server.customDecks?.map((d) => d.id) ?? []);
          // Anything the server was missing goes up now, so a deck made
          // offline stops being one device away from disappearing.
          if (merged.customDecks.length > (server.customDecks?.length ?? 0)) {
            persist(merged);
          }
        }
      } catch {
        /* offline / no DB — localStorage is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  // Reflect comfort-reading on <html> so global CSS can respond.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("comfort", profile.comfortReading);
  }, [profile.comfortReading, ready]);

  const bestFor = useCallback(
    (deckId: string) => profileRef.current.bests[deckId]?.score ?? 0,
    [],
  );

  const recordRound = useCallback(
    (deckId: string, score: number): RoundOutcome => {
      const prev = profileRef.current;
      const prevBest = prev.bests[deckId]?.score ?? 0;
      const beatBest = score > prevBest;
      const best = Math.max(prevBest, score);

      const today = todayKey();
      let dayStreak = prev.dayStreak;
      let isNewDay = false;
      if (prev.lastPlayed !== today) {
        isNewDay = true;
        dayStreak =
          prev.lastPlayed && isYesterday(prev.lastPlayed, today)
            ? prev.dayStreak + 1
            : 1;
      }

      const next: ProfileState = {
        ...prev,
        bests: {
          ...prev.bests,
          [deckId]: { score: best, updatedAt: Date.now() },
        },
        dayStreak,
        lastPlayed: today,
      };
      persist(next);
      return { beatBest, best, newDayStreak: dayStreak, isNewDay };
    },
    [persist],
  );

  const saveCustomDeck = useCallback(
    (deck: Deck) => {
      const prev = profileRef.current;
      const others = prev.customDecks.filter((d) => d.id !== deck.id);
      persist({ ...prev, customDecks: [deck, ...others] });
    },
    [persist],
  );

  const deleteCustomDeck = useCallback(
    (deckId: string) => {
      const prev = profileRef.current;
      persist({
        ...prev,
        customDecks: prev.customDecks.filter((d) => d.id !== deckId),
      });
    },
    [persist],
  );

  const setComfortReading = useCallback(
    (on: boolean) => {
      persist({ ...profileRef.current, comfortReading: on });
    },
    [persist],
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        ready,
        bestFor,
        recordRound,
        saveCustomDeck,
        deleteCustomDeck,
        setComfortReading,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
