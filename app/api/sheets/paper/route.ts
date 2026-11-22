import Anthropic from "@anthropic-ai/sdk";
import type { TickPart } from "@/lib/revision-db";
import { paperToQuestions, type ReadPaper } from "@/lib/english-paper";
import { withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Reads one English Language Paper 1 from her booklet: pages cut from the PDF
 * in her browser, or photos of the printed pages.
 *
 * It reads the pages and writes no source text back. The extracts are mostly
 * from copyrighted novels, and the API's content filter blocks a model
 * writing out long published passages word for word, which is what the first
 * version of this route asked for. So the source stays as images of her own
 * booklet pages, shown in the app and sent to the marker, and this route
 * returns only what the app needs around them: which pages hold the source,
 * the last line number, the questions and their line ranges, the tick-box
 * answers, and a few short pointers into the text.
 *
 * Nothing from the booklet is stored anywhere but her own sheet.
 */

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;
const EFFORT = "medium" as const;

/* The platform rejects bodies over 4.5 MB. One paper's pages cut from the
   booklet come to about 1.4 MB at most. */
const MAX_FILES = 10;
const MAX_DATA_CHARS = 4_000_000;

type Upload = { mediaType: string; data: string };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const QUESTIONS_SYSTEM = `You read one AQA GCSE English Language Paper 1 from a practice booklet, for a revision app used by a sixteen-year-old with dyslexia and ADHD.

You are given photos or scans of the pages, numbered in the order given. They may include the source, the question pages, sample answers written by other students, planning grids and pictures. Ignore the sample answers and grids.

Never copy out the source. The app shows her the page itself. You may quote at most four words of the source anywhere in your answer.

The source

- paperName: the exam series and a short handle for the extract, from the page headings and the text. "June 2017 · Rosabel", "November 2018 · T-Rex". Use the main character's name or the obvious subject.
- sourcePages: the page numbers, counting from 1 in the order given, that hold the numbered extract headed "Source A" or printed with line numbers down the margin. Only the pages with the extract itself, never a question page that reprints part of it.
- lastLine: the number of the last line of the extract. Count from the margin numbers: every printed line of text counts, and blank space between paragraphs does not.

Read the line numbers from the margin for everything below. The questions say "lines 6 to 14" and she will look for those numbers on the page.

The paper has five questions. For each, set present to false if it is not on these pages, and leave its other fields empty or zero.

Question 1 (tick boxes, 4 marks)
- from, to: the lines it sends her to, such as "lines 1 to 5".
- parts: each sub-question, with its prompt and its options exactly as printed. Booklets sometimes repeat a number such as 01.3; keep every part in order regardless.
- correct: the index of the right option, counting from 0. Work it out from the source, using only the lines the question names, since that is the rule in the exam. If no option fits, or two do equally, use -1.
- line: the source line the answer is on.

Question 2 (language, 8 marks)
- from, to: the lines of the extract it prints.
- question: the question sentence word for word, such as "How does the writer use language here to describe Rosabel's bus journey home?"
- focus: what it asks about, in a few words, such as "Rosabel's bus journey home".

Question 3 (structure, 8 marks)
- question: the line saying where the text comes from and the question itself, word for word. "This text is from the beginning of a short story. How has the writer structured the text to create tension?"
- focus: the one effect it asks about, such as "tension", "surprise" or "sadness".

Question 4 (statement, 20 marks)
- from: the line it starts from, as in "from line 19 to the end".
- statement: the statement she agrees or disagrees with, word for word, without "To what extent do you agree?".

Question 5 (writing, 40 marks)
- context: the opening sentence, such as "A magazine has asked for contributions for their creative writing section."
- optionA, optionB: the two tasks word for word.
- hasPicture: true if the first task mentions a picture.

Hints, for questions 2, 3 and 4

Three to five each. They are what she sees when she presses "I'm properly stuck", so they must get her started without doing her thinking.

- Each hint points at a place in the source by line number and names what is there: a word, a feature, a moment. It never says what it means, what effect it has, or why it matters. Working that out is the answer.
- Fragments separated by a middle dot, never sentences.
- Quote at most four words of the source in any hint.
- Question 2 hints stay inside its lines. Question 4 hints stay inside its part of the source, and start with "Agree:" or "Disagree:" so she can see both sides exist.
- Question 3 hints are about where things happen in the source: where it starts, where the focus moves, where it ends.
- Order them so the first is the most useful if she only opens one.

  Right: "line 7 · 'opal and silver' · colours"
  Right: "lines 15 to 18 · a memory of the day"
  Right: "Disagree: line 33 · how the girl speaks to Rosabel"
  Wrong: "line 7 · 'opal and silver' makes the street seem magical"
  Wrong: "The writer uses a flashback to build tension."

Writing rules for anything you write yourself: plain words, no em dashes, no "X, not Y" constructions. Copy the paper's own wording exactly where asked.`;

const tickPartSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    correct: { type: "integer" },
    line: { type: "integer" },
  },
  required: ["prompt", "options", "correct", "line"],
} as const;

const hintsSchema = { type: "array", items: { type: "string" } } as const;

const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    paperName: { type: "string" },
    sourcePages: { type: "array", items: { type: "integer" } },
    lastLine: { type: "integer" },
    q1: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        from: { type: "integer" },
        to: { type: "integer" },
        parts: { type: "array", items: tickPartSchema },
      },
      required: ["present", "from", "to", "parts"],
    },
    q2: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        from: { type: "integer" },
        to: { type: "integer" },
        question: { type: "string" },
        focus: { type: "string" },
        hints: hintsSchema,
      },
      required: ["present", "from", "to", "question", "focus", "hints"],
    },
    q3: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        question: { type: "string" },
        focus: { type: "string" },
        hints: hintsSchema,
      },
      required: ["present", "question", "focus", "hints"],
    },
    q4: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        from: { type: "integer" },
        statement: { type: "string" },
        hints: hintsSchema,
      },
      required: ["present", "from", "statement", "hints"],
    },
    q5: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        context: { type: "string" },
        optionA: { type: "string" },
        optionB: { type: "string" },
        hasPicture: { type: "boolean" },
      },
      required: ["present", "context", "optionA", "optionB", "hasPicture"],
    },
  },
  required: ["paperName", "sourcePages", "lastLine", "q1", "q2", "q3", "q4", "q5"],
} as const;

/* ---------- small readers for what comes back ---------- */

const str = (v: unknown, max = 2000): string =>
  typeof v === "string" ? v.slice(0, max) : "";
const int = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
const bool = (v: unknown): boolean => v === true;
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const strs = (v: unknown, cap: number, max = 300): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .slice(0, cap)
        .map((s) => s.slice(0, max))
    : [];

function readUploads(v: unknown): Upload[] | string {
  if (!Array.isArray(v) || v.length === 0) return "Add the pages for the paper first.";
  if (v.length > MAX_FILES) return `That is more than ${MAX_FILES} pages. One paper at a time.`;
  let total = 0;
  const out: Upload[] = [];
  for (const raw of v) {
    const f = obj(raw);
    const mediaType = str(f.mediaType, 40);
    const data = typeof f.data === "string" ? f.data : "";
    if (!data) return "One of those pages came through empty.";
    if (mediaType !== "application/pdf" && !IMAGE_TYPES.includes(mediaType as ImageType)) {
      return "Those pages need to be a PDF or photos.";
    }
    total += data.length;
    out.push({ mediaType, data });
  }
  if (total > MAX_DATA_CHARS) {
    return "Those pages are too big to send in one go. Try fewer pages.";
  }
  return out;
}

function pageBlocks(files: Upload[]): Anthropic.ContentBlockParam[] {
  return files.map((f) =>
    f.mediaType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: f.data,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: f.mediaType as ImageType,
            data: f.data,
          },
        },
  );
}

async function ask(
  system: string,
  schema: object,
  effort: "medium",
  content: Anthropic.ContentBlockParam[],
  tag: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const client = new Anthropic();
  const message = await client.messages
    .stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        format: { type: "json_schema", schema: schema as Record<string, unknown> },
      },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    })
    .finalMessage();

  const u = message.usage;
  console.log(
    `[sheets/paper ${tag}] tokens in:`,
    `fresh ${u.input_tokens}`,
    `cache written ${u.cache_creation_input_tokens ?? 0}`,
    `cache read ${u.cache_read_input_tokens ?? 0}`,
    `out ${u.output_tokens}`,
  );

  if (message.stop_reason === "refusal") {
    console.error(`[sheets/paper ${tag}] declined:`, message.stop_details?.category);
    return { ok: false, error: "The paper reader wouldn't take those pages. Try photos instead?" };
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    console.error(`[sheets/paper ${tag}] unparseable, stop_reason:`, message.stop_reason);
    return { ok: false, error: "That came back unreadable. Try it again." };
  }
}

export const POST = withSession(async (request) => {
  try {
    const body = obj(await request.json());
    const files = readUploads(body.files);
    if (typeof files === "string") {
      return Response.json({ error: files }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "Reading papers isn't switched on here yet." },
        { status: 503 },
      );
    }

    const asked = await ask(
      QUESTIONS_SYSTEM,
      QUESTIONS_SCHEMA,
      EFFORT,
      [
        ...pageBlocks(files),
        {
          type: "text",
          text: `These are ${files.length === 1 && files[0].mediaType === "application/pdf" ? "the pages of one PDF" : `${files.length} photos, in order`}. Read the paper.`,
        },
      ],
      "read",
    );
    if (!asked.ok) return Response.json({ error: asked.error }, { status: 502 });
    const raw = asked.data;

    const lastLine = Math.min(400, int(raw.lastLine));
    if (lastLine < 1) {
      return Response.json(
        {
          error:
            "No numbered source on those pages. Check the page numbers include the one headed Source A.",
        },
        { status: 422 },
      );
    }
    const sourcePages = (Array.isArray(raw.sourcePages) ? raw.sourcePages : [])
      .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1)
      .slice(0, 4);

    const q1 = obj(raw.q1);
    const q2 = obj(raw.q2);
    const q3 = obj(raw.q3);
    const q4 = obj(raw.q4);
    const q5 = obj(raw.q5);

    const parts: TickPart[] = (Array.isArray(q1.parts) ? q1.parts : [])
      .slice(0, 8)
      .map((p: unknown) => {
        const o = obj(p);
        const options = strs(o.options, 6);
        const correct = int(o.correct);
        return {
          prompt: str(o.prompt, 300),
          options,
          correct: correct >= 0 && correct < options.length ? correct : -1,
          line: int(o.line),
        };
      })
      .filter((p) => p.prompt && p.options.length >= 2);

    const paper: ReadPaper = {
      paperName: str(raw.paperName, 120),
      q1: { present: bool(q1.present), from: int(q1.from), to: int(q1.to), parts },
      q2: {
        present: bool(q2.present),
        from: int(q2.from),
        to: int(q2.to),
        question: str(q2.question, 500),
        focus: str(q2.focus, 120),
        hints: strs(q2.hints, 5),
      },
      q3: {
        present: bool(q3.present),
        question: str(q3.question, 500),
        focus: str(q3.focus, 60),
        hints: strs(q3.hints, 5),
      },
      q4: {
        present: bool(q4.present),
        from: int(q4.from),
        statement: str(q4.statement, 800),
        hints: strs(q4.hints, 5),
      },
      q5: {
        present: bool(q5.present),
        context: str(q5.context, 400),
        optionA: str(q5.optionA, 600),
        optionB: str(q5.optionB, 600),
        hasPicture: bool(q5.hasPicture),
      },
    };

    const questions = paperToQuestions(paper, lastLine);
    if (questions.length === 0) {
      return Response.json(
        {
          error:
            "No questions found on those pages. Check the page numbers include the question pages.",
        },
        { status: 422 },
      );
    }
    return Response.json({
      paperName: paper.paperName,
      sourcePages,
      questions,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("[sheets/paper] API error", err.status, err.message);
      // The status and error type go on screen, so a screenshot says what
      // happened. Neither carries anything private: no key, no request body.
      const body = err.error as { error?: { type?: unknown } } | undefined;
      const type = typeof body?.error?.type === "string" ? body.error.type : err.name;
      const code = [err.status, type].filter(Boolean).join(" ");
      return Response.json(
        {
          error: `The paper reader had a hiccup${code ? ` (${code})` : ""}. Give it another go?`,
        },
        { status: 502 },
      );
    }
    console.error("[sheets/paper] failed:", err);
    return Response.json(
      { error: "Something went wrong at our end. Try that again." },
      { status: 500 },
    );
  }
});
