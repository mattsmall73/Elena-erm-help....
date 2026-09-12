import Anthropic from "@anthropic-ai/sdk";
import type { Question, QuestionType } from "@/lib/revision-db";
import { withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5";

/**
 * Thinking is on by default on this model, and thinking tokens count against
 * max_tokens, so the old 8000 could be spent before the JSON was finished and
 * come back truncated. Streaming keeps a longer turn inside the SDK's HTTP
 * timeout; the ceiling is generous because hitting it means a retry.
 *
 * effort "medium" is the cost-saving step below the default. The work is
 * classification and structuring rather than hard reasoning, and a batch of
 * four has to finish inside maxDuration. Raise it to "high" if the hints come
 * back thin.
 */
const MAX_TOKENS = 16000;
const EFFORT = "medium" as const;

/** Bounds on the request, so an open route cannot run up the API bill. */
const MAX_QUESTIONS_PER_CALL = 12;
const MAX_QUESTION_CHARS = 2000;
const MAX_SUBJECT_CHARS = 100;

/**
 * Structured output schema. The response is now shaped by the API rather than
 * by asking for JSON and hoping, which is what the markdown-fence stripping
 * and the parse-failure branch used to be for.
 *
 * Deliberately inside the same vocabulary app/api/generate/route.ts uses:
 * type, properties, items, required, additionalProperties, description. The
 * subset has no minItems/maxItems, so the counts are steered in the prompt and
 * clamped below.
 */
const SHEET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: {
            type: "string",
            description:
              'Question type and mark tariff, e.g. "Explain why (12 marks)". Omit the tariff if genuinely unclear.',
          },
          type: {
            type: "string",
            description: 'One of "short", "long" or "judge".',
          },
          prompt: {
            type: "string",
            description: "The question itself, cleaned up, in her wording.",
          },
          given: {
            type: "string",
            description:
              'Any "you may use" material as one sentence. Empty string if there is none.',
          },
          shape: {
            type: "array",
            items: { type: "string" },
            description: "2 to 5 steps describing how to structure the answer.",
          },
          hints: {
            type: "array",
            items: { type: "string" },
            description:
              "4 to 7 fragments of content she could use, separated by the middle dot. Never sentences, because a sentence can be pasted.",
          },
        },
        required: ["label", "type", "prompt", "given", "shape", "hints"],
      },
    },
  },
  required: ["questions"],
} as const;

const SYSTEM = `You turn a student's exam questions into revision cards.

For each question:
- label: question type and mark tariff, e.g. "Describe one feature (4 marks)", "Explain why (12 marks)", "How far do you agree (16 marks)". Work the tariff out from the wording. If it is genuinely unclear, leave the tariff off.
- type: one of "short", "long", "judge". Use "short" for recall or single-feature answers, "long" for extended explanation, "judge" for anything asking how far the student agrees or which factor mattered most.
- prompt: the question itself, cleaned up. Keep the student's wording. Fix obvious typos in names.
- given: any "you may use" or "in your answer" material, as one sentence. Empty string if there is none.
- shape: 2 to 5 steps describing how to structure the answer, written as instructions to the student.
- hints: fragments, never sentences. Each carries a fact and cannot be pasted into an answer as it stands, because building the sentence is the work.

  Wrong: "Imposed by Pope Innocent III in March 1208 after John refused to accept Stephen Langton as Archbishop of Canterbury."

  Right: "Pope Innocent III · March 1208 · trigger was Langton refused as Archbishop"

  Use the middle dot to separate parts. Keep names and dates in full, since those are the things worth recalling exactly. Four to seven fragments per question, ordered so the first is the most useful if she only opens one. For judgement questions, prefix with "For:" and "Against:" and end with one fragment starting "Judgement:".

Writing rules, which matter:
- No em dashes anywhere, and no dashes standing in for commas.
- No "X, not Y" closing constructions.
- Plain words. The student is sixteen, tired, and revising. Say the thing.
- No encouragement or chat in these fields. They are working notes.

Accuracy matters more than fluency. If you are unsure of a date or a name, leave it out rather than guessing.

Return one entry per question given, in the same order.`;

const ALLOWED_TYPES: readonly QuestionType[] = ["short", "long", "judge"];

export const POST = withSession(async (request) => {
  try {
    const body = (await request.json()) as {
      subject?: string;
      questions?: string[];
    };

    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return Response.json({ error: "No questions were sent." }, { status: 400 });
    }
    if (body.questions.length > MAX_QUESTIONS_PER_CALL) {
      return Response.json(
        { error: `Send at most ${MAX_QUESTIONS_PER_CALL} questions at a time.` },
        { status: 400 },
      );
    }
    const asked = body.questions.filter(
      (q): q is string => typeof q === "string" && q.trim().length > 0,
    );
    if (asked.length === 0) {
      return Response.json({ error: "No questions were sent." }, { status: 400 });
    }
    if (asked.some((q) => q.length > MAX_QUESTION_CHARS)) {
      return Response.json(
        { error: "One of those questions is far too long." },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "Sheet building isn't switched on here yet." },
        { status: 503 },
      );
    }

    const subject = (body.subject ?? "").slice(0, MAX_SUBJECT_CHARS).trim();
    const userText =
      `Subject: ${subject || "not stated"}\n\nQuestions:\n` +
      asked.map((q, i) => `${i + 1}. ${q}`).join("\n");

    const client = new Anthropic();

    // Streamed so a longer turn cannot trip the request timeout; finalMessage
    // gives the assembled response without handling events by hand.
    const message = await client.messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          effort: EFFORT,
          format: {
            type: "json_schema",
            schema: SHEET_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
      })
      .finalMessage();

    if (message.stop_reason === "refusal") {
      console.error(
        "[sheets/generate] declined:",
        message.stop_details?.category,
        message.stop_details?.explanation,
      );
      return Response.json(
        {
          error:
            "The deck-maker wouldn't take that batch. Try rewording those questions.",
        },
        { status: 502 },
      );
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // The schema constrains the shape, so this is a guard rather than a parser.
    let parsed: { questions?: unknown };
    try {
      parsed = JSON.parse(text) as { questions?: unknown };
    } catch {
      console.error("[sheets/generate] unparseable body, stop_reason:", message.stop_reason);
      return Response.json(
        { error: "That batch came back unreadable. Try it again." },
        { status: 502 },
      );
    }

    const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions: Question[] = raw
      .map((item) => {
        const q = item as Partial<Question>;
        return {
          label: typeof q.label === "string" ? q.label : "",
          type: ALLOWED_TYPES.includes(q.type as QuestionType)
            ? (q.type as QuestionType)
            : "long",
          prompt: typeof q.prompt === "string" ? q.prompt : "",
          given: typeof q.given === "string" ? q.given : "",
          shape: Array.isArray(q.shape)
            ? q.shape.filter((s): s is string => typeof s === "string")
            : [],
          hints: Array.isArray(q.hints)
            ? q.hints.filter((h): h is string => typeof h === "string")
            : [],
        };
      })
      .filter((q) => q.prompt.length > 0);

    if (questions.length === 0) {
      return Response.json(
        { error: "Nothing usable came back for that batch. Try it again." },
        { status: 502 },
      );
    }

    return Response.json({ questions });
  } catch (err) {
    // Typed classes rather than string matching, and the detail stays here:
    // it can carry request and key context she can do nothing with.
    if (err instanceof Anthropic.APIError) {
      console.error("[sheets/generate] API error", err.status, err.message);
      return Response.json(
        { error: "The deck-maker had a hiccup. Give it another go?" },
        { status: 502 },
      );
    }
    console.error("[sheets/generate] failed:", err);
    return Response.json(
      { error: "Something went wrong at our end. Try that again." },
      { status: 500 },
    );
  }
});
