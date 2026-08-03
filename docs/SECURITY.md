# Security Model

This app is multi-tenant: every user's vocabulary, speech recordings and
progress sit in the same Postgres database and the same storage buckets. The
controlling assumption throughout is:

> **An attacker is a legitimate signed-in user.** They hold a valid JWT and the
> public anon key, they can call PostgREST and the Edge Functions directly with
> arbitrary payloads, and they can read every line of the shipped JavaScript.

Nothing below relies on the client behaving. Each control is enforced on the
server or in the database.

---

## 1. Trust boundary

```
┌──────────────────────────────┐
│ Browser / app  (UNTRUSTED)   │  anon key, user JWT, all source readable
│  • reads own rows via RLS    │
│  • uploads audio to own path │
└──────────────┬───────────────┘
               │ HTTPS + JWT
┌──────────────▼───────────────┐
│ Supabase edge (TRUSTED)      │
│  • Edge Functions            │  service-role key, OPENAI_API_KEY
│  • Postgres RLS + SECURITY   │
│    DEFINER functions         │
└──────────────┬───────────────┘
               │ server-to-server
┌──────────────▼───────────────┐
│ OpenAI API                   │
└──────────────────────────────┘
```

The client may read and write its *own* ordinary data directly — that is what
RLS is for, and it keeps the app fast. Everything that costs money or affects
ranking crosses into the trusted side.

---

## 2. Threats and mitigations

| # | Threat | Mitigation | Where |
|---|--------|-----------|-------|
| 1 | **Reading another user's data** (vocabulary, transcripts, email) | RLS on every table, scoped to `auth.uid()`. No table is readable without a matching policy; `public` schema access is revoked from `anon` entirely. | `0002_rls.sql` |
| 2 | **Column-level leakage via profiles** — RLS is row-level, so exposing a row for a friend list would expose the whole row | Other users are never shown `profiles`. A dedicated `public_profiles` view selects an explicit safe column list and filters on `is_public`. | `0001_schema.sql` |
| 3 | **Forging Star Points / streaks** to top the leaderboard | `user_stats` has **no client write grant and no write policy**. Points change only through `award_points()`, a SECURITY DEFINER function that `authenticated` cannot execute. | `0002`, `0003` |
| 4 | **Tampering with challenge scores** — RLS `with check` validates the new row but cannot say "this column must not change" | `BEFORE UPDATE` trigger rejects any client change to scores, participants, target or winner. Trusted code opts out via a session-local flag that only SECURITY DEFINER functions set. | `guard_challenge_columns` |
| 5 | **Accepting your own friend request** | The UPDATE policy is asymmetric: `using` matches the OLD row (`recipient_id = auth.uid() and status = 'pending'`), so only the recipient can move it out of `pending`. | `connections_respond` |
| 6 | **Duplicate / reversed friend requests** used to spam | Unique index on the *sorted* `(least, greatest)` pair makes a relationship idempotent in both directions. Self-connection blocked by a CHECK. | `0001_schema.sql` |
| 7 | **Challenge spam / harassment from strangers** | `challenges` INSERT policy requires `are_friends(auth.uid(), opponent_id)`. | `challenges_insert_own` |
| 8 | **Stealing the AI key** | `OPENAI_API_KEY` is an Edge Function secret. It never appears in the client bundle, in the database, or in git. Only `_shared/ai.ts` reads it. | `_shared/ai.ts` |
| 9 | **Running up the AI bill** | `consume_daily_quota()` increments and checks atomically, raising once the cap is hit; `max_tokens` is fixed server-side; input is length-clipped before it reaches the model. | `0003`, `_shared/ai.ts` |
| 10 | **Prompt injection** via speech or task titles | System prompts are fixed server-side. Learner text is wrapped in `<<< >>>` delimiters with an explicit instruction to treat it as data. Every field of the model's JSON reply is re-validated and clamped before it is stored. | `_shared/ai.ts` |
| 11 | **Acting as another user through an Edge Function** | The user id always comes from `getUser()` on the verified JWT. No endpoint accepts a `userId` parameter. | `_shared/auth.ts` |
| 12 | **Reading/overwriting another user's audio** | Storage paths are `<bucket>/<uid>/<file>`; policies pin the first segment to `auth.uid()`. `fred-turn` additionally rejects a path outside the caller's folder *before* spending money. | `0004_storage.sql`, `fred-turn` |
| 13 | **Cross-site request forgery to the functions** | CORS is an allow-list from `ALLOWED_ORIGINS`, never `*`. | `_shared/http.ts` |
| 14 | **Account enumeration** at sign-in | Login failures return one generic message; "wrong password" and "no such account" are indistinguishable. | `AuthPage.tsx` |
| 15 | **Scraping the whole user directory** | `search_profiles()` requires ≥2 characters, is prefix-only, and is hard-capped at 20 rows. | `0003_functions.sql` |
| 16 | **`search_path` hijacking of SECURITY DEFINER functions** — a classic Postgres privilege-escalation route | Every such function sets `search_path = ''` and fully qualifies each object. | all migrations |
| 17 | **SQL injection** | No string-built SQL anywhere; PostgREST and the Supabase client parameterise everything, and function arguments are typed. | — |
| 18 | **XSS** | React escapes by default. There is no `dangerouslySetInnerHTML` and no `eval` in the codebase — including for AI-generated text, which is rendered as text. | `app/src` |
| 19 | **Inflating XP through the games** | `award-game-points` caps a single award at 50 and the day at 20 calls, and routes through `award_points()` so streaks still follow the real calendar. | `award-game-points` |
| 20 | **Storage abused as free file hosting / malware drop** | Buckets declare `file_size_limit` and an `allowed_mime_types` allow-list (audio and images only). | `0004_storage.sql` |
| 21 | **Stale audio accumulating** (privacy + cost) | `fred-turn` deletes the recording as soon as it is transcribed. Only the transcript is retained. | `fred-turn` |
| 22 | **Error messages leaking schema/infrastructure** | Edge Functions log details server-side and return only a short error code. | `_shared/http.ts` |
| 23 | **Orphaned data after account deletion** | `on delete cascade` from `auth.users` covers every table; `delete-account` clears storage objects first, which FKs do not reach. The UI requires typing `DELETE` to confirm. | `delete-account`, `DenPage` |
| 24 | **Arbitrary avatar values** (script or external URL injected as an avatar) | Avatars are an id from a fixed set, enforced by a CHECK constraint and rendered as an emoji — never a user-supplied URL. | `0005` |
| 25 | **Vocabulary bloat / duplicate-write abuse** | Unique indexes on `(user_id, lower(word))` and `(vocabulary_id, lower(context))` make repeats no-ops, so a loop of identical requests cannot inflate the table. | `0005`, `0006` |

---

## 3. Mini-game points: bounded, not trusted

A client can always lie about a mini-game result — there is no way to verify it
without re-running the game server-side, which is out of scope for the MVP. The
design therefore **bounds the damage** rather than pretending to prevent it:

- ≤ 50 points per call (`MAX_POINTS_PER_GAME`),
- ≤ 20 calls per day (`DAILY_GAME_LIMIT`),
- written through `award_points()`, so streaks and leagues still follow the
  real calendar.

The worst case is a user inflating their own points within a capped daily
ceiling. FRED scores, which carry the competitive weight, are computed
server-side from real audio and cannot be faked this way.

---

## 4. What is intentionally public

- **The anon key.** It is designed to ship in the client; RLS is what protects
  the data. Compromise of this key alone grants nothing.
- **The `avatars` bucket.** Public-read so friend lists render without signed
  URLs. Writes are still owner-only, and size/MIME limits apply.
- **`public_profiles`.** Display name, username, avatar, target language,
  points, streak and mascot — for users who leave `is_public` on. Email,
  language settings and all private tables are excluded.

---

## 5. Deployment checklist

Controls that live in the Supabase dashboard rather than in this repo:

- [ ] Set Edge Function secrets: `OPENAI_API_KEY`, `ALLOWED_ORIGINS`.
- [ ] **Never** expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend build. Only
      `VITE_`-prefixed variables are bundled — keep the service key out of any
      `VITE_` name.
- [ ] Turn on **email confirmation** in Auth settings.
- [ ] Set a **minimum password length** (≥ 10) and enable leaked-password
      protection.
- [ ] Enable **rate limiting** on the auth endpoints (signup, signin, recovery).
- [ ] Enable **MFA** for your own Supabase dashboard account.
- [ ] Run the Supabase **security advisor** after every migration.
- [ ] Set a **spend cap / billing alert** on the OpenAI account as the final
      backstop behind the per-user quota.
- [ ] Serve the frontend with `Content-Security-Policy`,
      `X-Content-Type-Options: nosniff` and `Strict-Transport-Security`.
- [ ] Configure PITR / backups before real users arrive.

---

## 6. Known gaps (deliberate, for the MVP)

These are accepted for now and should be closed before scale:

1. **No CAPTCHA on signup** — automated account creation is possible. Supabase
   Auth rate limiting plus email confirmation is the interim control.
2. **No abuse reporting or blocking UI.** The `blocked` connection status exists
   in the schema but has no screen yet.
3. **Quota is per-day, not per-minute.** A user can burn their whole daily
   allowance in one burst. Add a sliding window if that becomes a problem.
4. **No audit log** of privileged actions. Worth adding once points carry real
   value (prizes, rankings).
5. **Mini-game scores are self-reported** — see §3.
