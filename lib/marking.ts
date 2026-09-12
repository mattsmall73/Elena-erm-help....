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
