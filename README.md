# Linguafox — language learning app (MVP)

Learn the words your day actually needs, then practise saying them out loud with
**FRED**, an AI speaking coach.

Built on **Supabase** (Postgres + Auth + Storage + Edge Functions) with a
**React + TypeScript** client — warm cream-and-orange theme, five-tab
navigation, customisable avatars.

## Features

| | Feature | Status |
|---|---------|--------|
| A | **Task-based vocabulary** — describe an activity, get a level-appropriate word & sentence list | ✅ |
| B | **Vocabulary library** — one card per word with every context it appears in; alphabetical by default, filter by date, search | ✅ |
| C | **FRED** — record speech, get transcription, coaching feedback and a score | ✅ |
| D | **Gamification** — streaks, XP and four mini-games, server-authoritative | ✅ |
| E | **Avatars & leagues** — ten avatars to choose from, XP leagues Kit → Elder | ✅ |
| F | **Profiles & friends** — search, friend requests, public profiles, leaderboard | ✅ |
| G | **Friendly competition** — FRED sprint challenges between friends | ✅ |

Screens: **[docs/SCREENS.md](docs/SCREENS.md)**

## Documentation

| Doc | Contents |
|-----|----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, the FRED loop, cost control, where authorisation lives |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Tables, columns, indexes, functions and the reasoning behind them |
| [SECURITY.md](docs/SECURITY.md) | Threat model, 23 mitigations, deployment checklist, known gaps |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Build order and what ships when |
| [SCREENS.md](docs/SCREENS.md) | Every page, captured from the running app |

## Layout

```
supabase/
  migrations/       0001 schema · 0002 RLS · 0003 functions · 0004 storage
  functions/        fred-turn, generate-vocabulary, award-game-points, delete-account
app/
  src/pages/        one file per screen
  src/lib/          api (single data-access layer), session, types
docs/
```

## Running it

### Frontend, no backend needed
```bash
cd app
npm install
npm run dev          # http://localhost:5173
```
Without `.env` the app runs in **demo mode** against an in-memory store, so every
screen works offline. Useful for design review.

### Against a real Supabase project
```bash
cp app/.env.example app/.env      # fill in URL + anon key
supabase db push                  # apply migrations
supabase functions deploy fred-turn generate-vocabulary award-game-points delete-account
supabase secrets set OPENAI_API_KEY=sk-...  ALLOWED_ORIGINS=https://your-app.com
```

## Security in one paragraph

Every user is treated as a potential attacker holding a valid JWT and the public
anon key. Row Level Security isolates all data in Postgres; a `public_profiles`
view provides column-level privacy that RLS alone cannot. Star Points, streaks,
FRED sessions and challenge scores are written **only** by SECURITY DEFINER
functions the client has no permission to execute, so scores cannot be forged.
The AI key lives in Edge Function secrets and never reaches the browser, and a
per-user daily quota bounds spend. Full detail — including known gaps — in
[SECURITY.md](docs/SECURITY.md).
