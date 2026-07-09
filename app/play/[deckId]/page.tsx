"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSeedDeck } from "@/lib/seed-decks";
import { Round } from "@/components/Round";
import { useProfile } from "@/components/ProfileProvider";

export default function PlayPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId;
  const { profile, ready } = useProfile();

  // The round shuffles cards with Math.random(); only ever mount it on the
  // client so the server and first client render agree (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const deck = useMemo(() => {
    const seed = getSeedDeck(deckId);
    if (seed) return seed;
    return profile.customDecks.find((d) => d.id === deckId) ?? null;
  }, [deckId, profile.customDecks]);

  // Custom decks load from storage on the client — wait before deciding.
  if (!mounted || (!deck && !ready)) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="text-muted animate-pulse">Loading…</div>
      </main>
    );
  }

  if (!deck || deck.comingSoon || deck.cards.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-ink font-display text-xl">
          That deck isn&rsquo;t ready to play yet.
        </p>
        <Link
          href="/"
          className="text-cyan hover:text-glow-cyan text-sm transition-colors"
        >
          ← Back to the arcade
        </Link>
      </main>
    );
  }

  return <Round deck={deck} />;
}
