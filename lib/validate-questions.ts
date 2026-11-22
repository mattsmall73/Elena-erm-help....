import type { Question, QuestionType, Source, TickPart } from "./revision-db";

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
  idChars: 64,
  /* An English Language source is about fifty printed lines. Generous, since
     a long extract over two pages runs to ninety. */
  sourceLines: 400,
  /* Source page images, posted with the sheet. A page rendered at 1400px is
     about 300 KB of base64. */
  sourcePages: 4,
  sourcePageChars: 1_500_000,
  sourceTotalChars: 3_600_000,
  tickParts: 8,
  tickOptions: 6,
  tickChars: 300,
} as const;

const QUESTION_TYPES: readonly QuestionType[] = ["short", "long", "judge", "tick", "write"];

const isInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v);

/** A source marker: the last line number printed on the source. */
function source(v: unknown): Source | null {
  if (!isObject(v)) return null;
  return isInt(v.lines) && v.lines >= 1 && v.lines <= SHEET_LIMITS.sourceLines
    ? { lines: v.lines }
    : null;
}

function tickPart(v: unknown): TickPart | null {
  if (!isObject(v)) return null;
  const prompt = str(v.prompt, SHEET_LIMITS.tickChars);
  const options = strings(v.options, SHEET_LIMITS.tickOptions, SHEET_LIMITS.tickChars);
  if (prompt === null || options === null || options.length < 2) return null;
  const correct =
    isInt(v.correct) && v.correct >= 0 && v.correct < options.length ? v.correct : -1;
  const line = isInt(v.line) && v.line > 0 ? v.line : 0;
  return { prompt, options, correct, line };
}

export type ValidatedSheet =
  | {
      ok: true;
      /** Present only on the shipped sheet, which posts a fixed id so a
          second press updates it rather than duplicating it. */
      id?: string;
      title: string;
      subject: string;
      questions: Question[];
    }
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

  const out: Question = { label, type, prompt, given, shape, hints };

  if (v.source !== undefined && v.source !== null) {
    const s = source(v.source);
    if (s === null) return null;
    out.source = s;
  }

  if (v.focus !== undefined && v.focus !== null) {
    const f = v.focus as Record<string, unknown>;
    const max = out.source?.lines ?? 0;
    // A focus only means something against a source, and only inside it.
    if (!isObject(f) || !isInt(f.from) || !isInt(f.to) || max === 0) return null;
    const from = Math.max(1, Math.min(f.from, max));
    const to = Math.max(from, Math.min(f.to, max));
    out.focus = { from, to };
  }

  if (type === "tick") {
    if (!Array.isArray(v.parts) || v.parts.length === 0) return null;
    if (v.parts.length > SHEET_LIMITS.tickParts) return null;
    const parts: TickPart[] = [];
    for (const p of v.parts) {
      const t = tickPart(p);
      if (t === null) return null;
      parts.push(t);
    }
    out.parts = parts;
  }

  return out;
}

/**
 * Validate and normalise a posted sheet.
 *
 * Rejected rather than repaired, so a malformed or hostile body never reaches
 * the insert. The route wrote whatever arrived straight into JSONB before this.
 */
export function validateSheet(input: unknown): ValidatedSheet {
  if (!isObject(input)) return { ok: false, reason: "Expected an object." };

  // An id is optional. Hand-built sheets never send one and are always
  // created; the shipped sheet sends a fixed one so it can be updated.
  let id: string | undefined;
  if (input.id !== undefined && input.id !== null) {
    const raw = str(input.id, SHEET_LIMITS.idChars);
    if (raw === null || !/^[a-z0-9][a-z0-9-]*$/.test(raw)) {
      return { ok: false, reason: "That sheet id is not usable." };
    }
    id = raw;
  }

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

  return { ok: true, id, title: title.trim(), subject: subject.trim(), questions };
}

const PAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Source page images posted with an English Language sheet. Optional: every
 * other sheet sends none. Bounded so a large body cannot reach the table.
 */
export function validateSourcePages(
  v: unknown,
): { ok: true; pages: { mediaType: string; data: string }[] } | { ok: false; reason: string } {
  if (v === undefined || v === null) return { ok: true, pages: [] };
  if (!Array.isArray(v) || v.length > SHEET_LIMITS.sourcePages) {
    return { ok: false, reason: "Too many source pages for one paper." };
  }
  let total = 0;
  const pages: { mediaType: string; data: string }[] = [];
  for (const raw of v) {
    if (!isObject(raw)) return { ok: false, reason: "A source page is malformed." };
    const mediaType = typeof raw.mediaType === "string" ? raw.mediaType : "";
    const data = typeof raw.data === "string" ? raw.data : "";
    if (!PAGE_TYPES.includes(mediaType) || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return { ok: false, reason: "A source page is malformed." };
    }
    if (data.length > SHEET_LIMITS.sourcePageChars) {
      return { ok: false, reason: "A source page is too big." };
    }
    total += data.length;
    pages.push({ mediaType, data });
  }
  if (total > SHEET_LIMITS.sourceTotalChars) {
    return { ok: false, reason: "The source pages are too big together." };
  }
  return { ok: true, pages };
}
