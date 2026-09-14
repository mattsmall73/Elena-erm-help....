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
              'Question type and mark tariff, e.g. "Explain why (12 marks)". ' +
              "Where spelling and grammar carry their own marks, say both: " +
              '"Respond to this question (30 marks, plus 4 for spelling and grammar)". ' +
              "Omit the tariff only if genuinely unclear.",
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
              "Anything the paper attaches to the question about what to use or " +
              'what to cover: "you may use" material, "in your answer you must" ' +
              'instructions, and coverage rubrics such as "Write about the extract ' +
              'and the play as a whole". The paper\'s own words, one sentence. ' +
              "Empty string only if the question carries nothing.",
          },
          shape: {
            type: "array",
            items: { type: "string" },
            description:
              "2 to 5 steps describing how to structure the answer, each saying " +
              "what she does rather than naming the exam move. \"End by saying " +
              "how far you agree\" rather than \"close with a judgement\".",
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

  A question can carry more than one total. Where marks for spelling, punctuation and grammar are given on their own, as AO4 is on an English Literature paper, say both and never fold them into one number or drop the smaller one.

    Wrong: "Respond to this question (30 marks)"
    Right: "Respond to this question (30 marks, plus 4 for spelling and grammar)"

  Those separate marks are the ones most often left on the table, and she cannot go after them if the label does not say they exist.
- type: one of "short", "long", "judge". Use "short" for recall or single-feature answers, "long" for extended explanation, "judge" for anything asking how far the student agrees or which factor mattered most.
- prompt: the question itself, cleaned up. Keep the student's wording. Fix obvious typos in names.
- given: anything the paper attaches to the question telling her what to use or what to cover. Three kinds, all of which belong here:

    "You may use the following" source or quotation material.
    "In your answer you must" instructions.
    Coverage rubrics, such as "Write about the extract and the play as a whole".

  Keep the paper's own words for a coverage rubric rather than paraphrasing it. One sentence. Empty string only if the question genuinely carries nothing.

  The coverage rubric is the most valuable thing this field holds. On an extract question, writing only about the extract caps the mark however good the writing is, and no amount of quality in the answer wins those marks back. A rubric left out of this field is the one omission here that costs marks on its own.
- shape: 2 to 5 steps describing how to structure the answer, written as instructions to the student. Say what she does, never what the move is called. Exam vocabulary names a thinking move without saying what to actually do with it, so replace every name with the action.

  close with a judgement  ->  end by saying how far you agree
  reach a conclusion      ->  end by saying which one mattered most and why
  weigh them              ->  say which one was worse
  make a judgement        ->  say which one you think it was
  evaluate                ->  say how well it worked
  analyse                 ->  say why it happened
  substantiate            ->  prove it with a real example
  consider the extent     ->  say how much of it was true
  by what measure         ->  choose how you are comparing them
  develop the point       ->  add a sentence saying why it mattered
  link back               ->  end the paragraph by answering the question

  Where the question says to write about both an extract and the whole work, one step has to send her past the extract. "Paragraph on where this comes back later in the play" is a step. "Cover the play as a whole" names the move and breaks the rule above.

  The test: could she act on the step without knowing any exam terminology? If not, rewrite it. A step is allowed to name a mark or a level, since those are facts she needs, and it may say a paragraph is where the top marks are. It may not tell her to do a thing the exam has a word for and leave the word standing in for the thing.
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
        /* One explicit breakpoint at the end of the system prompt, rather
           than top-level automatic caching.

           Automatic places its breakpoint on the last cacheable block, and
           both these requests end in content unique to the call. That would
           cache bytes that are never read back and charge the write premium
           on every one of them, which is worse than not caching at all. The
           marker here ends the shared prefix, so the varying tail sits
           outside it.

           The default five minute TTL is right: the calls that share this
           prefix come seconds apart, and every read refreshes the timer.

           Editing the prompt above invalidates the entry, so the first call
           after a deploy pays the write again. Two calls to break even. */
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userText }],
      })
      .finalMessage();

    /* Whether the breakpoint above is actually working is not visible from the
       outside, and a prefix that silently fails to cache reports no error: it
       just bills full price forever. These three numbers say which is
       happening. A read of zero on every call after the first means something
       in the prefix is changing between requests. */
    const u = message.usage;
    console.log(
      "[sheets/generate] tokens in:",
      `fresh ${u.input_tokens}`,
      `cache written ${u.cache_creation_input_tokens ?? 0}`,
      `cache read ${u.cache_read_input_tokens ?? 0}`,
    );

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
