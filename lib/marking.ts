/**
 * Everything about a mark that is arithmetic rather than judgement.
 *
 * The running grade is computed here and never by the model. The model marks
 * one answer, sees only that answer, and never estimates an overall grade.
 */

export interface StoredMark {
  questionIndex: number;
  mark: number | null;
  maxMark: number | null;
  level: number | null;
  maxLevel: number | null;
  previousMark: number | null;
  previousLevel: number | null;
}

/**
 * Marked answers needed before a grade is shown at all.
 *
 * Below this it swings by two grades on one answer and means nothing, so
 * showing it would be worse than showing nothing.
 */
export const GRADE_MIN_MARKED = 5;

/**
 * Proportion of the scheme's top level, mapped to a band.
 *
 * Bands rather than single grades, deliberately: a handful of answers marked by
 * a model does not justify the precision of one number, and a band that moves
 * is still the direction of travel she wants to see.
 *
 * These boundaries are a reasonable reading rather than anything official, and
 * they are here in one place so they are easy to change once real papers can
 * be compared against them. They err low rather than high on purpose: the same
 * argument the prompt makes about not inflating a mark applies to the grade,
 * since a flattering number removes the information she is asking for.
 */
const BANDS: ReadonlyArray<{ min: number; band: string }> = [
  { min: 0.95, band: "9" },
  { min: 0.85, band: "8 to 9" },
  { min: 0.75, band: "7 to 8" },
  { min: 0.65, band: "6 to 7" },
  { min: 0.55, band: "5 to 6" },
  { min: 0.45, band: "4 to 5" },
  { min: 0.3, band: "3 to 4" },
  { min: 0.0, band: "2 to 3" },
];

export interface RunningGrade {
  /** Marked answers that carried a usable level. */
  counted: number;
  /** Null until GRADE_MIN_MARKED answers are in. */
  band: string | null;
  /** Mean level as a proportion of the scheme's ceiling, 0 to 1. */
  proportion: number | null;
}

export function runningGrade(marks: readonly StoredMark[]): RunningGrade {
  const usable = marks.filter(
    (m) =>
      typeof m.level === "number" &&
      typeof m.maxLevel === "number" &&
      m.maxLevel > 0 &&
      m.level >= 0,
  );

  if (usable.length < GRADE_MIN_MARKED) {
    return { counted: usable.length, band: null, proportion: null };
  }

  const mean =
    usable.reduce((sum, m) => sum + m.level! / m.maxLevel!, 0) / usable.length;
  const proportion = Math.min(1, Math.max(0, mean));
  const band = BANDS.find((b) => proportion >= b.min)?.band ?? BANDS[BANDS.length - 1].band;
  return { counted: usable.length, band, proportion };
}

/** "Across 7 answers so far", so the sample size is never hidden. */
export function gradeLabel(g: RunningGrade): string | null {
  if (g.band === null) return null;
  return `Across ${g.counted} answer${g.counted === 1 ? "" : "s"} so far`;
}

/**
 * "6 out of 12, Level 2, one change takes this to 8."
 *
 * The mark never appears on its own, so this builds the whole line or nothing.
 */
export function markLine(m: {
  mark: number | null;
  maxMark: number | null;
  level: number | null;
  nextLevelMark?: number | null;
}): string | null {
  if (typeof m.mark !== "number" || typeof m.maxMark !== "number") return null;
  const parts = [`${m.mark} out of ${m.maxMark}`];
  if (typeof m.level === "number") parts.push(`Level ${m.level}`);
  if (typeof m.nextLevelMark === "number" && m.nextLevelMark > m.mark) {
    parts.push(`one change takes this to ${m.nextLevelMark}`);
  }
  return parts.join(", ") + ".";
}

/** "was 8, now 10", shown only when a re-mark actually moved the mark. */
export function movement(m: {
  mark: number | null;
  previousMark: number | null;
}): string | null {
  if (typeof m.mark !== "number" || typeof m.previousMark !== "number") {
    return null;
  }
  if (m.mark === m.previousMark) return null;
  return `was ${m.previousMark}, now ${m.mark}`;
}

/**
 * Which answers a "mark everything" run should send.
 *
 * Three states, and only the first two cost a call:
 *
 *   never marked      -> mark it
 *   edited since its mark -> mark it, and the movement it shows is real
 *   marked, untouched -> skip, because the answer for it already exists
 *
 * Anything too short to mark is left out here rather than being turned away by
 * the route, so the count she is shown before it starts is the true one.
 */
export function needsMarking(args: {
  count: number;
  words: (index: number) => number;
  minWords: number;
  markedAt: (index: number) => number | null;
  answeredAt: (index: number) => number | null;
}): number[] {
  const out: number[] = [];
  for (let i = 0; i < args.count; i++) {
    if (args.words(i) < args.minWords) continue;
    const marked = args.markedAt(i);
    if (marked === null) {
      out.push(i);
      continue;
    }
    const written = args.answeredAt(i);
    if (written !== null && written > marked) out.push(i);
  }
  return out;
}

export interface BulkOutcome {
  /** Answers marked in this run. */
  marked: number;
  /** Of those, how many beat the mark they had before. */
  movedUp: number;
  /** Words in the answers marked in this run. */
  words: number;
  /** Calls that did not come back. */
  failed: number;
  /** She pressed stop. */
  stopped: boolean;
  /** Questions with nothing written on them yet. */
  blank: number;
}

/**
 * The line shown after a "mark everything" run.
 *
 * Facts rather than praise, for the reason the marking prompt itself gives:
 * generic encouragement is obviously filler, and it makes the real praise
 * untrustworthy. The word count is the encouraging part, because it is a true
 * number and it is hers. What is left is named as waiting rather than missed.
 */
export function bulkSummary(o: BulkOutcome): string {
  const parts: string[] = [];

  if (o.marked === 0) {
    // Three different reasons nothing was marked, and they must not borrow each
    // other's wording. Saying "everything already has its marking" after a run
    // where every call failed is both a contradiction and untrue.
    if (o.stopped) {
      parts.push("Stopped before anything was marked.");
    } else if (o.failed > 0) {
      parts.push(
        o.failed === 1
          ? "That one did not come back. Worth trying it again."
          : "None of them came back. Worth trying again in a minute.",
      );
    } else {
      parts.push("Nothing new to mark. Everything you have written already has its marking.");
    }
  } else {
    const n = o.marked === 1 ? "1 answer marked" : `${o.marked} answers marked`;
    parts.push(`${n}, ${o.words.toLocaleString("en-GB")} words of your own writing.`);
  }

  if (o.movedUp > 0) {
    parts.push(
      o.marked === 1
        ? "It scored higher than last time."
        : o.movedUp === 1
          ? "One of them scored higher than last time."
          : `${o.movedUp} of them scored higher than last time.`,
    );
  }

  if (o.stopped && o.marked > 0) {
    parts.push("Stopped there. The rest are still waiting.");
  }

  if (o.marked > 0 && o.failed > 0) {
    parts.push(
      o.failed === 1
        ? "One did not come back. Worth trying that one again."
        : `${o.failed} did not come back. Worth trying those again.`,
    );
  }

  if (o.blank > 0) {
    parts.push(
      o.blank === 1
        ? "One question is still blank, there whenever you want it."
        : `${o.blank} questions are still blank, there whenever you want them.`,
    );
  }

  return parts.join(" ");
}
