# Step-by-Step Implementation Plan

Ordered to maximize compounding: each phase unblocks the next and is independently demoable. **FRED is deliberately placed in the middle of the MVP** — after the secure spine exists, but as the headline feature it must ship inside the MVP, not after.

## Phase 0 — Project & security spine (foundation)
1. Create the Firebase project; enable Auth, Firestore, Storage, Functions (Blaze plan — required for outbound AI calls).
2. Commit `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` (already in this repo) and deploy them **first** — security before features.
3. Stand up the Firebase Emulator Suite for local dev so rules/functions are tested without touching prod.
4. Enable **App Check** (debug provider locally; reCAPTCHA/DeviceCheck/Play Integrity in prod).

## Phase 1 — Auth & user profile (feature F, part 1)
1. Email/password (and/or Google) sign-in.
2. On first sign-in, create `users/{uid}` with `starPoints: 0`, `streak.current: 0`, `mascot.level: 1` (enforced by create rule).
3. Profile edit screen (displayName, languages, fluency level, avatar upload to `avatars/{uid}/`).
4. Deploy `syncPublicProfile` so `public_profiles/{uid}` exists for later social features.
**Demoable:** sign up, edit profile, isolated per-user data.

## Phase 2 — Task-based vocabulary + library (features A & B)
1. Task input UI → write `users/{uid}/tasks/{taskId}` with `status: requested`.
2. Deploy `generateVocabulary` Cloud Function (LLM key isolated in Secret Manager). This is the **first paid-API integration** and proves the secure server pattern end-to-end on a low-risk feature before FRED.
3. Vocabulary Library: list `users/{uid}/vocabulary` ordered by `wordLower` (alphabetical default) with a toggle to `createdAt` and a date-range filter (uses the composite index).
**Demoable:** type an activity → get a level-appropriate word/sentence list → browse the library.

## Phase 3 — FRED, the AI speaking coach (feature C) ⭐ MVP centerpiece
> FRED reuses the exact secure pattern proven in Phase 2 (callable function + Secret Manager + Admin SDK writes), now with audio.
1. Client audio capture → upload to `audio/{uid}/{sessionId}`.
2. Deploy `fredTurn`: App Check + auth + quota guards → transcribe → GPT-4o analysis → write `fred_sessions` → return feedback.
3. Session UI: prompt, record, see transcript + `analysis_text` + `performance_score`.
4. Add Storage lifecycle rule to auto-delete raw audio (cost + privacy).
5. Add GCP budget alerts and verify per-user quota enforcement.
**Demoable:** speak to FRED, get pronunciation/grammar feedback and a score.

## Phase 4 — Gamification, streaks & mascot (features D & E)
1. `awardPoints` (already called by FRED) becomes the single server-authoritative entry point for Star Points + streak + outfit unlock.
2. Hook mini-games into the same `awardPoints` path.
3. Build the Gazelle mascot screen: current level, equipped/unlocked outfits, streak counter.
**Demoable:** earning points from FRED/games advances streak and unlocks a Gazelle outfit.

## Phase 5 — Social graph (feature F, part 2)
1. User search via `public_profiles`.
2. Friend requests: create/accept/decline/remove on `connections` (membership-gated rules).
3. Public profile view (streak, stars, mascot) and a friends leaderboard from `public_profiles`.
**Demoable:** add a friend, view their public stats.

## Phase 6 — Friendly competition (feature G)
1. Create a challenge (`fred_sprint`) → opponent accepts → `status: active`.
2. FRED sessions tagged with `challengeId` feed `progressChallenge` server-side.
3. Resolve winner on target/expiry, award bonus Star Points, surface results.
**Demoable:** challenge a friend to a FRED sprint and see a winner.

## Phase 7 — Hardening before launch
- Account-deletion function (purges subcollections, storage, public profile, connections).
- Tighten quotas/budgets from real usage data.
- Security-rules unit tests (`@firebase/rules-unit-testing`) for isolation + social access.
- Crash/error logging and basic analytics.

---

## Where does FRED fit?
FRED is **in the MVP (Phase 3)** — it's the differentiating feature, so cutting it would gut the product. But it is intentionally **not first**: it depends on the auth/profile spine (Phase 1) and is safest to build once the secure Cloud Function pattern has already been proven on the lower-risk vocabulary generator (Phase 2). That sequencing de-risks the most expensive, most security-sensitive feature.
