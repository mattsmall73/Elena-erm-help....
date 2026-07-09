import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSubject } from "@/lib/subjects";

// Deck generation runs Claude Sonnet 5 through this serverless proxy so the
// API key stays server-side. Model per the brief.
const MODEL = "claude-sonnet-5";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  subjectId?: string;
  topic?: string;
  notes?: string;
  /** A photo of a revision-guide page or notes, as a data URL. */
  image?: string;
}

// Structured-output schema. (The API's JSON-schema subset doesn't support
// min/maxItems, so the 8–12 range is steered in the prompt and clamped below.)
const DECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description: "A short deck title based on the topic.",
    },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string", description: "The question, said aloud." },
          answer: { type: "string", description: "The short spoken answer." },
        },
        required: ["prompt", "answer"],
      },
    },
  },
  required: ["title", "cards"],
} as const;

const SYSTEM = `You make flashcard decks for a GCSE student who revises by saying answers out loud.

Rules for every card:
- One idea per card. No multi-part questions.
- Low reading load: keep the prompt short, and the answer to a sentence or two she can say aloud.
- Work from general GCSE knowledge, scoped to the topic or notes given.
- Be accurate. If you are unsure of a specific fact, keep the card to what is well established rather than guessing.
- No multiple choice, no "list 10 things" — these are for spoken free recall.
- Plain, clear wording. No exam technique, no marking guidance, no long feedback.

Return 8 to 12 cards.`;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return badRequest("Couldn't read that request.");
  }

  const subject = body.subjectId ? getSubject(body.subjectId) : undefined;
  if (!subject) return badRequest("Pick a subject first.");

  const topic = body.topic?.trim() ?? "";
  const notes = body.notes?.trim() ?? "";
  const hasContext = Boolean(topic || notes || body.image);

  // History, English Literature and RS need a topic or notes — free-running
  // produces confident, wrong cards for a school's specific choice.
  if (subject.requiresContext && !hasContext) {
    return badRequest(
      `For ${subject.name}, tell me the topic or drop in your notes first — otherwise I'll make confident, wrong cards.`,
    );
  }
  if (!hasContext) {
    return badRequest("Give me a topic to work from.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Keep local dev usable without a key: the client falls back to hand-build.
    return NextResponse.json(
      {
        error:
          "AI deck-making isn't switched on here yet. You can still build a deck yourself.",
      },
      { status: 503 },
    );
  }

  const client = new Anthropic();

  // Build the user turn: an optional image, then the instruction text.
  const content: Anthropic.ContentBlockParam[] = [];
  if (body.image) {
    const parsed = parseDataUrl(body.image);
    if (parsed) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.data,
        },
      });
    }
  }

  const lines: string[] = [`Subject: ${subject.name}`];
  if (subject.board) lines.push(`Exam board / context: ${subject.board}`);
  if (topic) lines.push(`Topic: ${topic}`);
  if (notes) lines.push(`Her notes:\n${notes}`);
  if (body.image) lines.push("Use the attached photo of her notes / revision guide as the source.");
  lines.push("\nMake a say-aloud recall deck from this.");
  content.push({ type: "text", text: lines.join("\n") });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "disabled" },
      output_config: {
        format: {
          type: "json_schema",
          schema: DECK_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });

    const text = message.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json(
        { error: "I couldn't make cards from that. Try a clearer topic?" },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(text.text) as {
      title?: string;
      cards?: { prompt?: string; answer?: string }[];
    };

    const cards = (parsed.cards ?? [])
      .filter((c) => c.prompt?.trim() && c.answer?.trim())
      .slice(0, 12)
      .map((c) => ({ prompt: c.prompt!.trim(), answer: c.answer!.trim() }));

    if (cards.length === 0) {
      return NextResponse.json(
        { error: "I couldn't make cards from that. Try a clearer topic?" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      title: parsed.title?.trim() || topic || subject.name,
      cards,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "The deck-maker had a hiccup. Give it another go?" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Something went wrong making that deck." },
      { status: 500 },
    );
  }
}

function parseDataUrl(
  dataUrl: string,
): { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return {
    mediaType: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
    data: match[2],
  };
}
