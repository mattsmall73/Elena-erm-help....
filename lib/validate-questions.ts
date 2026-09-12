import type { Question, QuestionType } from "./revision-db";

/**
 * Bounds for an incoming sheet. Set well above anything real: the history
 * sheet is 39 questions with a longest hint of 193 characters and at most six
 * hints per question. These exist to stop an unbounded body reaching a JSONB
 * column, not to constrain a sheet she actually builds.
 */
export const SHEET_LIMITS = {
  questions: 200,
  titleChars: 200,
  subjectChars: 100,
  labelChars: 200,
  promptChars: 2000,
  givenChars: 2000,
  shapeSteps: 12,
  shapeStepChars: 500,
  hints: 20,
  hintChars: 1000,
} as const;

const QUESTION_TYPES: readonly QuestionType[] = ["short", "long", "judge"];

export type ValidatedSheet =
  | { ok: true; title: string; subject: string; questions: Question[] }
  | { ok: false; reason: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

/** A bounded array of bounded strings, or null if anything is off. */
function strings(v: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, maxChars);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/**
 * Rebuilds a question from known fields only, so nothing unrecognised reaches
 * the JSONB column the whole sheet is stored in.
 *
 * A question with no prompt is dropped rather than rejected: the generate
 * route already filters those, and a sheet is still usable without one.
 * Anything else malformed rejects the whole sheet, because a sheet that looks
 * complete but is missing questions is worse than an error message.
 */
function question(v: unknown): Question | null | "drop" {
  if (!isObject(v)) return null;

  const prompt = str(v.prompt, SHEET_LIMITS.promptChars);
  if (prompt === null) return null;
  if (prompt.trim().length === 0) return "drop";

  const label = str(v.label, SHEET_LIMITS.labelChars);
  const given = str(v.given ?? "", SHEET_LIMITS.givenChars);
  if (label === null || given === null) return null;

  const shape = strings(
    v.shape ?? [],
    SHEET_LIMITS.shapeSteps,
    SHEET_LIMITS.shapeStepChars,
  );
  const hints = strings(v.hints ?? [], SHEET_LIMITS.hints, SHEET_LIMITS.hintChars);
  if (shape === null || hints === null) return null;

  // An unrecognised type falls back to "long" rather than rejecting, matching
  // what the generate route already does with a model's answer.
  const type = QUESTION_TYPES.includes(v.type as QuestionType)
    ? (v.type as QuestionType)
    : "long";

  return { label, type, prompt, given, shape, hints };
}

/**
 * Validate and normalise a posted sheet.
 *
 * Rejected rather than repaired, so a malformed or hostile body never reaches
 * the insert. The route wrote whatever arrived straight into JSONB before this.
 */
export function validateSheet(input: unknown): ValidatedSheet {
  if (!isObject(input)) return { ok: false, reason: "Expected an object." };

  const title = str(input.title, SHEET_LIMITS.titleChars);
  if (title === null || title.trim().length === 0) {
    return { ok: false, reason: "A sheet needs a name." };
  }

  const subject = str(input.subject ?? "", SHEET_LIMITS.subjectChars);
  if (subject === null) return { ok: false, reason: "That subject is too long." };

  if (!Array.isArray(input.questions)) {
    return { ok: false, reason: "A sheet needs a list of questions." };
  }
  if (input.questions.length === 0) {
    return { ok: false, reason: "A sheet needs at least one question." };
  }
  if (input.questions.length > SHEET_LIMITS.questions) {
    return {
      ok: false,
      reason: `That is more than ${SHEET_LIMITS.questions} questions. Split it into two sheets.`,
    };
  }

  const questions: Question[] = [];
  for (const raw of input.questions) {
    const q = question(raw);
    if (q === null) return { ok: false, reason: "One of those questions is malformed." };
    if (q !== "drop") questions.push(q);
  }

  if (questions.length === 0) {
    return { ok: false, reason: "None of those questions had any text." };
  }

  return { ok: true, title: title.trim(), subject: subject.trim(), questions };
}
