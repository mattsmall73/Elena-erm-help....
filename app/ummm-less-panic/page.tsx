"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { readResponse } from "@/lib/safe-json";
import { SEED_SHEET } from "@/lib/seed-sheet";
import {
  GRADE_MIN_MARKED,
  bulkSummary,
  costEstimate,
  gradeLabel,
  markLine,
  movement,
  needsMarking,
  pillLabel,
  pillState,
  runningGrade,
  type StoredMark,
} from "@/lib/marking";
import type { Question, Sheet, SheetSummary } from "@/lib/revision-db";

const BATCH = 4; // questions sent to the model at a time

/* Words in the box before the hint button stops calling itself "I'm properly
   stuck". A nudge rather than a lock: the button always opens on the first tap,
   with no counter and no message, because a locked hint on a bad day means the
   app gets closed, which costs more than a copied sentence. */
const HINT_WORD_THRESHOLD = 20;

/* Matches MIN_WORDS in the mark route. Checked here so an answer too short to
   mark is never counted in a "mark everything" total and never costs a call
   only to be turned away. */
const MARK_MIN_WORDS = 15;

/* Marks in flight at once during a "mark everything" run. Two rather than one
   halves a long wait, and rather than more because each call is a whole
   marking at high effort and there is nothing to gain by queueing them up at
   the other end. */
const MARK_ALL_CONCURRENCY = 2;

const countWords = (text: string): number => {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
};

type Screen = "sheets" | "create" | "pick" | "quiz" | "end";

interface Feedback {
  status: "marked" | "too_short";
  openingLine?: string;
  mark?: number | null;
  maxMark?: number | null;
  level?: number | null;
  maxLevel?: number | null;
  levelWording?: string;
  nextLevelMark?: number | null;
  workingWell?: string;
  oneChange?: { observation: string; why: string; task: string };
  alsoAvailable?: string[];
  factualNotes?: string[];
  spelling?: { marksAvailable: number; fixes: string[] };
  markSchemeWording?: string;
  previousMark?: number | null;
  previousLevel?: number | null;
}

interface MarkRecord extends StoredMark {
  feedback: Feedback;
  /** Epoch ms. Absent on a mark made in this session before any reload. */
  markedAt?: number;
}

/* Tailwind class groups, named once so the markup below stays readable. */
const btnSolid =
  "rounded-sm border border-calm-ink bg-calm-ink px-5 py-2 text-calm-card hover:bg-calm-ink/90 disabled:opacity-50";
const btnQuiet =
  "rounded-sm border border-calm-line px-4 py-2 text-calm-soft hover:border-calm-soft hover:text-calm-ink";
const btnBack = "text-sm text-calm-soft hover:text-calm-ink hover:underline";
const field =
  "w-full rounded-sm border border-calm-line bg-white px-3 py-2 text-calm-ink " +
  "focus:border-calm-plum focus:outline-2 focus:outline-calm-plum focus:outline-offset-1";
const label = "mb-2 block text-sm text-calm-soft";

/* Every screen sits inside this wrapper. It establishes the calm surface over
   the top of the arcade theme from the root layout.

   This lives at module scope deliberately. Declared inside the page component
   it was a new function identity on every render, so React treated each render
   as a different component type and remounted everything inside it. The answer
   textarea is inside it, so every keystroke re-rendered the page, remounted the
   box and threw away the focus: typing 42 characters left one behind. */
function Surface({
  error,
  children,
}: {
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="calm-surface bg-calm-page text-calm-ink font-body min-h-screen px-5 py-10">
      <div className="mx-auto w-full max-w-xl">
        {error && (
          <p className="mb-5 border border-[#e6cfcf] bg-[#f7eded] px-4 py-3 text-sm text-[#8a3b3b]">
            {error}
          </p>
        )}
        {children}
      </div>
    </main>
  );
}

export default function UmmmLessPanic() {
  const [screen, setScreen] = useState<Screen>("sheets");
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [queue, setQueue] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);

  const [rawTitle, setRawTitle] = useState("");
  const [rawSubject, setRawSubject] = useState("");
  const [rawQuestions, setRawQuestions] = useState("");
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState("");
  const [pupilName, setPupilName] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedNote, setSeedNote] = useState("");
  const [marks, setMarks] = useState<Record<number, MarkRecord>>({});
  const [answerTimes, setAnswerTimes] = useState<Record<number, number>>({});
  const [marking, setMarking] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllDone, setMarkAllDone] = useState(0);
  const [markAllTotal, setMarkAllTotal] = useState(0);
  const [markAllNote, setMarkAllNote] = useState("");
  const [markAllFailed, setMarkAllFailed] = useState<number[]>([]);
  const [openPanel, setOpenPanel] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<string>("");
  const [deleting, setDeleting] = useState(false);

  const barRef = useRef<HTMLElement | null>(null);
  const stopMarkAll = useRef(false);
  /* Synchronous, unlike the markingAll state behind it. Two presses landing
     before React re-renders would both read markingAll as false and start a
     second run over the same answers, paying for every one of them twice. */
  const markAllRunning = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{
    index: number;
    answer: string;
    flagged: boolean;
  } | null>(null);

  const loadSheets = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/sheets");
    const out = await readResponse<{ sheets: SheetSummary[] }>(res);
    if (out.ok) {
      setSheets(out.data.sheets);
      setError("");
    } else {
      setError(out.error);
    }
    setLoading(false);
  }, []);

  /* Loads or refreshes the history sheet without a terminal. The questions
     ship as a static file and go in through the same route a hand-built sheet
     uses, so they are validated on the way like anything else. Pressing it
     again updates the sheet in place and leaves her answers alone, which is
     what makes it safe to offer once the sheet already exists. */
  const loadHistorySheet = useCallback(async () => {
    setSeeding(true);
    setError("");
    setSeedNote("");
    try {
      const fileRes = await fetch(SEED_SHEET.path, { cache: "no-store" });
      const file = await readResponse<{
        id: string;
        title: string;
        subject: string;
        questions: Question[];
      }>(fileRes);
      if (!file.ok) {
        setError(file.error);
        return;
      }

      const saveRes = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(file.data),
      });
      const saved = await readResponse<{ id: string; created: boolean }>(saveRes);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }

      setSeedNote(
        saved.data.created
          ? "History sheet loaded."
          : "History sheet brought up to date. Your answers are still there.",
      );
      await loadSheets();
    } catch {
      setError("Couldn't load the history sheet. Check your connection?");
    } finally {
      setSeeding(false);
    }
  }, [loadSheets]);

  useEffect(() => {
    void loadSheets();
  }, [loadSheets]);

  /* Deletes a sheet and everything written on it. Both child tables cascade,
     so the answers and the marks go with it. Behind a confirm that names what
     goes, because there is no undo and nothing else in the app destroys
     anything. */
  async function removeSheet(id: string) {
    if (deleting) return;
    setDeleting(true);
    setError("");
    setSeedNote("");
    try {
      const res = await fetch(`/api/sheets/${id}`, { method: "DELETE" });
      const out = await readResponse<{ ok: boolean }>(res);
      if (!out.ok) {
        setError(out.error);
        return;
      }
      setConfirmDelete("");
      await loadSheets();
    } catch {
      setError("Couldn't reach the app to delete that. Check your connection?");
    } finally {
      setDeleting(false);
    }
  }

  async function openSheet(id: string) {
    setConfirmDelete("");
    setLoading(true);
    const res = await fetch(`/api/sheets/${id}`);
    const out = await readResponse<{
      sheet: Sheet;
      answers: Record<number, string>;
      flags: Record<number, boolean>;
      answerTimes?: Record<number, number>;
      marks?: MarkRecord[];
    }>(res);

    if (out.ok) {
      setSheet(out.data.sheet);
      setAnswers(out.data.answers);
      setFlags(out.data.flags);
      setAnswerTimes(out.data.answerTimes ?? {});
      const byIndex: Record<number, MarkRecord> = {};
      for (const m of out.data.marks ?? []) byIndex[m.questionIndex] = m;
      setMarks(byIndex);
      setError("");
      setMarkAllNote("");
      setScreen("pick");
    } else {
      setError(out.error);
    }
    setLoading(false);
  }

  /* Marks one answer. Never the whole sheet: the feedback stays on one piece
     of writing, and she can mark a single answer without starting a session.
     The running grade is worked out in code from the stored levels, so the
     marker is never asked to estimate one and never sees another answer. */
  /* Marks one answer and stores it. Returns the record so a caller can count
     what moved, or the error so a caller can decide whether to show it. A run
     of thirty of these must not flash a message per failure, which is why the
     error is returned rather than set here. */
  async function requestMark(
    idx: number,
  ): Promise<{ ok: true; record: MarkRecord } | { ok: false; error: string }> {
    if (!sheet) return { ok: false, error: "No sheet open." };
    try {
      const res = await fetch(`/api/sheets/${sheet.id}/mark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex: idx }),
      });
      const out = await readResponse<Feedback>(res);
      if (!out.ok) return { ok: false, error: out.error };

      const fb = out.data;
      const record: MarkRecord = {
        questionIndex: idx,
        mark: fb.mark ?? null,
        maxMark: fb.maxMark ?? null,
        level: fb.level ?? null,
        maxLevel: fb.maxLevel ?? null,
        previousMark: fb.previousMark ?? null,
        previousLevel: fb.previousLevel ?? null,
        markedAt: Date.now(),
        feedback: fb,
      };
      setMarks((prev) => ({ ...prev, [idx]: record }));
      return { ok: true, record };
    } catch {
      return { ok: false, error: "Couldn't reach the marker. Check your connection?" };
    }
  }

  async function markAnswer(idx: number) {
    if (!sheet || marking || markingAll) return;
    setMarking(true);
    setError("");
    setOpenPanel("");
    const out = await requestMark(idx);
    if (!out.ok) setError(out.error);
    setMarking(false);
  }

  /* Everything she has written, and nothing she has not.
     Deliberately skips an answer that already has a mark and has not been
     touched since: that mark is already on screen, and re-running it would
     spend a call to say the same thing while the movement line credited her
     with a rise she did not write. */
  function markableNow(): number[] {
    if (!sheet) return [];
    return needsMarking({
      count: sheet.questions.length,
      words: (i) => countWords(answers[i] ?? ""),
      minWords: MARK_MIN_WORDS,
      markedAt: (i) => marks[i]?.markedAt ?? (marks[i] ? 0 : null),
      answeredAt: (i) => answerTimes[i] ?? null,
    });
  }

  /* Marks the lot, a couple at a time, landing each result as it arrives so
     the page fills in rather than sitting blank. Stoppable, because a run of
     thirty is minutes long and nothing about it should feel like a commitment. */
  async function markEverything(only?: number[]) {
    if (!sheet || marking || markAllRunning.current) return;
    markAllRunning.current = true;

    const queued = only ?? markableNow();
    const blank = sheet.questions.filter(
      (_, i) => countWords(answers[i] ?? "") < MARK_MIN_WORDS,
    ).length;

    if (queued.length === 0) {
      markAllRunning.current = false;
      setMarkAllNote(
        bulkSummary({ marked: 0, movedUp: 0, words: 0, failed: 0, stopped: false, blank }),
      );
      return;
    }

    stopMarkAll.current = false;
    setError("");
    setMarkAllNote("");
    setMarkAllFailed([]);
    setMarkingAll(true);
    setMarkAllDone(0);
    setMarkAllTotal(queued.length);

    const pending = [...queued];
    let marked = 0;
    let movedUp = 0;
    let words = 0;
    const failedAt: number[] = [];
    let finished = 0;
    let lastError = "";

    const worker = async () => {
      for (;;) {
        if (stopMarkAll.current) return;
        const idx = pending.shift();
        if (idx === undefined) return;

        const out = await requestMark(idx);
        if (out.ok && out.record.feedback.status === "marked") {
          marked += 1;
          words += countWords(answers[idx] ?? "");
          const { mark, previousMark } = out.record;
          if (typeof mark === "number" && typeof previousMark === "number" && mark > previousMark) {
            movedUp += 1;
          }
        } else if (!out.ok) {
          // Kept by index rather than counted, so the ones that dropped can be
          // re-run on their own. After twenty answers she will not remember
          // which four failed, and nothing else on screen would tell her.
          failedAt.push(idx);
          lastError = out.error;
        }
        finished += 1;
        setMarkAllDone(finished);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MARK_ALL_CONCURRENCY, queued.length) }, worker),
    );

    setMarkingAll(false);
    markAllRunning.current = false;
    setMarkAllFailed(failedAt);
    setMarkAllNote(
      bulkSummary({
        marked,
        movedUp,
        words,
        failed: failedAt.length,
        stopped: stopMarkAll.current,
        blank,
      }),
    );
    // One message for the whole run, and only when nothing at all came back,
    // so a single dropped call does not read as a broken app.
    if (marked === 0 && failedAt.length > 0) setError(lastError);
  }

  async function buildSheet() {
    const lines = rawQuestions
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\u2022\d.)\s]+/, "").trim())
      .filter((l) => l.length > 8);

    if (!rawTitle.trim()) {
      setError("Give the sheet a name first.");
      return;
    }
    if (lines.length === 0) {
      setError("Paste some questions in, one per line.");
      return;
    }

    setBuilding(true);
    setError("");
    const built: Question[] = [];

    for (let i = 0; i < lines.length; i += BATCH) {
      setProgress(`Working through question ${i + 1} of ${lines.length}`);
      const res = await fetch("/api/sheets/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: rawSubject, questions: lines.slice(i, i + BATCH) }),
      });
      const out = await readResponse<{ questions: Question[] }>(res);
      if (!out.ok) {
        setError(out.error + ` Stopped at question ${i + 1}, nothing was saved.`);
        setBuilding(false);
        setProgress("");
        return;
      }
      built.push(...out.data.questions);
    }

    setProgress("Saving the sheet");
    const saveRes = await fetch("/api/sheets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: rawTitle.trim(), subject: rawSubject.trim(), questions: built }),
    });
    const saved = await readResponse<{ id: string }>(saveRes);

    setBuilding(false);
    setProgress("");

    if (!saved.ok) {
      setError(saved.error);
      return;
    }

    setRawTitle("");
    setRawSubject("");
    setRawQuestions("");
    await loadSheets();
    await openSheet(saved.data.id);
  }

  function startRun(kind: string) {
    if (!sheet) return;
    const all = sheet.questions.map((_, i) => i);
    let picked: number[];

    if (kind === "three") {
      const pool = [...all];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      picked = pool.slice(0, 3);
    } else if (kind === "unanswered") {
      picked = all.filter((i) => !(answers[i] ?? "").trim());
    } else if (kind === "flagged") {
      picked = all.filter((i) => flags[i]);
    } else if (["short", "long", "judge"].includes(kind)) {
      picked = all.filter((i) => sheet.questions[i].type === kind);
    } else {
      picked = all;
    }

    setQueue(picked.length ? picked : all);
    setPos(0);
    setHintsShown(0);
    setScreen("quiz");
  }

  /* Send whatever is waiting, now. */
  function sendSave() {
    const p = pendingSave.current;
    if (!p || !sheet) return;
    pendingSave.current = null;
    void fetch(`/api/sheets/${sheet.id}/answers`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionIndex: p.index,
        answer: p.answer,
        flagged: p.flagged,
      }),
    }).catch(() => {
      /* typing must not be interrupted by a failed save; the next
         keystroke tries again and the text is still on screen */
    });
  }

  function persist(index: number, answer: string, flagged: boolean) {
    if (!sheet) return;
    /* One timer serves every question, so a save queued for a different
       question has to go before this one replaces it. Without that, jumping
       from question 36 to question 12 and typing inside the same second
       throws away what she wrote on 36. */
    if (pendingSave.current && pendingSave.current.index !== index) sendSave();
    pendingSave.current = { index, answer, flagged };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(sendSave, 700);
  }

  /* Called before leaving a question, so nothing is in flight while the
     screen shows a different one. */
  function flushSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    sendSave();
  }

  /* Move to another question in the run without parking the one being left.
     That is what the bar at the top and the previous and next links do.
     Come back to this, at the bottom, is now the only control that records a
     decision; Done moves on and clears a park, and nothing else. */
  function goTo(next: number) {
    if (next === pos || next < 0 || next >= queue.length) return;
    flushSave();
    setPos(next);
    setHintsShown(0);
    setOpenPanel("");
    window.scrollTo({ top: 0 });
  }

  function onType(text: string) {
    const idx = queue[pos];
    setAnswers((a) => ({ ...a, [idx]: text }));
    // Stamped here rather than read back from the server, so an answer she
    // rewrites and then marks-everything in the same sitting is seen as newer
    // than its mark. The server sets the real value; this only has to be later
    // than the mark it is compared against.
    setAnswerTimes((t) => ({ ...t, [idx]: Date.now() }));
    persist(idx, text, !!flags[idx]);
  }

  function advance(flagIt: boolean) {
    const idx = queue[pos];
    if (flagIt) {
      setFlags((f) => ({ ...f, [idx]: true }));
      persist(idx, answers[idx] ?? "", true);
    } else {
      // Nothing to record for Done itself. The bar reads the answer, so a
      // question turns green by having words in it rather than by being
      // declared finished.
      if (flags[idx]) {
        setFlags((f) => {
          const next = { ...f };
          delete next[idx];
          return next;
        });
        persist(idx, answers[idx] ?? "", false);
      }
    }
    setHintsShown(0);
    flushSave();
    if (pos + 1 >= queue.length) setScreen("end");
    else setPos(pos + 1);
    window.scrollTo({ top: 0 });
  }

  function exportAnswers() {
    if (!sheet) return;
    const written = sheet.questions
      .map((q, i) => ({ q, i }))
      .filter(({ i }) => (answers[i] ?? "").trim());

    if (written.length === 0) {
      setError("Nothing written yet.");
      return;
    }

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const when = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const body = written
      .map(
        ({ q, i }) => `
      <section>
        <p class="lab">${esc(q.label)}</p>
        <p class="q">${esc(q.prompt)}</p>
        ${q.given ? `<p class="g">${esc(q.given)}</p>` : ""}
        <div class="a">${esc((answers[i] ?? "").trim())}</div>
        <div class="mark"><span>Marks</span><span>Comment</span></div>
      </section>`
      )
      .join("");

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${pupilName ? esc(pupilName) + " " : ""}${esc(sheet.title)}</title><style>
body{font-family:Georgia,serif;max-width:44rem;margin:2.5rem auto;padding:0 1.5rem;color:#1c1b22;line-height:1.55}
header{border-bottom:1px solid #bbb;padding-bottom:.8rem;margin-bottom:2rem}
h1{font-size:1.4rem;font-weight:400;margin:0 0 .3rem}
header p{margin:0;color:#666;font-size:.9rem;font-family:system-ui,sans-serif}
section{margin-bottom:2rem;page-break-inside:avoid}
.lab{font-family:system-ui,sans-serif;font-size:.75rem;color:#7a7686;margin:0 0 .25rem}
.q{font-weight:bold;margin:0 0 .3rem}
.g{font-style:italic;color:#666;font-size:.9rem;margin:0 0 .7rem}
.a{white-space:pre-wrap;border-left:3px solid #ddd;padding:.2rem 0 .2rem 1rem}
.mark{display:flex;gap:1rem;margin-top:.8rem;font-family:system-ui,sans-serif;font-size:.8rem;color:#888}
.mark span{border-bottom:1px dotted #bbb;padding-bottom:1.1rem}
.mark span:first-child{width:6rem}.mark span:last-child{flex:1}
@media print{body{margin:0}}
</style></head><body><header><h1>${esc(sheet.title)}</h1>
<p>${pupilName ? esc(pupilName) + " &middot; " : ""}${when} &middot; ${written.length} of ${sheet.questions.length} answered</p>
</header>${body}</body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (pupilName ? pupilName.trim().replace(/\s+/g, "-").toLowerCase() + "-" : "") +
      sheet.id +
      ".html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* Worked out here, in code, from the stored levels. Nothing below five
     marked answers, because fewer than that swings by two grades and means
     nothing, and a single answer never carries a grade at all. */
  const grade = runningGrade(Object.values(marks));

  const hasSeedSheet = sheets.some(
    (s) => s.id === SEED_SHEET.id || s.title === SEED_SHEET.title,
  );

  const h1 = "font-read mb-4 text-3xl leading-tight font-normal sm:text-4xl";
  const lede = "text-calm-soft mb-6 max-w-lg";

  if (screen === "sheets") {
    return (
      <Surface error={error}>
        <Link href="/" className={btnBack + " mb-4 inline-block"}>
          &larr; Elena&apos;s Apps
        </Link>
        <h1 className={h1}>Ummm Less Panic!</h1>
        <p className={lede}>
          Pick a sheet, or make a new one from questions you have been given. One question
          at a time, nothing timed, nothing scored.
        </p>

        {loading && <p className="text-calm-soft text-sm">Loading your sheets</p>}

        <div className="border-calm-line mb-6 border-t">
          {sheets.map((s) => (
            <div key={s.id} className="border-calm-line border-b">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void openSheet(s.id)}
                  className="hover:bg-calm-card flex-1 px-1 py-4 text-left"
                >
                  <span className="font-read block text-xl">{s.title}</span>
                  <span className="text-calm-soft mt-0.5 block text-sm">
                    {s.subject ? s.subject + " · " : ""}
                    {s.question_count} questions
                  </span>
                </button>
                {confirmDelete !== s.id && (
                  <button
                    onClick={() => setConfirmDelete(s.id)}
                    className={btnBack + " shrink-0 px-2"}
                    aria-label={`Delete ${s.title}`}
                  >
                    delete
                  </button>
                )}
              </div>

              {confirmDelete === s.id && (
                <div
                  role="alertdialog"
                  aria-label={`Delete ${s.title}?`}
                  className="border-[#e6cfcf] bg-[#f7eded] mb-4 border px-4 py-3"
                >
                  <p className="text-[#8a3b3b] mb-3 text-sm">
                    Delete {s.title}? Its {s.question_count} questions go, and so
                    does anything you have written or had marked on it. There is
                    no undo.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className={btnQuiet}
                      disabled={deleting}
                      onClick={() => setConfirmDelete("")}
                    >
                      Keep it
                    </button>
                    <button
                      className="rounded-sm border border-[#8a3b3b] bg-[#8a3b3b] px-5 py-2 text-[#f7eded] hover:bg-[#7a3333] disabled:opacity-50"
                      disabled={deleting}
                      onClick={() => void removeSheet(s.id)}
                    >
                      {deleting ? "deleting…" : "Delete it"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!loading && sheets.length === 0 && (
            <div className="py-4">
              <p className="text-calm-soft mb-4 text-sm">
                No sheets yet. Load the history one to get going, or make your own
                from questions you have been given.
              </p>
              <button
                className={btnQuiet}
                disabled={seeding}
                onClick={() => void loadHistorySheet()}
              >
                {seeding ? "Loading it in…" : "Load the history sheet"}
              </button>
            </div>
          )}
        </div>

        <button
          className={btnSolid}
          onClick={() => {
            setError("");
            setScreen("create");
          }}
        >
          Make a new sheet
        </button>

        {seedNote && (
          <p className="text-calm-moss mt-4 text-sm" role="status">
            {seedNote}
          </p>
        )}

        {/* Shown whenever there is at least one sheet, so the history sheet is
            still reachable if she made her own first. The empty state has its
            own copy of this with the explanation. */}
        {!loading && sheets.length > 0 && (
          <p className="mt-6">
            <button
              className={btnBack}
              disabled={seeding}
              onClick={() => void loadHistorySheet()}
            >
              {seeding
                ? hasSeedSheet
                  ? "bringing it up to date…"
                  : "loading it in…"
                : hasSeedSheet
                  ? "bring the history sheet up to date"
                  : "load the history sheet"}
            </button>
          </p>
        )}
      </Surface>
    );
  }

  if (screen === "create") {
    return (
      <Surface error={error}>
        <button onClick={() => setScreen("sheets")} className={btnBack + " mb-4 block"}>
          back to sheets
        </button>
        <h1 className={h1}>Make a new sheet</h1>
        <p className={lede}>
          Paste your questions in, one per line. Bullets and numbers get stripped out, so
          you can paste straight from a worksheet.
        </p>

        <label className={label} htmlFor="title">
          What is this sheet called
        </label>
        <input
          id="title"
          className={field}
          value={rawTitle}
          onChange={(e) => setRawTitle(e.target.value)}
          placeholder="Paper 2, Medicine through time"
        />

        <label className={label + " mt-4"} htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          className={field}
          value={rawSubject}
          onChange={(e) => setRawSubject(e.target.value)}
          placeholder="History, Biology, RS"
        />

        <label className={label + " mt-4"} htmlFor="qs">
          Your questions
        </label>
        <textarea
          id="qs"
          rows={12}
          className={field + " font-read resize-y leading-relaxed"}
          value={rawQuestions}
          onChange={(e) => setRawQuestions(e.target.value)}
          placeholder={"Describe one feature of...\nExplain why...\n'Statement.' How far do you agree?"}
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className={btnSolid} onClick={() => void buildSheet()} disabled={building}>
            {building ? "Building" : "Build my sheet"}
          </button>
          {building && <span className="text-calm-soft text-sm">{progress}</span>}
        </div>
        {building && (
          <p className="text-calm-soft mt-3 text-sm">
            A long list takes about a minute. It goes through them in small batches so
            nothing gets dropped.
          </p>
        )}
      </Surface>
    );
  }

  if (screen === "pick" && sheet) {
    const counts: Record<string, number> = { short: 0, long: 0, judge: 0 };
    sheet.questions.forEach((q) => (counts[q.type] = (counts[q.type] ?? 0) + 1));
    const unanswered = sheet.questions.filter((_, i) => !(answers[i] ?? "").trim()).length;
    const flagged = Object.keys(flags).length;

    return (
      <Surface error={error}>
        <button onClick={() => setScreen("sheets")} className={btnBack + " mb-4 block"}>
          back to sheets
        </button>
        <h1 className={h1}>{sheet.title}</h1>
        <p className={lede}>
          {sheet.questions.length} questions in here. You do not have to look at{" "}
          {sheet.questions.length} questions. Pick a size and it will show you one at a time.
        </p>

        <GradeStrip grade={grade} marked={Object.keys(marks).length} />

        <MarkAllPanel
          ready={markableNow().length}
          running={markingAll}
          done={markAllDone}
          total={markAllTotal}
          note={markAllNote}
          failed={markAllFailed.length}
          busy={marking}
          onStart={() => void markEverything()}
          onRetry={() => void markEverything(markAllFailed)}
          onStop={() => {
            stopMarkAll.current = true;
          }}
        />

        <div className="border-calm-line border-t">
          <Choice n={3} t="Three to start" d="Picked at random. Enough to prove the day is not a write-off." onClick={() => startRun("three")} />
          {unanswered > 0 && (
            <Choice n={unanswered} t="The ones I have not done" d="Skips anything you have already written." onClick={() => startRun("unanswered")} />
          )}
          {flagged > 0 && (
            <Choice n={flagged} t="The ones I parked" d="Everything you said you would come back to." onClick={() => startRun("flagged")} />
          )}
          {counts.short > 0 && <Choice n={counts.short} t="Short answers" d="The quick ones." onClick={() => startRun("short")} />}
          {counts.long > 0 && <Choice n={counts.long} t="Extended answers" d="The ones that need paragraphs." onClick={() => startRun("long")} />}
          {counts.judge > 0 && <Choice n={counts.judge} t="How far do you agree" d="Both sides, then a verdict." onClick={() => startRun("judge")} />}
          <Choice n={sheet.questions.length} t="Everything" d="In order." onClick={() => startRun("all")} />
        </div>
      </Surface>
    );
  }

  if (screen === "quiz" && sheet) {
    const idx = queue[pos];
    const q = sheet.questions[idx];
    const text = answers[idx] ?? "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    return (
      <Surface error={error}>
        <nav
          ref={barRef}
          aria-label="The questions in this run"
          className="mb-3 flex flex-wrap"
          onKeyDown={(e) => {
            const step =
              e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = pos + step;
            if (next < 0 || next >= queue.length) return;
            goTo(next);
            /* Keep the focus on the bar rather than leaving it on a segment
               that is no longer the current one. */
            barRef.current?.querySelectorAll("button")[next]?.focus();
          }}
        >
          {queue.map((qi, n) => {
            const p = pillState({
              isCurrent: n === pos,
              isParked: !!flags[qi],
              hasWords: countWords(answers[qi] ?? "") > 0,
              isMarked: !!marks[qi],
            });
            return (
              <button
                key={n}
                type="button"
                /* One tab stop for the whole bar, then the arrow keys, instead
                   of tabbing through thirty-nine of them to reach the answer. */
                tabIndex={n === pos ? 0 : -1}
                aria-current={n === pos ? "step" : undefined}
                aria-label={pillLabel(n + 1, queue.length, p)}
                onClick={() => goTo(n)}
                className={
                  "group cursor-pointer rounded-sm px-0.5 py-2.5 focus:outline-none " +
                  "focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-calm-ink"
                }
              >
                {/* The bar sits on a fixed baseline inside a box its own tallest
                    state, so growing it on hover, focus or for the current
                    question never shifts the marked underline below. */}
                <span className="flex h-1.5 w-3.5 items-end">
                  <span
                    className={
                      "block w-full rounded-sm group-hover:h-1.5 group-focus-visible:h-1.5 " +
                      (p.tone === "current" ? "h-1.5 " : "h-[3px] ") +
                      (p.tone === "current"
                        ? "bg-calm-ink"
                        : p.tone === "parked"
                          ? "bg-calm-plum"
                          : p.tone === "written"
                            ? "bg-calm-moss"
                            : "bg-calm-line")
                    }
                  />
                </span>
                {/* Always rendered, so a marked and an unmarked pill are the
                    same height and the row never jumps as marks come in. */}
                <span
                  className={
                    "mt-[3px] block h-px w-3.5 " +
                    (p.marked ? "bg-calm-soft" : "bg-transparent")
                  }
                />
              </button>
            );
          })}
        </nav>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-4">
            {pos > 0 && (
              <button onClick={() => goTo(pos - 1)} className={btnBack}>
                ← the one before
              </button>
            )}
            <span className="text-calm-soft text-sm">
              {pos + 1} of {queue.length}
            </span>
            {pos < queue.length - 1 && (
              <button onClick={() => goTo(pos + 1)} className={btnBack}>
                the one after →
              </button>
            )}
          </div>
          <button onClick={() => setScreen("pick")} className={btnBack}>
            stop for now
          </button>
        </div>

        <div className="border-calm-line bg-calm-card border p-6 sm:p-8">
          <p className="text-calm-plum mb-3 text-sm">{q.label}</p>
          <h2 className="font-read mb-5 text-2xl leading-snug font-normal">{q.prompt}</h2>
          {q.given && <p className="font-read text-calm-soft mb-5 italic">{q.given}</p>}

          {q.shape.length > 0 && (
            <ol className="border-calm-line text-calm-soft border-l-2 pl-5 text-sm">
              {q.shape.map((s, i) => (
                <li key={i} className="my-1.5 list-decimal">
                  {s}
                </li>
              ))}
            </ol>
          )}

          <div className="mt-6">
            {hintsShown === 0 ? (
              <button className={btnQuiet} onClick={() => setHintsShown(1)}>
                {words >= HINT_WORD_THRESHOLD
                  ? "Show me a nudge"
                  : "I'm properly stuck"}
              </button>
            ) : (
              <div className="mt-4 border border-[#e3dde8] bg-[#f3f0f5] px-4 py-4">
                <p className="text-calm-plum mb-2 text-sm">
                  Things you could use. You do not need all of them.
                </p>
                <ul className="list-disc pl-4 text-sm">
                  {q.hints.slice(0, hintsShown).map((h, i) => (
                    <li key={i} className="my-1.5">
                      {h}
                    </li>
                  ))}
                </ul>
                {hintsShown < q.hints.length && (
                  <button
                    className={btnBack + " mt-3"}
                    onClick={() => setHintsShown(hintsShown + 1)}
                  >
                    show me another
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="border-calm-line mt-6 border-t pt-5">
            <label className={label} htmlFor="answer">
              Your answer
            </label>
            <textarea
              id="answer"
              rows={q.type === "short" ? 5 : q.type === "long" ? 10 : 13}
              value={text}
              onChange={(e) => onType(e.target.value)}
              className={field + " font-read resize-y leading-relaxed"}
              placeholder={
                q.type === "short"
                  ? "Two sentences is enough."
                  : q.type === "judge"
                    ? "Both sides, then say which mattered most."
                    : "Start wherever you can."
              }
            />
            <div className="text-calm-soft mt-1.5 text-right text-sm">
              {words === 1 ? "1 word" : words + " words"}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className={btnQuiet}
            disabled={marking || markingAll || words < 15}
            onClick={() => void markAnswer(idx)}
            title={
              words < 15
                ? "A few more lines first and it is worth a look."
                : undefined
            }
          >
            {marking
              ? "marking…"
              : marks[idx]
                ? "mark it again"
                : "mark this"}
          </button>
        </div>

        {marks[idx] && (
          <MarkPanel
            record={marks[idx]}
            openPanel={openPanel}
            setOpenPanel={setOpenPanel}
          />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {pos > 0 && (
            <button className={btnBack} onClick={() => goTo(pos - 1)}>
              back
            </button>
          )}
          <span className="flex-1" />
          <button
            className={btnQuiet}
            onClick={() => {
              setOpenPanel("");
              advance(true);
            }}
          >
            Come back to this
          </button>
          <button
            className={btnSolid}
            onClick={() => {
              setOpenPanel("");
              advance(false);
            }}
          >
            Done
          </button>
        </div>
      </Surface>
    );
  }

  if (screen === "end" && sheet) {
    const flaggedNow = queue.filter((i) => flags[i]);
    const written = queue.filter((i) => (answers[i] ?? "").trim());

    return (
      <Surface error={error}>
        <h1 className={h1}>That is the lot.</h1>
        <p className={lede}>
          {written.length} of {queue.length} answered.{" "}
          {flaggedNow.length === 0
            ? "Nothing left hanging. Go and do something else."
            : flaggedNow.length === 1
              ? "One you parked:"
              : flaggedNow.length + " you parked:"}
        </p>

        <GradeStrip grade={grade} marked={Object.keys(marks).length} />

        <MarkAllPanel
          ready={markableNow().length}
          running={markingAll}
          done={markAllDone}
          total={markAllTotal}
          note={markAllNote}
          failed={markAllFailed.length}
          busy={marking}
          onStart={() => void markEverything()}
          onRetry={() => void markEverything(markAllFailed)}
          onStop={() => {
            stopMarkAll.current = true;
          }}
        />

        {flaggedNow.length > 0 && (
          <ul className="font-read mb-6 list-disc pl-5">
            {flaggedNow.map((i) => (
              <li key={i} className="my-2">
                {sheet.questions[i].prompt}
              </li>
            ))}
          </ul>
        )}

        <label className={label} htmlFor="pupil">
          Name on the export, if you want one
        </label>
        <input
          id="pupil"
          className={field + " max-w-xs"}
          value={pupilName}
          onChange={(e) => setPupilName(e.target.value)}
          placeholder="Elena"
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <button className={btnSolid} onClick={exportAnswers}>
            Export for marking
          </button>
          {flaggedNow.length > 0 && (
            <button
              className={btnQuiet}
              onClick={() => {
                setQueue(flaggedNow);
                setPos(0);
                setScreen("quiz");
              }}
            >
              Go through those again
            </button>
          )}
          <button className={btnQuiet} onClick={() => setScreen("pick")}>
            Back to this sheet
          </button>
        </div>

        <p className="text-calm-soft mt-6 text-sm">
          Everything you wrote is saved. You can close this and come back to it.
        </p>
      </Surface>
    );
  }

  return (
    <Surface error={error}>
      <p className="text-calm-soft text-sm">Loading</p>
    </Surface>
  );
}

/**
 * The mark and the coaching, in the order the brief fixes:
 * the mark line, what's working, the one change with its task, marks available
 * elsewhere collapsed, spelling in its own collapsed panel, and the mark
 * scheme wording on tap.
 *
 * Module scope, like Surface, so a re-render cannot remount it.
 *
 * The mark never appears on its own. markLine builds the whole sentence or
 * returns nothing, and a single answer never carries a grade.
 */
/**
 * The running grade across a sheet.
 *
 * Shows nothing at all until five answers are marked, and says how many it is
 * based on when it does, so the sample size is never hidden. While it is
 * building it says so, which is more use than silence.
 */
/* Mark everything she has written, in one press.
   Lives on the sheet screen and again at the end of a run, and is always on
   screen rather than only when there is something to mark: a control that
   appears and disappears is one she has to go looking for, and the reason it
   is unavailable is worth more than its absence. */
function MarkAllPanel({
  ready,
  running,
  done,
  total,
  note,
  failed,
  busy,
  onStart,
  onStop,
  onRetry,
}: {
  ready: number;
  running: boolean;
  done: number;
  total: number;
  note: string;
  failed: number;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="border-calm-line mb-6 border-t pt-5">
      {running ? (
        <>
          <p className="font-read text-calm-ink">
            Marking {Math.min(done + 1, total)} of {total}.
          </p>
          <p className="text-calm-soft mt-1 text-sm">
            Each one is a whole marking, so this takes a few minutes. They appear
            as they land, and you can stop whenever you like.
          </p>
          <button onClick={onStop} className={btnBack + " mt-3"}>
            stop
          </button>
        </>
      ) : (
        <>
          <button className={btnQuiet} disabled={ready === 0 || busy} onClick={onStart}>
            Mark everything I have written
          </button>
          <p className="text-calm-soft mt-2 text-sm">
            {ready === 0
              ? "Everything you have written already has its marking."
              : `${ready === 1 ? "One answer is" : `${ready} answers are`} ready. ` +
                `Anything still blank is skipped. Costs ${costEstimate(ready)}.`}
          </p>
        </>
      )}
      {note && <p className="font-read text-calm-ink mt-4">{note}</p>}
      {/* Named as a control rather than as advice. After a long run she has no
          way of knowing which ones dropped, and going to find them one at a
          time is not a thing anyone does. */}
      {!running && failed > 0 && (
        <button className={btnQuiet + " mt-3"} disabled={busy} onClick={onRetry}>
          {failed === 1 ? "Try that one again" : `Try those ${failed} again`}
        </button>
      )}
    </div>
  );
}

function GradeStrip({
  grade,
  marked,
}: {
  grade: ReturnType<typeof runningGrade>;
  marked: number;
}) {
  if (marked === 0) return null;

  if (grade.band === null) {
    const left = GRADE_MIN_MARKED - grade.counted;
    return (
      <p className="text-calm-soft mb-6 text-sm">
        {marked === 1 ? "1 answer marked" : `${marked} answers marked`}.{" "}
        {left === 1
          ? "One more and there is enough to show a grade."
          : `${left} more and there is enough to show a grade.`}
      </p>
    );
  }

  return (
    <div className="border-calm-line bg-calm-card mb-6 border px-4 py-3">
      <p className="font-read text-calm-ink text-lg">
        Working at around grade {grade.band}
      </p>
      <p className="text-calm-soft text-sm">{gradeLabel(grade)}</p>
    </div>
  );
}

/* Feedback text, rendered as the paragraphs it was written as.

   The marking prompt makes three lines per paragraph a hard rule and asks for a
   blank line between each. In one <p> those blank lines collapse to a space, so
   the model would obey the rule and the screen would still show a block. Nothing
   would fail; it would just quietly not work. */
function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  const paras = text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  return (
    <>
      {paras.map((t, i) => (
        <p key={i} className={className + (i > 0 ? " mt-3" : "")}>
          {t}
        </p>
      ))}
    </>
  );
}

function MarkPanel({
  record,
  openPanel,
  setOpenPanel,
}: {
  record: MarkRecord;
  openPanel: string;
  setOpenPanel: (p: string) => void;
}) {
  const fb = record.feedback;

  if (fb.status === "too_short") {
    return (
      <div className="border-calm-line bg-calm-card mt-5 border px-4 py-4">
        <p className="text-calm-ink text-sm">{fb.openingLine}</p>
      </div>
    );
  }

  const line = markLine({
    mark: record.mark,
    maxMark: record.maxMark,
    level: record.level,
    nextLevelMark: fb.nextLevelMark ?? null,
  });
  const moved = movement({ mark: record.mark, previousMark: record.previousMark });
  const toggle = (key: string) => setOpenPanel(openPanel === key ? "" : key);

  return (
    <div className="border-calm-line bg-calm-card mt-5 border px-4 py-4">
      {line && <p className="font-read text-calm-ink text-xl">{line}</p>}
      {fb.levelWording && (
        <p className="text-calm-soft mt-2 text-sm">{fb.levelWording}</p>
      )}

      {moved && (
        <p className="text-calm-moss mt-3 text-sm font-medium">{moved}</p>
      )}

      {fb.workingWell && (
        <div className="mt-4">
          <h3 className="text-calm-plum mb-1 text-sm font-medium">Working</h3>
          <Paragraphs
            text={fb.workingWell}
            className="text-calm-ink text-sm leading-relaxed"
          />
        </div>
      )}

      {fb.oneChange?.observation && (
        <div className="mt-4">
          <h3 className="text-calm-plum mb-1 text-sm font-medium">Change this</h3>
          <Paragraphs
            text={fb.oneChange.observation}
            className="text-calm-ink text-sm leading-relaxed"
          />
          {fb.oneChange.why && (
            <div className="mt-3">
              <Paragraphs
                text={fb.oneChange.why}
                className="text-calm-ink text-sm leading-relaxed"
              />
            </div>
          )}
          {fb.oneChange.task && (
            <p className="border-calm-plum/40 text-calm-ink mt-3 border-l-2 pl-3 text-sm">
              Try this: {fb.oneChange.task}
            </p>
          )}
        </div>
      )}

      {/* Corrections sit with the content, quietly, rather than as an alarm. */}
      {(fb.factualNotes?.length ?? 0) > 0 && (
        <ul className="text-calm-soft mt-4 list-disc pl-5 text-sm">
          {fb.factualNotes!.map((n, i) => (
            <li key={i} className="my-1">
              {n}
            </li>
          ))}
        </ul>
      )}

      {(fb.alsoAvailable?.length ?? 0) > 0 && (
        <div className="border-calm-line mt-4 border-t pt-3">
          <button
            className={btnBack}
            aria-expanded={openPanel === "also"}
            onClick={() => toggle("also")}
          >
            {openPanel === "also"
              ? "hide marks available elsewhere"
              : `marks available elsewhere (${fb.alsoAvailable!.length})`}
          </button>
          {openPanel === "also" && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {fb.alsoAvailable!.map((a, i) => (
                <li key={i} className="text-calm-ink my-1.5 leading-relaxed">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Spelling has its own panel and never appears in the content feedback. */}
      {(fb.spelling?.fixes.length ?? 0) > 0 && (
        <div className="border-calm-line mt-3 border-t pt-3">
          <button
            className={btnBack}
            aria-expanded={openPanel === "spelling"}
            onClick={() => toggle("spelling")}
          >
            {openPanel === "spelling"
              ? "hide spelling"
              : fb.spelling!.marksAvailable > 0
                ? `spelling: ${fb.spelling!.marksAvailable} mark${fb.spelling!.marksAvailable === 1 ? "" : "s"} available`
                : "spelling"}
          </button>
          {openPanel === "spelling" && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {fb.spelling!.fixes.map((f, i) => (
                <li key={i} className="text-calm-ink my-1.5">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {fb.markSchemeWording && (
        <div className="border-calm-line mt-3 border-t pt-3">
          <button
            className={btnBack}
            aria-expanded={openPanel === "scheme"}
            onClick={() => toggle("scheme")}
          >
            {openPanel === "scheme"
              ? "hide the mark scheme wording"
              : "show me the mark scheme wording"}
          </button>
          {openPanel === "scheme" && (
            <p className="text-calm-soft mt-2 text-sm leading-relaxed">
              {fb.markSchemeWording}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({
  n,
  t,
  d,
  onClick,
}: {
  n: number;
  t: string;
  d: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="border-calm-line hover:bg-calm-card flex w-full items-baseline gap-4 border-b px-1 py-4 text-left"
    >
      <span className="font-read text-calm-plum min-w-10 text-2xl">{n}</span>
      <span>
        <span className="block font-medium">{t}</span>
        <span className="text-calm-soft mt-0.5 block text-sm">{d}</span>
      </span>
    </button>
  );
}
