# Implementation Plan

Ordered so each phase unblocks the next and is independently demoable. Phases
0–6 are **implemented in this repository**; phase 7 is the pre-launch work that
depends on a live project and real users.

## Phase 0 — Security spine ✅
1. Postgres schema with constraints and enums (`0001_schema.sql`).
2. RLS enabled on every table, grants revoked, column-freeze triggers
   (`0002_rls.sql`) — **written before any feature**, not retrofitted.
3. Server-authoritative functions (`0003_functions.sql`).
4. Buckets with size/MIME limits and owner-scoped policies (`0004_storage.sql`).

## Phase 1 — Auth & profile ✅
Email/password sign-in; a trigger provisions `profiles` + `user_stats` on
signup; onboarding captures username, languages and CEFR level; settings screen
with the privacy toggle.
*Demo: sign up, complete onboarding, edit profile.*

## Phase 2 — Task-based vocabulary & library ✅
`generate-vocabulary` Edge Function — the **first paid-API integration**, and
deliberately the simpler one, so the secure pattern (JWT → quota → secret → AI →
validated write) is proven before FRED depends on it. Library sorts
alphabetically by default, filters by date added, and searches.
*Demo: type an activity → get a word list → browse it.*

## Phase 3 — FRED ⭐ ✅
Audio capture → upload to the caller's own storage folder → `fred-turn`
transcribes, analyses with GPT-4o, writes the session, awards points, and
deletes the recording.
*Demo: speak, get a score and coaching feedback.*

## Phase 4 — Gamification & mascot ✅
`award_points()` is the single authoritative entry point for Star Points,
streaks and outfit unlocks; `equip_outfit()` validates ownership. Mascot screen
shows level, unlocked outfits and the next threshold.
*Demo: a FRED session advances the streak and unlocks an outfit.*

## Phase 5 — Social graph ✅
User search over `public_profiles`, friend requests with asymmetric accept
rules, friends list, and a leaderboard.
*Demo: search a username, send and accept a request.*

## Phase 6 — Friendly competition ✅
FRED sprint challenges, friends-only, with server-written scores and automatic
winner settlement.
*Demo: challenge a friend, run sessions, see a winner.*

## Phase 7 — Pre-launch hardening ⬜
Needs a live project; tracked in [SECURITY.md](SECURITY.md) §5–6.
1. Turn on email confirmation, password policy, auth rate limiting, CAPTCHA.
2. Run the Supabase security advisor; fix anything it flags.
3. Add RLS regression tests (pgTAP or a two-user integration suite) that assert
   user A cannot read or write user B's rows.
4. Spend caps and billing alerts on OpenAI.
5. CSP and security headers on the frontend host.
6. Backups / PITR, then a load and abuse test.

---

## Where FRED fits
FRED is the differentiator, so it ships **inside** the MVP — but not first. It
needs the auth spine (phase 1), and it is far safer to build once the secure
Edge Function pattern has been proven on the cheaper vocabulary generator
(phase 2). That ordering de-risks the most expensive and most
security-sensitive feature in the product.

## Suggested next steps
1. **Stand up a Supabase project** and run the migrations; verify the security
   advisor is clean.
2. **Write the RLS regression tests** (phase 7.3) — the single highest-value
   addition now that the policies exist.
3. **Mini-games** for feature D, routed through `award-game-points`.
4. **React Native port** — the client is plain React + TypeScript with all data
   access behind `src/lib/api.ts`, so the pages port with the data layer intact.
