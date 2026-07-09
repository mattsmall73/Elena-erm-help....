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

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add a **Postgres** store to the project (Storage tab) — it sets `POSTGRES_URL`.
   The schema is created automatically on first request.
3. Add the `ANTHROPIC_API_KEY` environment variable.
4. Deploy.

## Project layout

- `app/` — routes: Arcade home (`page.tsx`), `play/[deckId]`, `new`, and the
  `api/generate` (Claude proxy) + `api/state` (persistence) route handlers.
- `components/` — `Arcade`, `Round` (the game loop), `ProfileProvider` (state +
  localStorage/server sync).
- `lib/` — `round.ts` (pure game engine), `seed-decks.ts`, `subjects.ts`,
  `types.ts`, `db.ts` (Vercel Postgres).

## Privacy

Single user — no accounts, no leaderboards against other people (the opponent is
always your past self). What's done in the app stays in the app.
