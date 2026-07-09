"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck, MarkResult } from "@/lib/types";
import {
  currentCard,
  mark,
  nextMultiplier,
  startRound,
  type RoundState,
} from "@/lib/round";
import { useProfile } from "./ProfileProvider";

interface Outcome {
  beatBest: boolean;
  best: number;
  newDayStreak: number;
  isNewDay: boolean;
}

export function Round({ deck }: { deck: Deck }) {
  const { bestFor, recordRound } = useProfile();
  const [best] = useState(() => bestFor(deck.id));
  const [state, setState] = useState<RoundState>(() => startRound(deck.cards));
  const [flipped, setFlipped] = useState(false);
  const [justNailed, setJustNailed] = useState(false);
  const [gainPop, setGainPop] = useState<number | null>(null);
  const [overtook, setOvertook] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const recordedRef = useRef(false);

  const card = currentCard(state);

  // Record the result once, when the round finishes.
  useEffect(() => {
    if (state.done && !recordedRef.current) {
      recordedRef.current = true;
      setOutcome(recordRound(deck.id, state.score));
    }
  }, [state.done, state.score, deck.id, recordRound]);

  const doMark = useCallback(
    (result: MarkResult) => {
      if (!flipped || state.done) return;
      const prevScore = state.score;
      const next = mark(state, result);

      if (result === "nailed") {
        setJustNailed(true);
        setGainPop(next.score - prevScore);
        window.setTimeout(() => setGainPop(null), 850);
      } else {
        setJustNailed(false);
      }

      // Overtaking her past self mid-round is worth a cheer.
      if (best > 0 && prevScore <= best && next.score > best && !overtook) {
        setOvertook(true);
        window.setTimeout(() => setOvertook(false), 1600);
      }

      setFlipped(false);
      setState(next);
    },
    [flipped, state, best, overtook],
  );

  const flip = useCallback(() => {
    if (!state.done) setFlipped(true);
  }, [state.done]);

  // Keyboard: space/enter to flip; 1/2/3 to self-mark. Fast, low-friction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.done) return;
      if (!flipped) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          flip();
        }
        return;
      }
      if (e.key === "1") doMark("nailed");
      else if (e.key === "2") doMark("nearly");
      else if (e.key === "3") doMark("nope");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, state.done, flip, doMark]);

  const replay = useCallback(() => {
    recordedRef.current = false;
    setOutcome(null);
    setOvertook(false);
    setJustNailed(false);
    setGainPop(null);
    setFlipped(false);
    setState(startRound(deck.cards));
  }, [deck.cards]);

  if (state.done && outcome) {
    return (
      <Finish
        deck={deck}
        score={state.score}
        nailed={state.nailed}
        total={state.total}
        outcome={outcome}
        onReplay={replay}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-10 pt-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-muted hover:text-ink text-sm transition-colors"
        >
          ← Arcade
        </Link>
        <div className="text-muted font-display text-sm">{deck.title}</div>
      </div>

      {/* HUD */}
      <Hud
        score={state.score}
        streak={state.streak}
        multiplier={nextMultiplier(state)}
        best={best}
        beaten={state.score > best && best > 0}
        gainPop={gainPop}
        resolved={state.resolved}
        total={state.total}
      />

      {overtook && (
        <div className="celebrate text-amber text-glow-amber mt-3 text-center font-display font-600">
          🎉 New best — you beat your past self!
        </div>
      )}

      {/* Card */}
      {card && (
        <div className="mt-6 flex flex-1 flex-col justify-center">
          <div className="flip-scene">
            <div
              className={`flip-inner ${flipped ? "is-flipped" : ""}`}
              style={{ minHeight: "clamp(300px, 44vh, 420px)" }}
            >
              {/* Front — prompt */}
              <div className="flip-face">
                <div className="bg-card card-glow glow-breathe flex h-full flex-col items-center justify-center rounded-3xl border border-white/10 p-7 text-center">
                  <div className="text-cyan/80 text-xs font-600 uppercase tracking-widest">
                    Say it out loud
                  </div>
                  <p className="text-ink mt-5 font-display text-2xl leading-snug sm:text-3xl">
                    {card.prompt}
                  </p>
                  <p className="text-muted mt-5 text-sm">then flip to check</p>
                </div>
              </div>

              {/* Back — answer */}
              <div className="flip-face flip-back">
                <div
                  className={`bg-card flex h-full flex-col items-center justify-center rounded-3xl border border-white/10 p-7 text-center ${
                    justNailed ? "card-glow-nailed" : "card-glow"
                  }`}
                >
                  <div className="text-muted text-xs font-600 uppercase tracking-widest">
                    The answer
                  </div>
                  <p className="text-cyan text-glow-cyan mt-4 font-display text-xl leading-snug sm:text-2xl">
                    {card.answer}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6">
            {!flipped ? (
              <button
                type="button"
                onClick={flip}
                className="bg-cyan text-[#131024] hover:brightness-110 glow-cyan w-full rounded-2xl px-6 py-4 font-display text-lg font-600 transition-all active:scale-[0.99]"
              >
                Flip
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <MarkButton
                  label="Nailed it"
                  hint="1"
                  onClick={() => doMark("nailed")}
                  className="bg-nailed text-[#131024] hover:brightness-110"
                />
                <MarkButton
                  label="Nearly"
                  hint="2"
                  onClick={() => doMark("nearly")}
                  className="bg-nearly text-[#131024] hover:brightness-110"
                />
                <MarkButton
                  label="Nope"
                  hint="3"
                  onClick={() => doMark("nope")}
                  className="bg-nope text-[#131024] hover:brightness-110"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Hud({
  score,
  streak,
  multiplier,
  best,
  beaten,
  gainPop,
  resolved,
  total,
}: {
  score: number;
  streak: number;
  multiplier: number;
  best: number;
  beaten: boolean;
  gainPop: number | null;
  resolved: number;
  total: number;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-end justify-between">
        {/* Score */}
        <div className="relative">
          <div className="text-muted text-xs">Score</div>
          <div className="text-cyan text-glow-cyan font-display text-4xl font-700 leading-none">
            {score}
          </div>
          {gainPop != null && (
            <span
              key={score}
              className="rise-fade text-cyan text-glow-cyan absolute -right-10 top-3 font-display text-xl font-700"
            >
              +{gainPop}
            </span>
          )}
        </div>

        {/* Streak */}
        <div className="text-center">
          <div className="text-muted text-xs">Streak</div>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-2xl leading-none ${streak > 0 ? "flame-pulse" : "opacity-40"}`}
            >
              🔥
            </span>
            <span className="text-magenta text-glow-magenta font-display text-2xl font-700 leading-none">
              {streak}
            </span>
            {streak > 0 && (
              <span className="text-magenta/80 font-display text-sm">
                ×{multiplier}
              </span>
            )}
          </div>
        </div>

        {/* Best to beat */}
        <div className="text-right">
          <div className="text-muted text-xs">Best to beat</div>
          <div
            className={`font-display text-2xl font-700 leading-none ${
              best > 0
                ? beaten
                  ? "text-nailed"
                  : "text-amber text-glow-amber"
                : "text-muted/50"
            }`}
          >
            {best > 0 ? (beaten ? "beaten!" : best) : "—"}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="bg-cyan h-full rounded-full transition-all duration-300"
            style={{ width: `${total ? (resolved / total) * 100 : 0}%` }}
          />
        </div>
        <div className="text-muted mt-1 text-right text-xs">
          {resolved} / {total}
        </div>
      </div>
    </div>
  );
}

function MarkButton({
  label,
  hint,
  onClick,
  className,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-3.5 font-display font-600 transition-all active:scale-[0.97] ${className}`}
    >
      <span className="text-sm sm:text-base">{label}</span>
      <span className="text-[10px] opacity-60">{hint}</span>
    </button>
  );
}

function Finish({
  deck,
  score,
  nailed,
  total,
  outcome,
  onReplay,
}: {
  deck: Deck;
  score: number;
  nailed: number;
  total: number;
  outcome: Outcome;
  onReplay: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-5 py-10 text-center">
      <div className="celebrate w-full">
        <div className="font-display text-muted text-sm uppercase tracking-widest">
          Round done
        </div>

        {outcome.beatBest ? (
          <h1 className="text-amber text-glow-amber mt-3 font-display text-3xl font-700">
            🏆 New best!
          </h1>
        ) : (
          <h1 className="text-ink mt-3 font-display text-3xl font-700">
            Nice one.
          </h1>
        )}

        <div className="bg-card card-glow mt-7 rounded-3xl border border-white/10 p-7">
          <div className="text-muted text-xs">You scored</div>
          <div className="text-cyan text-glow-cyan font-display text-6xl font-700 leading-none">
            {score}
          </div>

          <div className="mt-5 flex items-center justify-center gap-6 text-sm">
            <div>
              <div className="text-nailed font-display text-xl font-700">
                {nailed}/{total}
              </div>
              <div className="text-muted text-xs">nailed</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <div className="text-amber font-display text-xl font-700">
                {outcome.beatBest ? score : outcome.best}
              </div>
              <div className="text-muted text-xs">your best</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <div className="text-magenta text-glow-magenta font-display text-xl font-700">
                🔥 {outcome.newDayStreak}
              </div>
              <div className="text-muted text-xs">day streak</div>
            </div>
          </div>

          {!outcome.beatBest && outcome.best > score && (
            <p className="text-muted mt-5 text-sm">
              {outcome.best - score} off your best. Go again?
            </p>
          )}
          {outcome.isNewDay && outcome.newDayStreak > 1 && (
            <p className="text-magenta/90 mt-4 text-sm">
              {outcome.newDayStreak} days on the trot. Keep it lit.
            </p>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReplay}
            className="bg-cyan text-[#131024] hover:brightness-110 glow-cyan rounded-2xl px-6 py-4 font-display text-lg font-600 transition-all active:scale-[0.99]"
          >
            Go again
          </button>
          <Link
            href="/"
            className="border-white/15 text-ink hover:border-white/30 flex items-center justify-center rounded-2xl border px-6 py-4 font-display text-lg font-600 transition-all"
          >
            Arcade
          </Link>
        </div>
        <div className="text-muted/60 mt-6 text-xs">{deck.title}</div>
      </div>
    </main>
  );
}
