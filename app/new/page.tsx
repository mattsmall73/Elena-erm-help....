"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { SUBJECTS, getSubject } from "@/lib/subjects";
import { accentText } from "@/lib/accent";
import type { Card, Deck } from "@/lib/types";
import { useProfile } from "@/components/ProfileProvider";
import { Wordmark } from "@/components/Wordmark";

type Mode = "ai" | "hand";
interface DraftCard {
  prompt: string;
  answer: string;
}

export default function NewDeckPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <div className="text-muted animate-pulse">Loading…</div>
        </main>
      }
    >
      <NewDeck />
    </Suspense>
  );
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `deck-${crypto.randomUUID()}`;
  }
  return `deck-${Date.now()}`;
}

function NewDeck() {
  const params = useSearchParams();
  const router = useRouter();
  const { saveCustomDeck } = useProfile();

  const initialSubject = params.get("subject") ?? SUBJECTS[0].id;
  const [subjectId, setSubjectId] = useState(initialSubject);
  const subject = getSubject(subjectId)!;
  const [mode, setMode] = useState<Mode>("ai");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-muted hover:text-ink text-sm transition-colors"
        >
          ← Arcade
        </Link>
        <Wordmark small />
      </div>

      <h1 className="text-ink mt-6 font-display text-2xl font-600">
        New deck
      </h1>

      {/* Subject picker */}
      <div className="mt-4">
        <div className="text-muted mb-2 text-xs">Subject</div>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubjectId(s.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                s.id === subjectId
                  ? `border-white/25 bg-white/10 ${accentText[s.accent]}`
                  : "border-white/10 text-muted hover:border-white/20"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <ModeButton
          active={mode === "ai"}
          onClick={() => setMode("ai")}
          label="Make it with AI"
          icon="✨"
        />
        <ModeButton
          active={mode === "hand"}
          onClick={() => setMode("hand")}
          label="Build it myself"
          icon="✍️"
        />
      </div>

      <div className="mt-6">
        {mode === "ai" ? (
          <AiBuilder
            subjectId={subjectId}
            requiresContext={subject.requiresContext}
            onSave={(deck, play) => {
              saveCustomDeck(deck);
              router.push(play ? `/play/${deck.id}` : "/");
            }}
          />
        ) : (
          <HandBuilder
            subjectId={subjectId}
            onSave={(deck, play) => {
              saveCustomDeck(deck);
              router.push(play ? `/play/${deck.id}` : "/");
            }}
          />
        )}
      </div>
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-display font-500 transition-all ${
        active
          ? "border-cyan/50 bg-cyan/10 text-ink glow-cyan"
          : "border-white/10 text-muted hover:border-white/20"
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

// --------------------------- AI builder ---------------------------
function AiBuilder({
  subjectId,
  requiresContext,
  onSave,
}: {
  subjectId: string;
  requiresContext: boolean;
  onSave: (deck: Deck, play: boolean) => void;
}) {
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState<DraftCard[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canGenerate =
    !loading && (!requiresContext || Boolean(topic.trim() || notes.trim() || image));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setCards(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, topic, notes, image }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't make that deck.");
        return;
      }
      setTitle(data.title);
      setCards(data.cards);
    } catch {
      setError("Couldn't reach the deck-maker. Check your connection?");
    } finally {
      setLoading(false);
    }
  }

  function save(play: boolean) {
    if (!cards) return;
    const clean = toCards(cards);
    if (clean.length === 0) return;
    onSave(
      {
        id: newId(),
        subjectId: subjectId as Deck["subjectId"],
        title: title.trim() || "My deck",
        cards: clean,
        source: "ai",
        createdAt: Date.now(),
      },
      play,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Topic">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Cell biology, Trig ratios, Enzymes…"
          className="input"
        />
      </Field>

      <Field
        label={requiresContext ? "Your notes (topic or notes needed)" : "Your notes (optional)"}
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Paste notes or a revision-guide page here…"
          className="input resize-y"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="border-white/15 text-muted hover:border-white/25 rounded-xl border px-3 py-2 text-sm transition-colors"
        >
          📷 {image ? "Change photo" : "Add a photo"}
        </button>
        {image && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="Your notes"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={() => {
                setImage(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="text-muted hover:text-ink text-xs"
            >
              remove
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
      </div>

      {requiresContext && (
        <p className="text-muted/80 text-xs">
          This subject follows your school&rsquo;s specific choices, so I need a
          topic or your notes — otherwise I&rsquo;d make confident, wrong cards.
        </p>
      )}

      <button
        type="button"
        disabled={!canGenerate}
        onClick={generate}
        className="bg-cyan text-[#131024] hover:brightness-110 glow-cyan w-full rounded-2xl px-6 py-3.5 font-display text-lg font-600 transition-all active:scale-[0.99] disabled:opacity-40 disabled:hover:brightness-100"
      >
        {loading ? "Making cards…" : "✨ Make the deck"}
      </button>

      {error && (
        <div className="border-nope/40 bg-nope/10 text-nope rounded-xl border px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {cards && (
        <div className="mt-2">
          <Field label="Deck title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
            />
          </Field>
          <div className="text-muted mb-2 mt-4 text-xs">
            {cards.length} cards — tweak anything before you save
          </div>
          <CardEditor
            cards={cards}
            setCards={
              setCards as React.Dispatch<React.SetStateAction<DraftCard[]>>
            }
          />
          <SaveBar onSave={save} disabled={toCards(cards).length === 0} />
        </div>
      )}
    </div>
  );
}

// --------------------------- Hand builder ---------------------------
function HandBuilder({
  subjectId,
  onSave,
}: {
  subjectId: string;
  onSave: (deck: Deck, play: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState<DraftCard[]>([
    { prompt: "", answer: "" },
    { prompt: "", answer: "" },
  ]);

  const clean = useMemo(() => toCards(cards), [cards]);

  function save(play: boolean) {
    if (clean.length === 0) return;
    onSave(
      {
        id: newId(),
        subjectId: subjectId as Deck["subjectId"],
        title: title.trim() || "My deck",
        cards: clean,
        source: "handmade",
        createdAt: Date.now(),
      },
      play,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Deck title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Macbeth quotes"
          className="input"
        />
      </Field>
      <p className="text-muted/80 text-xs">
        Typing your own cards counts as revision too. Keep answers short enough
        to say out loud.
      </p>
      <CardEditor cards={cards} setCards={setCards} />
      <button
        type="button"
        onClick={() => setCards((c) => [...c, { prompt: "", answer: "" }])}
        className="border-white/15 text-muted hover:border-white/25 rounded-xl border border-dashed px-4 py-2.5 text-sm transition-colors"
      >
        + Add another card
      </button>
      <SaveBar onSave={save} disabled={clean.length === 0} />
    </div>
  );
}

// --------------------------- shared bits ---------------------------
function CardEditor({
  cards,
  setCards,
}: {
  cards: DraftCard[];
  setCards: React.Dispatch<React.SetStateAction<DraftCard[]>>;
}) {
  function update(i: number, key: keyof DraftCard, value: string) {
    setCards((prev) => prev.map((c, j) => (j === i ? { ...c, [key]: value } : c)));
  }
  function remove(i: number) {
    setCards((prev) => prev.filter((_, j) => j !== i));
  }
  return (
    <div className="flex flex-col gap-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-card border-white/8 rounded-2xl border p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted text-xs">Card {i + 1}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-muted/70 hover:text-nope text-xs transition-colors"
            >
              remove
            </button>
          </div>
          <input
            value={card.prompt}
            onChange={(e) => update(i, "prompt", e.target.value)}
            placeholder="Prompt (the question)"
            className="input mb-2"
          />
          <input
            value={card.answer}
            onChange={(e) => update(i, "answer", e.target.value)}
            placeholder="Answer (say this out loud)"
            className="input"
          />
        </div>
      ))}
    </div>
  );
}

function SaveBar({
  onSave,
  disabled,
}: {
  onSave: (play: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave(true)}
        className="bg-cyan text-[#131024] hover:brightness-110 glow-cyan rounded-2xl px-6 py-3.5 font-display text-lg font-600 transition-all active:scale-[0.99] disabled:opacity-40"
      >
        Save & play
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave(false)}
        className="border-white/15 text-ink hover:border-white/30 rounded-2xl border px-6 py-3.5 font-display text-lg font-600 transition-all disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-muted mb-1.5 text-xs">{label}</div>
      {children}
    </label>
  );
}

function toCards(draft: DraftCard[]): Card[] {
  return draft
    .filter((c) => c.prompt.trim() && c.answer.trim())
    .map((c, i) => ({
      id: `c-${i}`,
      prompt: c.prompt.trim(),
      answer: c.answer.trim(),
    }));
}
