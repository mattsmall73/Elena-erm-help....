"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Source } from "@/lib/revision-db";

/**
 * The reading source, beside the question.
 *
 * Every line is numbered, because the questions say "lines 6 to 14" and the
 * marker points her at lines by number. The lines a question limits her to
 * are marked and the rest dimmed, so finding them is not a job in itself.
 * Dimming can be turned off, since some days the whole page is easier.
 *
 * Set in the sans body face on the tinted card rather than the serif reading
 * face the questions use: an unbroken page of serif text on white is the
 * hardest kind of page for a dyslexic reader, and this is the longest piece of
 * text anywhere in the app.
 *
 * Read aloud uses the browser's own voice, so it costs nothing and needs no
 * key. It speaks a line at a time and marks the line it is on, which is the
 * thing that makes listening and reading together work.
 */
export default function SourcePanel({
  source,
  focus,
  pointLine,
}: {
  source: Source;
  focus?: { from: number; to: number };
  /** A line to draw the eye to, such as where a tick-box answer is. */
  pointLine?: number;
}) {
  const [dim, setDim] = useState(true);
  /* Phones only. On a small screen the source would push the question out of
     sight, so it folds to one bar until she opens it. On a laptop it is
     always open beside the question. */
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  /* Read from the browser rather than set in an effect. False on the server,
     so the first render matches and the button appears once it is known. */
  const canSpeak = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stopped = useRef(false);

  const breaks = new Set(source.breaks);
  const inFocus = (n: number) => !focus || (n >= focus.from && n <= focus.to);

  /* Bring the lines that matter into view inside the panel, without moving
     the page. Runs when the question changes, and again when a tick-box
     answer points at a line. */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const target = pointLine || focus?.from;
    if (!target) {
      box.scrollTop = 0;
      return;
    }
    const el = box.querySelector<HTMLElement>(`[data-line="${target}"]`);
    if (!el) return;
    const top = el.offsetTop - box.offsetTop;
    // Leave it alone if the line is already in view, so pointing at line 2
    // does not scroll line 1 out of sight.
    const visible =
      top >= box.scrollTop && top + el.offsetHeight <= box.scrollTop + box.clientHeight;
    if (!visible) box.scrollTop = Math.max(0, top - 12);
  }, [focus?.from, focus?.to, pointLine, source]);

  /* Stop talking when the question changes or the panel goes. */
  useEffect(() => {
    return () => {
      stopped.current = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [source, focus?.from, focus?.to]);

  function stop() {
    stopped.current = true;
    window.speechSynthesis.cancel();
    setReading(null);
  }

  function read(from: number, to: number) {
    const synth = window.speechSynthesis;
    synth.cancel();
    stopped.current = false;

    const voices = synth.getVoices();
    const voice =
      voices.find((v) => v.lang === "en-GB" && /natural|online|google/i.test(v.name)) ??
      voices.find((v) => v.lang === "en-GB") ??
      voices.find((v) => v.lang.startsWith("en"));

    // One utterance per line, queued, so the line being read can be marked.
    for (let n = from; n <= to; n++) {
      const u = new SpeechSynthesisUtterance(source.lines[n - 1]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-GB";
      u.rate = 0.92;
      u.onstart = () => {
        if (!stopped.current) setReading(n);
      };
      if (n === to) {
        u.onend = () => setReading(null);
      }
      synth.speak(u);
    }
  }

  const last = source.lines.length;

  return (
    <section
      aria-label="The source"
      className="border-calm-line bg-calm-card border"
    >
      <div className="border-calm-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <span className="text-calm-plum text-sm font-medium">The source</span>
        {focus && (
          <span className="text-calm-soft text-sm">
            {focus.from === focus.to
              ? `Line ${focus.from} is marked`
              : `Lines ${focus.from} to ${focus.to} are marked`}
          </span>
        )}
        <span className="flex-1" />
        <button
          className="text-calm-ink border-calm-line rounded-sm border px-3 py-1 text-sm lg:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Hide the source" : "Show the source"}
        </button>
        {focus && (
          <button
            className="text-calm-soft hover:text-calm-ink text-sm hover:underline"
            onClick={() => setDim(!dim)}
            aria-pressed={!dim}
          >
            {dim ? "show all lines evenly" : "dim the other lines"}
          </button>
        )}
      </div>

      <div className={open ? "block" : "hidden lg:block"}>
      {canSpeak && (
        <div className="border-calm-line flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          {reading === null ? (
            <>
              <button
                className="border-calm-line text-calm-ink hover:border-calm-soft rounded-sm border px-3 py-1.5 text-sm"
                onClick={() => read(focus?.from ?? 1, focus?.to ?? last)}
              >
                {focus ? "Read the marked lines to me" : "Read it to me"}
              </button>
              {focus && (
                <button
                  className="text-calm-soft hover:text-calm-ink text-sm hover:underline"
                  onClick={() => read(1, last)}
                >
                  read all of it
                </button>
              )}
            </>
          ) : (
            <button
              className="border-calm-ink bg-calm-ink text-calm-card rounded-sm border px-3 py-1.5 text-sm"
              onClick={stop}
            >
              Stop reading
            </button>
          )}
        </div>
      )}

      <div
        ref={boxRef}
        className="max-h-[60vh] overflow-y-auto px-4 py-4 lg:max-h-[calc(100vh-11rem)]"
      >
        {source.intro && (
          <p className="text-calm-soft border-calm-line mb-4 border-l-2 pl-3 text-[0.95rem] leading-relaxed">
            {source.intro}
          </p>
        )}
        <ol className="font-body text-[1.05rem] leading-[1.7]">
          {source.lines.map((line, i) => {
            const n = i + 1;
            const marked = !!focus && inFocus(n);
            const faded = dim && !!focus && !marked;
            const pointed = pointLine === n;
            const speaking = reading === n;
            return (
              <li
                key={n}
                data-line={n}
                className={
                  "mb-1 grid grid-cols-[2.25rem_1fr] gap-2 rounded-sm pr-1 " +
                  (breaks.has(n) ? "mt-3 " : "") +
                  (speaking
                    ? "bg-[#efe6c8] "
                    : pointed
                      ? "bg-[#e7f0ea] outline-calm-moss outline-1 "
                      : marked
                        ? "bg-[#f1ecf4] "
                        : "")
                }
              >
                <span
                  className={
                    "pt-[0.2rem] text-right text-xs tabular-nums select-none " +
                    (marked || pointed ? "text-calm-plum font-medium" : "text-calm-soft")
                  }
                  aria-hidden="true"
                >
                  {n}
                </span>
                <span className={faded ? "text-calm-ink/40" : "text-calm-ink"}>
                  <span className="sr-only">Line {n}: </span>
                  {line}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      </div>
    </section>
  );
}
