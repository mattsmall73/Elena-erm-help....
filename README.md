# Elena's Apps

Two revision apps behind one menu, sharing a stack, a database and a passcode.

- **`/`** — the menu.
- **`/forgetful-doodle`** — Forgetful Doodle 2.0, below. Fast competitive recall.
- **`/ummm-less-panic`** — Ummm Less Panic. Written exam questions, one at a
  time, with an answer structure and memory prompts. Light surface, serif
  reading face, nothing timed and nothing scored.

The arcade used to sit at the root. It moved to `/forgetful-doodle` so the menu
could have that address, and the old link now lands on the menu.

---

# Forgetful Doodle 2.0 — _for Elena_

Fast, competitive active recall — the warm-up before the formal work. One card at
a time: **say the answer out loud, flip, self-mark** _Nailed it / Nearly / Nope_.
Beat your past self, keep the daily streak. Part of a family of study apps
(Sentiero, Help!); this one is the ignition, and it stays narrow — recall as play.

Built with **Next.js (App Router) + TypeScript + Tailwind v4**, deployed to
**Vercel**, with a serverless **Claude API** proxy and **Vercel Postgres** for
persistence.

## The loop

- **Rounds of 10 cards.** Prompt → "say it out loud, then flip" → reveal →
  self-mark.
- **Streak multiplier.** Consecutive "Nailed it" scores 10 → 20 → 30 → 40 → 50
  (capped ×5). "Nearly" / "Nope" reset the multiplier and re-queue the card later
  in the round (a card comes back at most 4 times).
- **Opponent = your past self.** Per-deck best is shown as the target; beating it
  celebrates. Plus a daily streak.
- **Arcade look.** Dark base with neon cyan (score / answer / card glow) and
  magenta (streak) — the glow is the personality. Comfort-reading toggle;
  `prefers-reduced-motion` respected.

## Decks

Seed decks ship built-in so it's full on first open — History (Edexcel), RS (AQA),
Dance (AQA anthology), English Literature (AQA). Combined Science, Maths, Food
Prep & Nutrition and English Language generate on demand.

**Make your own** from the `+ New deck` button:

- **AI (Claude Sonnet 5)** — name a topic, or drop in notes / a photo of a
  revision-guide page, and pick the subject. Produces 8–12 short, say-aloud cards.
  For History, English Literature and RS a topic or notes is required (the content
  is the school's specific choice — free-running produces confident, wrong cards).
- **Hand-build** — type your own cards (typing them is itself revision).

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

The app runs with no configuration: AI deck-making is disabled without an API
key, and progress saves to browser `localStorage` without a database.

Copy `.env.example` to `.env.local` and fill in what you want:

- `ANTHROPIC_API_KEY` — enables AI deck generation (server-side only).
- `POSTGRES_URL` — enables cross-device persistence of best scores, day streak
  and custom decks. Provided automatically when a Vercel Postgres store is
  linked.
- `DOODLE_PASSCODE` — locks the app. See below. Leave it unset locally.
- `DOODLE_USER_ID` — which profile to read and write. Defaults to `elena`.

## The passcode

Set `DOODLE_PASSCODE` and every page and every `/api` route requires it. It is
entered once per device on `/unlock` and kept in a signed, `httpOnly` cookie for
a year.

Leave it unset and everything is open to anyone with the URL, which is how the
app behaved before the gate existed and how it stays convenient locally. Set it
in production, because an open `/api/generate` is also a way for a stranger to
spend the credits on your API key.

Two things worth knowing:

- **Changing it signs every device out.** The cookie is signed with a key
  derived from the passcode, so rotating one invalidates the other.
- **Make it long.** A failed attempt costs CPU by design, since a serverless
  function has nowhere to count attempts. That raises the cost of guessing
  rather than removing it.

`proxy.ts` turns unauthenticated traffic away early, and every route also checks
for itself through `withSession` in `lib/session.ts`. A new route gets the first
layer automatically and should be written with the second:

```ts
export const GET = withSession(async (req, ctx, session) => { /* ... */ });
```

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add a **Postgres** store to the project (Storage tab) — it sets `POSTGRES_URL`.
   The schema is created automatically on first request.
3. Add the `ANTHROPIC_API_KEY` environment variable.
4. Add `DOODLE_PASSCODE`. Without it the deployment is open to anyone with
   the URL.
5. Deploy.

## Project layout

- `app/` — routes: Arcade home (`page.tsx`), `play/[deckId]`, `new`, and the
  `api/generate` (Claude proxy) + `api/state` (persistence) route handlers.
- `components/` — `Arcade`, `Round` (the game loop), `ProfileProvider` (state +
  localStorage/server sync).
- `lib/` — `round.ts` (pure game engine), `seed-decks.ts`, `subjects.ts`,
  `types.ts`, `db.ts` (Vercel Postgres), `session-token.ts` (pure passcode and
  cookie signing), `session.ts` (cookies and the `withSession` wrapper),
  `profile-merge.ts` (local/server reconcile), `validate-profile.ts` (incoming
  body checks), `downscale-image.ts` (shrinks a photo before upload),
  `safe-json.ts` (reads a response body as text before parsing), `user.ts`.
- `proxy.ts` — the passcode gate, in front of every route.

### Ummm Less Panic

- `app/ummm-less-panic/page.tsx` — the whole app.
- `app/api/sheets/` — list and create, open and delete, save an answer, and
  `generate` which turns pasted questions into cards.
- `lib/revision-db.ts` — its database access, separate from `lib/db.ts` so
  fixing one app cannot break the other. Same client, same `POSTGRES_URL`.

Two tables of its own, `revision_sheet` and `revision_answer`. Nothing
Forgetful Doodle uses is touched. Create and seed them once:

```bash
node --env-file=.env.local scripts/init-revision-db.mjs
node --env-file=.env.local scripts/seed-history.mjs
```

Both are safe to run again. The table creation is wrapped in a transaction, so
a failure halfway leaves the database as it was.

**The hints on a generated sheet come from a model, so they can be wrong.** It
is told to leave out anything it is unsure of rather than guess, and that mostly
holds. Where a wrong date costs marks, check a surprise against your notes. The
sheet is a prompt, not gospel.

## Privacy

Single user — no accounts, no leaderboards against other people (the opponent is
always your past self). What's done in the app stays in the app.

The passcode is not an account. There is no email, no username and no profile
beyond flashcards, scores and a streak count. One passcode, one profile, shared
by whichever devices hold it.
