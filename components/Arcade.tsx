"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SUBJECTS } from "@/lib/subjects";
import { SEED_DECKS } from "@/lib/seed-decks";
import { accentText } from "@/lib/accent";
import type { Deck, Subject } from "@/lib/types";
import { useProfile } from "./ProfileProvider";
import { Wordmark } from "./Wordmark";

export function Arcade() {
  const { profile, ready, bestFor, setComfortReading } = useProfile();

  const decksBySubject = useMemo(() => {
    const map = new Map<string, Deck[]>();
    for (const s of SUBJECTS) map.set(s.id, []);
    for (const d of [...SEED_DECKS, ...profile.customDecks]) {
      map.get(d.subjectId)?.push(d);
    }
    return map;
  }, [profile.customDecks]);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-8 sm:pt-12">
      {/* Header */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <p className="text-muted max-w-md text-sm">
            Say it out loud, then flip. Beat your best, keep the streak.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DayStreak count={profile.dayStreak} />
          <ComfortToggle
            on={profile.comfortReading}
            onChange={setComfortReading}
          />
        </div>
      </header>

      {/* Subjects + decks */}
      <div className="mt-10 flex flex-col gap-10">
        {SUBJECTS.map((subject) => (
          <SubjectSection
            key={subject.id}
            subject={subject}
            decks={decksBySubject.get(subject.id) ?? []}
            bestFor={bestFor}
            ready={ready}
          />
        ))}
      </div>

      <footer className="text-muted/70 mt-16 text-center text-xs">
        What&rsquo;s done in here stays in here. It&rsquo;s just for you.
      </footer>
    </main>
  );
}

function SubjectSection({
  subject,
  decks,
  bestFor,
  ready,
}: {
  subject: Subject;
  decks: Deck[];
  bestFor: (id: string) => number;
  ready: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="flex items-baseline gap-2">
          <span
            className={`font-display text-xl font-600 ${accentText[subject.accent]}`}
          >
            {subject.name}
          </span>
          {subject.board && (
            <span className="text-muted text-xs">{subject.board}</span>
          )}
        </h2>
        <Link
          href={`/new?subject=${subject.id}`}
          className="text-muted hover:text-ink text-sm transition-colors"
        >
          + New deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <Link
          href={`/new?subject=${subject.id}`}
          className="border-white/8 bg-card hover:border-white/15 flex items-center gap-3 rounded-2xl border border-dashed px-4 py-5 transition-colors"
        >
          <span className="text-2xl">✨</span>
          <span className="text-muted text-sm">{subject.blurb}</span>
        </Link>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <DeckTile
              key={deck.id}
              deck={deck}
              subject={subject}
              best={ready ? bestFor(deck.id) : 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DeckTile({
  deck,
  subject,
  best,
}: {
  deck: Deck;
  subject: Subject;
  best: number;
}) {
  if (deck.comingSoon) {
    return (
      <div className="border-white/6 bg-card/50 flex flex-col justify-between rounded-2xl border p-4 opacity-60">
        <div className="text-ink/80 font-display font-500">{deck.title}</div>
        <div className="text-muted mt-3 text-xs">Coming soon</div>
      </div>
    );
  }

  return (
    <Link
      href={`/play/${deck.id}`}
      className="group border-white/8 bg-card hover:border-white/20 relative flex flex-col justify-between rounded-2xl border p-4 transition-all hover:-translate-y-0.5 card-glow"
    >
      <div>
        <div className="text-ink font-display font-500 leading-snug">
          {deck.title}
        </div>
        <div className="text-muted mt-1 text-xs">
          {deck.cards.length} cards
          {deck.source === "ai" && " · made by AI"}
          {deck.source === "handmade" && " · your deck"}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        {best > 0 ? (
          <span className="text-amber text-glow-amber text-sm font-600">
            ★ Best {best}
          </span>
        ) : (
          <span className="text-muted/70 text-xs">No best yet</span>
        )}
        <span
          className={`text-sm ${accentText[subject.accent]} opacity-0 transition-opacity group-hover:opacity-100`}
        >
          Play →
        </span>
      </div>
    </Link>
  );
}

function DayStreak({ count }: { count: number }) {
  return (
    <div
      className="border-magenta/30 bg-magenta/10 flex items-center gap-2 rounded-full border px-3 py-1.5"
      title="Daily streak — play every day to keep it alive"
    >
      <span className="text-base leading-none">🔥</span>
      <div className="leading-tight">
        <div className="text-magenta text-glow-magenta font-display text-sm font-600">
          {count} day{count === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function ComfortToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="border-white/10 bg-card hover:border-white/20 flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors"
      title="Comfort reading — larger, roomier text"
    >
      <span className="text-muted text-xs">Comfort</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${
          on ? "bg-cyan" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-base transition-all ${
            on ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
