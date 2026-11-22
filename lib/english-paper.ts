import type { Question, TickPart } from "./revision-db";

/**
 * AQA English Language Paper 1, turned into question cards.
 *
 * The paper is the same shape every time: Q1 tick boxes on the first few
 * lines, Q2 language on a set of lines, Q3 structure across the whole source,
 * Q4 a statement to agree or disagree with on the second half, Q5 writing.
 * So the method steps are written here once, in plain words, rather than
 * asked of a model on every paper. That keeps them identical across every
 * sheet she builds, which matters more than variety: the point is that the
 * shape of each answer becomes automatic.
 *
 * What the model supplies is only what changes per paper: the question
 * wording, the line numbers, the tick-box answers, and a few pointers into
 * this particular extract. The source itself stays as images of her pages.
 */

export const ENGLISH_SUBJECT = "English Language";

/** True for a sheet the English Language marker should handle. */
export function isEnglishLanguage(subject: string): boolean {
  return /english\s*lang/i.test(subject);
}

const range = (from: number, to: number) =>
  from === to ? `line ${from}` : `lines ${from} to ${to}`;

/* Q3 follows the school's own checklist from the booklet: beginning, middle
   and end; shifts and the words that signal them; pace; patterns that come
   back; overall shape. Q5 follows the school's DROP, SHIFT, ZOOM, LEAVE
   planner, so the steps use her teacher's words. */

function q2Shape(from: number, to: number, focus: string): string[] {
  return [
    `Pick two or three short quotes from ${range(from, to)}. A few words each is plenty.`,
    "For each one, name what the writer has used if you know it: a verb, an adjective, a simile, a list, a short sentence.",
    "Pick out the single word doing the most work and say what it makes you picture or feel.",
    `End each paragraph by saying how it shows ${focus}.`,
  ];
}

function q3Shape(focus: string): string[] {
  return [
    "Start: say what the writer makes you look at first, and why that is a good way in.",
    "Middle: find the moment the focus moves. A new place, a new time, a memory, a different person. Quote the words that signal it.",
    `Say whether things speed up or slow down there, and what that does to the ${focus}.`,
    `End: say where the source leaves you, and whether the ${focus} has gone up or down since the start.`,
    "If something from the start comes back later, say so. That is a pattern, and it scores.",
  ];
}

function q4Shape(from: number): string[] {
  return [
    "First sentence: say how far you agree. Completely, mostly, or only partly.",
    `Three paragraphs, each with one reason and a short quote from line ${from} onwards.`,
    "In each paragraph, pick out one word in your quote and say what it suggests.",
    "If one part of the statement does not fit, say which part and why. That is where the top marks are.",
    "Last sentence: say again how far you agree.",
  ];
}

const Q5_SHAPE = [
  "Plan for 10 minutes using DROP, SHIFT, ZOOM, LEAVE. Write for 35. Check for 5.",
  "DROP: put the reader straight into the scene. Where, when, what it looks and sounds like. A hint of a problem.",
  "SHIFT: change something. The weather, the time, a memory, or whose eyes we see through.",
  "ZOOM: close in on one small detail or one person and describe it slowly.",
  "LEAVE: end on something that stays with the reader. A mystery, a cliffhanger, or an echo of your opening.",
  "Check full stops, capital letters and paragraphs. 16 of the 40 marks are for this.",
];

/* Paragraph patterns from the back of the booklet. Named by their shape,
   so she can use the pattern without copying the school's example. */
const Q5_HINTS = [
  "Never had... Never had... Never had I...",
  "Before... Now... Soon...",
  "Light... Shadows... Darkness...",
  "Same adjective three times, then its opposite",
  "Cold... Colder... Coldest...",
  "Three short lines starting the same way, then something big",
  "One sentence on its own as a paragraph",
];

/* What the model returns for a paper's questions. Every field is required by
   the schema in the route, so a question missing from the pages arrives with
   present set to false rather than absent. */
export interface ReadPaper {
  paperName: string;
  q1: { present: boolean; from: number; to: number; parts: TickPart[] };
  q2: { present: boolean; from: number; to: number; question: string; focus: string; hints: string[] };
  q3: { present: boolean; question: string; focus: string; hints: string[] };
  q4: { present: boolean; from: number; statement: string; hints: string[] };
  q5: { present: boolean; context: string; optionA: string; optionB: string; hasPicture: boolean };
}

const clampLine = (n: number, max: number) =>
  Math.max(1, Math.min(Number.isFinite(n) ? Math.round(n) : 1, max));

/**
 * Turn a read paper into question cards.
 *
 * Line numbers from the model are clamped into the source, since a focus
 * outside it would highlight nothing and the marker would read it as a
 * request for lines that do not exist.
 */
export function paperToQuestions(paper: ReadPaper, lastLine: number): Question[] {
  const max = Math.max(1, lastLine);
  const source = { lines: max };
  const out: Question[] = [];

  if (paper.q1.present && paper.q1.parts.length > 0) {
    const from = clampLine(paper.q1.from, max);
    const to = clampLine(Math.max(paper.q1.to, from), max);
    out.push({
      label: "Q1 · Find it in the text (4 marks)",
      type: "tick",
      prompt: `Read ${range(from, to)} again. Pick one answer for each.`,
      given: "",
      shape: [],
      hints: [],
      source,
      focus: { from, to },
      parts: paper.q1.parts.map((p) => ({
        ...p,
        line: p.line > 0 && p.line <= max ? p.line : 0,
      })),
    });
  }

  if (paper.q2.present && paper.q2.question.trim()) {
    const from = clampLine(paper.q2.from, max);
    const to = clampLine(Math.max(paper.q2.to, from), max);
    const focus = paper.q2.focus.trim() || "what the question asks about";
    out.push({
      label: "Q2 · Language (8 marks)",
      type: "long",
      prompt: `Look at ${range(from, to)}. ${paper.q2.question.trim()}`,
      given:
        "You could write about the writer's choice of words and phrases, language features and techniques, and sentence forms.",
      shape: q2Shape(from, to, focus),
      hints: paper.q2.hints,
      source,
      focus: { from, to },
    });
  }

  if (paper.q3.present && paper.q3.question.trim()) {
    const focus = paper.q3.focus.trim() || "interest";
    out.push({
      label: "Q3 · Structure (8 marks)",
      type: "long",
      prompt: `Think about the whole source. ${paper.q3.question.trim()}`,
      given:
        `You could write about how the ${focus} changes by the end, how the writer uses structure, and any shifts in mood, tone or perspective.`,
      shape: q3Shape(focus),
      hints: paper.q3.hints,
      source,
    });
  }

  if (paper.q4.present && paper.q4.statement.trim()) {
    const from = clampLine(paper.q4.from, max);
    out.push({
      label: "Q4 · Do you agree? (20 marks)",
      type: "judge",
      prompt: `${paper.q4.statement.trim()} To what extent do you agree?`,
      given: `Use ${range(from, max)}, the second part of the source.`,
      shape: q4Shape(from),
      hints: paper.q4.hints,
      source,
      focus: { from, to: max },
    });
  }

  if (paper.q5.present && (paper.q5.optionA.trim() || paper.q5.optionB.trim())) {
    const options = [paper.q5.optionA.trim(), paper.q5.optionB.trim()].filter(Boolean);
    const choose =
      options.length === 2
        ? `Choose one.\n\nEither: ${options[0]}\n\nOr: ${options[1]}`
        : options[0];
    const context = paper.q5.context.trim();
    out.push({
      label: "Q5 · Writing (40 marks: 24 for content, 16 for spelling and punctuation)",
      type: "write",
      prompt: choose,
      given: [context, paper.q5.hasPicture ? "The picture is in your booklet." : ""]
        .filter(Boolean)
        .join(" "),
      shape: Q5_SHAPE,
      hints: Q5_HINTS,
    });
  }

  return out;
}

/* Tick-box answers are stored in the ordinary answer column as a JSON list of
   chosen option indexes, with null for a part not answered yet. */

export function readTicks(answer: string, parts: number): (number | null)[] {
  let raw: unknown = [];
  try {
    raw = JSON.parse(answer || "[]");
  } catch {
    raw = [];
  }
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: parts }, (_, i) =>
    typeof arr[i] === "number" && Number.isInteger(arr[i]) ? (arr[i] as number) : null,
  );
}

export function writeTicks(ticks: (number | null)[]): string {
  return JSON.stringify(ticks);
}

/** "3 out of 4", counting only parts the paper could be checked against. */
export function tickScore(
  parts: TickPart[],
  ticks: (number | null)[],
): { right: number; checkable: number; answered: number } {
  let right = 0;
  let checkable = 0;
  let answered = 0;
  parts.forEach((p, i) => {
    if (ticks[i] !== null && ticks[i] !== undefined) answered += 1;
    if (p.correct < 0) return;
    checkable += 1;
    if (ticks[i] === p.correct) right += 1;
  });
  return { right, checkable, answered };
}
