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
| [SECURITY.md](docs/SECURITY.md) | Threat model, mitigations, deployment checklist, known gaps |
| [PENTEST.md](docs/PENTEST.md) | Adversarial review: 4 findings (1 high) with fixes, plus what was probed and cleared |
| [AUTH.md](docs/AUTH.md) | Sign-up, confirmation, the 24-hour purge, password reset, deletion |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Build order and what ships when |
| [SCREENS.md](docs/SCREENS.md) | Every page, captured from the running app |

## Layout

```
supabase/
  migrations/   0001 schema · 0002 RLS · 0003 functions · 0004 storage · 0005 auth lifecycle
  functions/    fred-turn, generate-vocabulary, award-game-points,
                delete-account, purge-unconfirmed
app/
  src/pages/    one file per screen
  src/lib/      api (single data-access layer), session, password policy, types
  scripts/      e2e.cjs — 30-check functional pass
  android/      Capacitor project (built into an APK by CI)
docs/
```

## Sharing a Supabase project

Everything lives in a dedicated **`linguafox` schema**, so this app can sit in
the same Supabase project as your other work without colliding with it:

- no object is created in, altered in, or revoked from `public`;
- no extensions are installed;
- **no trigger on `auth.users`** — profiles are provisioned lazily by
  `ensure_profile()`, so other apps' signups are untouched;
- storage buckets and policies are prefixed `linguafox-` / `linguafox_`;
- the unconfirmed-signup purge only ever deletes users tagged
  `raw_user_meta_data->>'app' = 'linguafox'`.

`drop schema linguafox cascade` removes the app entirely and leaves the rest of
the project intact.

## Android APK

The web app is wrapped with Capacitor. CI builds the APK:

**Actions → Build Android APK → Run workflow** → download the `linguafox-apk`
artifact. Set the repository secrets `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` first.

Locally (needs the Android SDK):
```bash
cd app && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
# app/android/app/build/outputs/apk/debug/app-debug.apk
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
supabase db push                  # creates the linguafox schema only
supabase functions deploy fred-turn generate-vocabulary award-game-points delete-account
supabase functions deploy purge-unconfirmed --no-verify-jwt
supabase secrets set OPENAI_API_KEY=sk-... ALLOWED_ORIGINS=https://your-app.com PURGE_SECRET=...
```
Then expose the schema to the API: **Settings → API → Exposed schemas** must
include `linguafox`. Auth settings that the security model depends on are
listed in [AUTH.md §6](docs/AUTH.md).

## Security in one paragraph

Every user is treated as a potential attacker holding a valid JWT and the public
anon key. Row Level Security isolates all data in Postgres; a `public_profiles`
view provides column-level privacy that RLS alone cannot. Star Points, streaks,
FRED sessions and challenge scores are written **only** by SECURITY DEFINER
functions the client has no permission to execute, so scores cannot be forged.
The AI key lives in Edge Function secrets and never reaches the browser, and a
per-user daily quota bounds spend. Full detail — including known gaps — in
[SECURITY.md](docs/SECURITY.md).
