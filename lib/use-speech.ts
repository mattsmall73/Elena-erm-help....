"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Reads text aloud with the browser's own voice. No key, no cost, nothing
 * sent anywhere.
 *
 * Text goes in as chunks, each with an id, and is spoken one chunk at a time.
 * `current` is the id being spoken, so the page can mark the paragraph she is
 * hearing. Following the words while hearing them is most of the point for a
 * dyslexic reader, and it also gets round Chrome cutting off one long
 * utterance part way through.
 *
 * `group` says which button started it, so only that button turns into
 * "Stop reading".
 */
export type Chunk = { id: string; text: string };

/** Paragraphs as the feedback panel shows them: split on blank lines. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* Hints are fragments joined by a middle dot. Read as written, a voice says
   "dot" or runs them together, so the dots become pauses. */
function speakable(text: string): string {
  return text.replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
}

export function useSpeech() {
  const supported = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );
  const [current, setCurrent] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  /* Bumped on every start and stop, so events from a run that has been
     replaced cannot clear the marks of the one that replaced it. */
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setCurrent(null);
    setGroup(null);
  }, []);

  const say = useCallback((name: string, chunks: Chunk[]) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const mine = ++run.current;
    const items = chunks
      .map((c) => ({ ...c, text: speakable(c.text) }))
      .filter((c) => c.text);
    if (items.length === 0) return;

    const voices = synth.getVoices();
    const voice =
      voices.find((v) => v.lang === "en-GB" && /natural|online|google/i.test(v.name)) ??
      voices.find((v) => v.lang === "en-GB") ??
      voices.find((v) => v.lang.startsWith("en"));

    setGroup(name);
    items.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c.text);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-GB";
      u.rate = 0.95;
      u.onstart = () => {
        if (run.current === mine) setCurrent(c.id);
      };
      if (i === items.length - 1) {
        const done = () => {
          if (run.current !== mine) return;
          setCurrent(null);
          setGroup(null);
        };
        u.onend = done;
        u.onerror = done;
      }
      synth.speak(u);
    });
  }, []);

  /* Nothing keeps talking after she leaves the page. */
  useEffect(
    () => () => {
      run.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, current, group, say, stop };
}

export type Speech = ReturnType<typeof useSpeech>;

/** The mark a chunk gets while it is being read. */
export const SPEAKING = "rounded-sm bg-[#efe6c8]";
