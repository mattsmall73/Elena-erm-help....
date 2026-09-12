import type { Question, QuestionType } from "@/lib/revision-db";
import { withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5";

const SYSTEM = `You turn a student's exam questions into revision cards.

For each question return:
- label: question type and mark tariff, e.g. "Describe one feature (4 marks)", "Explain why (12 marks)", "How far do you agree (16 marks)". Work the tariff out from the wording. If it is genuinely unclear, leave the tariff off.
- type: one of "short", "long", "judge". Use "short" for recall or single-feature answers, "long" for extended explanation, "judge" for anything asking how far the student agrees or which factor mattered most.
- prompt: the question itself, cleaned up. Keep the student's wording. Fix obvious typos in names.
- given: any "you may use" or "in your answer" material, as one sentence. Empty string if there is none.
- shape: 2 to 5 steps describing how to structure the answer, written as instructions to the student.
- hints: 3 to 6 bullets of content the student could use. These are memory prompts, not a model answer. Never write the answer out. For judgement questions cover both sides, marking them "For:" and "Against:", and end with one line starting "A judgement to consider:".

Writing rules, which matter:
- No em dashes anywhere, and no dashes standing in for commas.
- No "X, not Y" closing constructions.
- Plain words. The student is sixteen, tired, and revising. Say the thing.
- No encouragement or chat in these fields. They are working notes.

Accuracy matters more than fluency. If you are unsure of a date or a name, leave it out rather than guessing.

Return JSON only. No preamble, no markdown fences:
{"questions":[{"label":"","type":"","prompt":"","given":"","shape":[""],"hints":[""]}]}`;

export const POST = withSession(async (request) => {
  try {
    const body = (await request.json()) as { subject?: string; questions?: string[] };

    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return Response.json({ error: "No questions were sent." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "The Anthropic API key is missing from the environment." },
        { status: 500 }
      );
    }

    const userText =
      `Subject: ${body.subject || "not stated"}\n\nQuestions:\n` +
      body.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!res.ok) {
      // Upstream detail is logged, not returned: it can carry request and key
      // context, and Elena can do nothing with it either way.
      console.error("[sheets/generate] model call failed", res.status, await res.text());
      return Response.json(
        { error: "The deck-maker had a hiccup. Give it another go?" },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };

    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed: { questions?: unknown };
    try {
      parsed = JSON.parse(text) as { questions?: unknown };
    } catch {
      return Response.json(
        { error: "The model did not return usable JSON. Try that batch again." },
        { status: 502 }
      );
    }

    const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
    const allowed: QuestionType[] = ["short", "long", "judge"];

    const questions: Question[] = raw
      .map((item) => {
        const q = item as Partial<Question>;
        return {
          label: typeof q.label === "string" ? q.label : "",
          type: allowed.includes(q.type as QuestionType) ? (q.type as QuestionType) : "long",
          prompt: typeof q.prompt === "string" ? q.prompt : "",
          given: typeof q.given === "string" ? q.given : "",
          shape: Array.isArray(q.shape) ? q.shape.filter((s): s is string => typeof s === "string") : [],
          hints: Array.isArray(q.hints) ? q.hints.filter((h): h is string => typeof h === "string") : [],
        };
      })
      .filter((q) => q.prompt.length > 0);

    return Response.json({ questions });
  } catch (err) {
    // The message stays server-side. A Postgres error names tables, columns
    // and sometimes the connection, and this reached the browser verbatim.
    console.error("[sheets] request failed:", err);
    return Response.json(
      { error: "Something went wrong at our end. Try that again." },
      { status: 500 },
    );
  }
});
