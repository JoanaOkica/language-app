# Database Schema (Postgres / Supabase)

Full DDL lives in `supabase/migrations/`. This is the map and the reasoning.

## Tables

```
auth.users  (managed by Supabase Auth)
   │
   ├─1:1─ profiles          client-editable identity + preferences
   ├─1:1─ user_stats        points, streak, mascot   ← SERVER-WRITTEN ONLY
   ├─1:N─ tasks             daily activities to learn
   ├─1:N─ vocabulary        one card per word (unique per learner)
   ├─1:N─ vocabulary_examples  a sentence per context a word appears in
   ├─1:N─ fred_sessions     speaking practice log    ← SERVER-WRITTEN ONLY
   └─1:N─ usage_daily       AI spend per day         ← SERVER-WRITTEN ONLY

connections   (requester_id, recipient_id)   friend graph
challenges    (challenger_id, opponent_id)   friendly competition
public_profiles  VIEW — the only cross-user read path
```

### Why `profiles` and `user_stats` are separate
This is the central security decision. The client legitimately needs to edit its
display name and level, so `profiles` carries an UPDATE policy. Points and
streaks must never be client-writable — so they live in a different table with
**no write grant and no write policy at all**. Splitting them means a mistake in
the profile policy can never expose the scoring columns.

### Why `public_profiles` is a view
Postgres RLS is *row*-level. If a friend could read your `profiles` row, they
would read every column of it. The view selects an explicit, safe column list
and filters `where is_public`, giving column-level privacy that RLS alone cannot.

---

## Column reference

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | FK → `auth.users`, cascade delete |
| `username` | citext unique | `^[a-z0-9_]{3,20}$`, case-insensitive |
| `display_name` | text | ≤ 40 chars |
| `native_language` / `target_language` | text | |
| `level` | `proficiency_level` enum | beginner / elementary / intermediate / advanced — drives AI difficulty |
| `avatar` | text | One of ten animal ids, constrained by CHECK |
| `is_public` | boolean | false ⇒ hidden from search and leaderboards |
| `onboarded` | boolean | gates the onboarding screen |

### `user_stats` — server-authoritative
`star_points` (XP), `streak_current`, `streak_longest`, `last_activity_date`.
Written only by `award_points()`.

Leagues (Kit → Cub → Fox → Ranger → Elder) are derived from `star_points` and
rendered client-side, so there is no extra server-owned column to keep in sync.

### `tasks`
`title` (≤120), `status` (`requested|generating|generated|error`), `level`.

### `vocabulary` — one card per word
`word`, `translation`, `part_of_speech`, `task_context`, `level`,
`mastery` (0–5), `created_at`.

**A unique index on `(user_id, lower(word))` is the guarantee that a repeated
routine can never create a duplicate card.**

Indexes serve the two library orderings directly:
- `(user_id, lower(word))` → alphabetical, the default (and the uniqueness rule);
- `(user_id, created_at desc)` → "newest first" and date-range filters.

### `vocabulary_examples` — one sentence per context
`vocabulary_id`, `task_id`, `context`, `sentence`, `sentence_translation`.

A unique index on `(vocabulary_id, lower(context))` means describing the *same*
day twice changes nothing, while a *new* situation attaches another sentence to
the card the learner already has. So "coffee" learned for **Morning routine**
and again for **Meeting a friend** is one card carrying two usages.

### `fred_sessions` — server-authoritative
`prompt`, `user_response_text` (transcript), `analysis_text`,
`performance_score` (0–100), `score_breakdown` jsonb, `tokens_used`,
`audio_seconds`, `challenge_id`.
Raw audio is **not** stored — it is deleted once transcribed.

### `usage_daily` — server-authoritative
PK `(user_id, day)`; `session_count`, `tokens_used`, `audio_seconds`. Backs the
spend guard.

### `connections`
`requester_id`, `recipient_id`, `status` (`pending|accepted|declined|blocked`).
- CHECK: no self-connection.
- Unique index on `(least(a,b), greatest(a,b))` ⇒ one row per pair, in either
  direction, so duplicate/reversed requests are impossible.

### `challenges`
`kind`, `challenger_id`, `opponent_id`, `status`, `target_sessions`,
`challenger_score`, `opponent_score`, `winner_id`, `expires_at`.
Scores and winner are server-written; a trigger rejects client edits.

---

## Query patterns

| Screen | Call |
|--------|------|
| Library, alphabetical (default) | `list_vocabulary('alpha')` |
| Library, by date added | `list_vocabulary('recent', since)` |
| Today's words | `list_vocabulary('recent', start-of-day)` |
| Friend list | `list_friends()` |
| Incoming requests | `list_pending_requests()` |
| User search | `search_profiles(q)` — ≥2 chars, prefix, ≤20 rows |
| Leaderboard | `friends_leaderboard()` |
| Challenges | `list_my_challenges()` |

These are SECURITY DEFINER functions rather than client-side joins because
PostgREST cannot join a table to a view across the RLS boundary cleanly, and
because it keeps the exposed surface small and auditable.

---

## Functions

| Function | Callable by | Purpose |
|----------|------------|---------|
| `award_points(uuid,int)` | service_role | XP + streak. Row-locked so concurrent sessions cannot double-advance. |
| `consume_daily_quota(...)` | service_role | Atomic AI spend guard. |
| `record_fred_session(...)` | service_role | Session + tokens + points + challenge, in one transaction. |
| `progress_challenge(...)` | internal | Advance scores, settle a winner. |
| `add_token_usage(...)` | service_role | Accumulate non-FRED token spend. |
| `upsert_vocabulary(...)` | service_role | The repeated-routine rule: new card / new context / no-op, in one transaction. Returns the three counts. |
| `list_vocabulary(sort, since)` | authenticated | Cards with every context, sorted alphabetically or by date. |
| `known_words(uuid)` | service_role | Recent words (capped at 200) sent to the generator so a known word gets a fresh contextual sentence. |
| `search_profiles` / `list_friends` / `list_pending_requests` / `list_my_challenges` / `friends_leaderboard` | authenticated | Safe reads, always scoped to `auth.uid()`. |
| `are_friends(uuid,uuid)` | authenticated | Friendship check used by challenge policy. |

Every SECURITY DEFINER function sets `search_path = ''` and fully qualifies
object names, which closes the standard Postgres privilege-escalation path.
