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

**It is deliberately unset right now, and that is a decision rather than an
oversight.** The gate is built, tested and working; the apps are open because
only Elena has the link and the data is flashcards, scores and a streak count.
Turning it on is one line:

```bash
# in the Vercel project's environment variables
DOODLE_PASSCODE=some-long-passphrase-she-will-remember
```

Then redeploy. She enters it once per device and the apps behave exactly as they
do now. Nothing else changes.

Reasons to turn it on later: a custom domain, since the domain name lands in
public Certificate Transparency logs and becomes discoverable in a way a
`*.vercel.app` subdomain does not; or Anthropic billing showing calls you cannot
account for, since an open `/api/generate` and `/api/sheets/generate` are both
ways for a stranger to spend the credits on your key.

While it is off, production logs a warning at boot and every page shows a small
amber "No passcode set" pill, so the open state is visible rather than assumed.
A typo in the variable name reports as a probable typo rather than reading as a
deliberate choice.

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
Forgetful Doodle uses is touched.

**Setting it up needs no terminal.** Two steps:

1. Paste `scripts/schema.sql` into the Neon console SQL editor and run it. It
   creates both tables and prints them back so you can see it worked. Safe to
   run again; every statement is guarded.
2. Open `/ummm-less-panic` and press **Load the history sheet**. The 39
   questions ship as a static file and go in through the same route a
   hand-built sheet uses, so they are validated on the way like anything else.

Once it is loaded, the same control reads **bring the history sheet up to
date** and stays available. Pressing it again updates that sheet in place:
the hints are refreshed and her answers are untouched, because nothing is
deleted and `created_at` is left alone. That is the operation to use every
time a sheet is improved, and it is why there is no delete control.

Matching runs on the sheet's id first, then on its title. The title step is
there because a sheet loaded before ids were fixed carries a generated id with
a random suffix that nothing can predict. It only acts on an unambiguous single
match, and only for the shipped sheet, since a sheet built by hand never sends
an id and is always created fresh.

`revision_answer.sheet_id` references the sheet and cascades on delete, so
answers cannot outlive the sheet they belong to and a sheet id that does not
exist cannot have answers written against it. Deleting a sheet is one
statement as a result.

If you do have a terminal with the connection string, `node --env-file=.env.local
scripts/init-revision-db.mjs` does the same as step 1.

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
