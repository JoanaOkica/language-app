# Cloud Functions — trusted server layer

TypeScript Cloud Functions (2nd gen). This is the **only** place that talks to
the paid AI API and the only place that writes scores/streaks/FRED sessions.

## Functions
| Export | Type | Purpose |
|--------|------|---------|
| `fredTurn` | callable | One FRED speaking turn: transcribe → GPT-4o analysis → save session → award points. |
| `generateVocabulary` | callable | Task-based word/sentence generation into the user's vocabulary. |
| `awardGamePoints` | callable | Mini-game Star Points (capped, server-validated). |
| `syncPublicProfile` | Firestore trigger | Mirrors public-safe fields into `public_profiles`. |
| `deleteMyAccount` | callable | Purges user data + auth account. |

## Source layout
```
src/
  index.ts          exports every function
  admin.ts          Admin SDK init (db, storage)
  config.ts         secrets, model ids, limits (cost/security knobs)
  guards.ts         auth + App Check + daily quota
  ai.ts             OpenAI integration (swappable in one file)
  gamification.ts   points + streak + mascot (server-authoritative)
  challenges.ts     FRED-sprint scoring
  fred.ts / vocabulary.ts / social.ts   the features
  types.ts          shared shapes
```

## Setup
```bash
cd functions
npm install
npm run build          # tsc -> lib/
```

### Provide the AI key
Production (Secret Manager):
```bash
firebase functions:secrets:set OPENAI_API_KEY
```
Local emulator: create `functions/.secret.local` (git-ignored):
```
OPENAI_API_KEY=sk-...
```

### Run locally
```bash
npm run serve         # build + start functions/firestore/auth/storage emulators
```

### Deploy
Deploy security rules first, then functions:
```bash
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
firebase deploy --only functions
```

## Security notes
- Every callable runs `requireTrustedCaller` → rejects unauthenticated **and**
  non–App Check calls before any paid API work.
- Per-user **daily session quota** + token recording live in `guards.ts`.
- The OpenAI key is read from Secret Manager at runtime via `config.ts`; it is
  never bundled to the client.
- Set a GCP **budget alert** as a final backstop.
