# Firestore Schema Design

## Design principles

1. **Subcollections for private, user-owned data** (vocabulary, tasks, FRED sessions). They are always read in the context of one user and never queried across users, so nesting under `users/{uid}` gives automatic isolation and the simplest, safest rules.
2. **Top-level collections for relationships** (`connections`, `challenges`) that inherently involve two users.
3. **A dedicated `public_profiles` collection** for anything other users may see. Firestore security rules are all-or-nothing *per document* on reads — you cannot hide individual fields. So we never let other users read the full `users` doc; instead a Cloud Function mirrors only public-safe fields (displayName, photo, streak, stars) into `public_profiles/{uid}`.
4. **Denormalize for read efficiency.** Stats needed on profiles/leaderboards live directly on the document so a profile view is a single read.
5. **Server-authoritative scoring.** All point/streak/outfit fields are written only by Cloud Functions (Admin SDK), never by clients.

## Collection map

```
users/{uid}                         (private full profile)
  ├── vocabulary/{wordId}           (feature B — vocab library)
  ├── tasks/{taskId}                (feature A — task-based generation)
  ├── fred_sessions/{sessionId}     (feature C — AI speaking, server-written)
  └── usage/{periodId}              (cost/quota tracking, server-written)

public_profiles/{uid}               (feature F — public, read by friends/discovery)
connections/{connectionId}          (feature F — friend graph & requests)
challenges/{challengeId}            (feature G — friendly competition)
```

---

## `users/{uid}` — private profile + denormalized stats

```jsonc
{
  "uid": "abc123",
  "email": "user@example.com",
  "displayName": "Joana",
  "photoURL": "https://.../avatars/abc123/p.png",
  "nativeLanguage": "en",
  "targetLanguage": "es",
  "fluencyLevel": "A2",                 // CEFR A1–C2; drives AI generation difficulty
  "createdAt": <timestamp>,
  "updatedAt": <timestamp>,

  // ---- Gamification (feature D) — SERVER-WRITTEN ONLY ----
  "starPoints": 0,
  "streak": {
    "current": 0,
    "longest": 0,
    "lastActivityDate": "2026-06-29"    // date-only string in user's tz, for streak math
  },

  // ---- Mascot / Gazelle (feature E) — SERVER-WRITTEN ONLY ----
  "mascot": {
    "level": 1,
    "equippedOutfit": "default",
    "unlockedOutfits": ["default"]      // appended by streak engine
  },

  // ---- Privacy ----
  "privacy": {
    "profilePublic": true,
    "showOnLeaderboard": true
  }
}
```

> Clients may update only profile fields (`displayName`, `photoURL`, languages, `fluencyLevel`, `privacy`). Gamification/mascot fields are locked by rules and changed only by Functions.

### `users/{uid}/vocabulary/{wordId}` — feature B

```jsonc
{
  "word": "Bocadillo",
  "wordLower": "bocadillo",            // for case-insensitive alphabetical ordering
  "translation": "sandwich",
  "partOfSpeech": "noun",
  "exampleSentence": "Quiero un bocadillo de jamón.",
  "sentenceTranslation": "I want a ham sandwich.",
  "taskContext": "Ordering a sandwich", // links back to the task that generated it
  "taskId": "task_789",
  "fluencyLevel": "A2",
  "createdAt": <timestamp>,            // for "filter/sort by date added"
  "lastReviewedAt": <timestamp|null>,
  "mastery": 0                          // 0–5, optional SRS hook
}
```

**Query patterns**
- Default alphabetical: `orderBy('wordLower', 'asc')`.
- By date added: `orderBy('createdAt', 'desc')`.
- Filter by date range + alphabetical: `where('createdAt','>=',from).orderBy('createdAt').orderBy('wordLower')` → needs a composite index (see `firestore.indexes.json`).

### `users/{uid}/tasks/{taskId}` — feature A

```jsonc
{
  "title": "Ordering a sandwich",
  "description": "At a café in Madrid",
  "status": "generated",               // requested | generating | generated | error
  "fluencyLevel": "A2",
  "generatedWordIds": ["word_1", "word_2"],
  "createdAt": <timestamp>
}
```

Flow: client creates a task (`status: requested`) → calls `generateVocabulary` function → function calls the LLM, writes vocabulary docs, sets `status: generated` and `generatedWordIds`.

### `users/{uid}/fred_sessions/{sessionId}` — feature C (SERVER-WRITTEN)

```jsonc
{
  "userId": "abc123",
  "timestamp": <timestamp>,
  "prompt": "What would you like to order today?",   // what FRED asked
  "user_response_text": "I would like a coffee...",   // transcription
  "analysis_text": "Good sentence structure. Watch the 'r' in 'order'...",
  "performance_score": 82,             // 0–100, feeds Star Points & challenges
  "scoreBreakdown": {                  // optional detail for the analysis screen
    "pronunciation": 78, "grammar": 88, "fluency": 80
  },
  "challengeId": "chal_55|null",       // set when the session is part of a sprint
  "tokensUsed": 1240,                  // cost tracking
  "audioSeconds": 18
}
```

> Raw audio is **not** stored here — it lives temporarily in Cloud Storage at `audio/{uid}/{sessionId}` and is auto-deleted by a lifecycle rule after processing.

### `users/{uid}/usage/{periodId}` — quota/cost (SERVER-WRITTEN)

`periodId` = `"2026-06"` (monthly) or `"2026-06-29"` (daily).

```jsonc
{
  "sessionCount": 12,
  "tokensUsed": 14880,
  "audioSeconds": 240,
  "costEstimateUsd": 0.34,
  "updatedAt": <timestamp>
}
```

---

## `public_profiles/{uid}` — feature F (public read, server-written)

Mirror of public-safe fields, kept in sync by the `syncPublicProfile` trigger.

```jsonc
{
  "uid": "abc123",
  "displayName": "Joana",
  "photoURL": "https://.../p.png",
  "targetLanguage": "es",
  "streakCurrent": 14,
  "starPoints": 1320,
  "mascotLevel": 3,
  "mascotEquippedOutfit": "explorer",
  "updatedAt": <timestamp>
}
```

Why separate: lets a friend view a profile / leaderboard with a single cheap read **without ever exposing email, privacy settings, or anything not meant to be public.**

---

## `connections/{connectionId}` — feature F (friend graph & requests)

`connectionId` = the two uids sorted and joined, e.g. `abc123_xyz789`. This makes the relationship idempotent (one doc per pair, no duplicate requests).

```jsonc
{
  "users": ["abc123", "xyz789"],       // sorted; used by rules for membership checks
  "requesterId": "abc123",
  "recipientId": "xyz789",
  "status": "pending",                 // pending | accepted | declined | blocked
  "createdAt": <timestamp>,
  "updatedAt": <timestamp>
}
```

**Query patterns**
- My friends/requests: `where('users', 'array-contains', myUid)`.
- Filter to accepted: add `where('status','==','accepted')` (composite index).

---

## `challenges/{challengeId}` — feature G (friendly competition)

```jsonc
{
  "type": "fred_sprint",               // extensible: minigame, vocab_quiz, ...
  "challengerId": "abc123",
  "opponentId": "xyz789",
  "participants": ["abc123", "xyz789"],// for rules membership + queries
  "status": "pending",                 // pending | active | completed | declined | expired
  "target": { "sessions": 5 },         // e.g. "first to 5 FRED sessions" or highest avg score
  "scores": { "abc123": 0, "xyz789": 0 }, // SERVER-WRITTEN from FRED sessions
  "winnerId": null,
  "createdAt": <timestamp>,
  "expiresAt": <timestamp>
}
```

Flow: challenger creates (`pending`) → opponent accepts (`active`) → each FRED session tagged with `challengeId` lets the function update `scores` server-side → function sets `winnerId` + awards Star Points when target met or `expiresAt` passes.

---

## Why these choices (efficiency & security summary)

- **Subcollections** keep private data physically scoped to the owner → rules are a one-line `isOwner(uid)` and there is no way to query another user's vocabulary or sessions.
- **`public_profiles`** solves Firestore's "no field-level read security" limitation cleanly.
- **Denormalized stats** mean a profile/leaderboard view is one document read, not a fan-out.
- **Server-only writes** on scores/streaks/outfits make cheating impossible from the client and keep competition fair.
- **`users` array + sorted composite IDs** on connections/challenges make membership checks and dedup trivial.
