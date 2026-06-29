# Language Learning App — MVP Architecture

Architecture, Firestore schema, security rules, and implementation plan for the
initial functional prototype. Built on **Firebase** (Authentication, Firestore,
Cloud Storage, Cloud Functions). Focus: core functionality, architecture, and
security — UI styling is out of scope for this phase.

## Core features
- **A. Task-based vocabulary** — type a daily activity, get a level-appropriate word/sentence list.
- **B. Vocabulary library** — alphabetical by default, filterable by date added.
- **C. FRED** — AI speaking coach: record audio → transcript → feedback + score.
- **D. Gamification** — streaks + Star Points (server-authoritative).
- **E. Gazelle mascot** — outfit unlocks tied to streaks.
- **F. Profiles & social graph** — friend requests, public profiles.
- **G. Friendly competition** — challenge friends to FRED sprints.

## Deliverables in this repo
| File | What it is |
|------|-----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System diagram + how AI requests are secured (FRED flow, cost/token control). |
| [`docs/FIRESTORE_SCHEMA.md`](docs/FIRESTORE_SCHEMA.md) | Collections, subcollections, and document structures. |
| [`firestore.rules`](firestore.rules) | Security rules: strict user isolation + membership-gated social data. |
| [`storage.rules`](storage.rules) | Per-user isolation for audio and avatars. |
| [`firestore.indexes.json`](firestore.indexes.json) | Composite indexes for the documented queries. |
| [`functions/index.js`](functions/index.js) | Reference Cloud Function skeleton (FRED, vocab gen, points, profile sync). |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Phased build order; where FRED fits in the MVP. |

## Security model in one paragraph
The client holds **no secrets** and can **never write its own scores**. It reads
its own data directly from Firestore (rules-enforced) and uploads audio to its
own Storage folder. Every paid-AI call and every point/streak/outfit change goes
through a **Cloud Function** that authenticates the caller, verifies **App
Check**, enforces a **per-user quota**, reads the API key from **Secret
Manager**, and writes authoritative results via the **Admin SDK** (which bypasses
rules). FRED sessions, gamification fields, public profiles, and challenge scores
are therefore read-only or closed to clients — the server is the sole author.

## Local development
```bash
cd functions && npm install && cd ..
firebase emulators:start          # auth, firestore, storage, functions
```
Deploy security first, then features:
```bash
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
firebase deploy --only functions
```
