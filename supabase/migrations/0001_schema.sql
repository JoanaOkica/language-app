-- =============================================================================
-- 0001_schema.sql — Cat's Tongue core schema
--
-- CO-TENANCY CONTRACT
-- This project shares a Supabase instance with other apps. Therefore:
--   * every object lives in the `cats_tongue` schema — nothing is created in,
--     altered in, or revoked from `public`;
--   * no extensions are installed (uuid generation and text handling use
--     built-ins only), so no shared search_path is disturbed;
--   * no triggers are placed on `auth.users`, which every app shares. Profiles
--     are provisioned lazily by `cats_tongue.ensure_profile()` instead;
--   * storage buckets and their policies are prefixed `cats_tongue-`/`cats_tongue_`.
--
-- The only shared objects referenced are `auth.users` (read/FK) and
-- `auth.uid()`. Dropping this schema removes the app completely and leaves
-- every other project untouched.
-- =============================================================================

create schema if not exists cats_tongue;

comment on schema cats_tongue is
  'Cat''s Tongue language-learning app. Self-contained; safe to drop independently.';

-- Only signed-in users and the trusted server may even see the schema.
-- `anon` is deliberately omitted: unauthenticated clients get nothing.
grant usage on schema cats_tongue to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerated types (constrain values in the database, not just the app)
-- ---------------------------------------------------------------------------
create type cats_tongue.proficiency_level as enum
  ('beginner', 'elementary', 'intermediate', 'advanced');
create type cats_tongue.task_status as enum
  ('requested', 'generating', 'generated', 'error');
create type cats_tongue.connection_status as enum
  ('pending', 'accepted', 'declined', 'blocked');
create type cats_tongue.challenge_status as enum
  ('pending', 'active', 'completed', 'declined', 'expired');

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users. Client-editable fields only.
-- ---------------------------------------------------------------------------
create table cats_tongue.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text
                     check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  display_name     text not null default ''
                     check (char_length(display_name) <= 40),
  avatar           text not null default 'cat'
                     check (avatar in ('cat', 'fox', 'bear', 'panda', 'koala', 'tiger',
                                       'frog', 'hedgehog', 'owl', 'unicorn', 'penguin',
                                       'rabbit')),
  native_language  text not null default 'English'
                     check (char_length(native_language) <= 40),
  target_language  text not null default 'Spanish'
                     check (char_length(target_language) <= 40),
  level            cats_tongue.proficiency_level not null default 'beginner',
  is_public        boolean not null default true,
  onboarded        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Case-insensitive uniqueness without depending on the citext extension.
create unique index profiles_username_uniq on cats_tongue.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- user_stats — SERVER-AUTHORITATIVE. No client write grant, no write policy.
-- Leagues are derived from star_points and rendered client-side.
-- ---------------------------------------------------------------------------
create table cats_tongue.user_stats (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  star_points        integer not null default 0 check (star_points >= 0),
  streak_current     integer not null default 0 check (streak_current >= 0),
  streak_longest     integer not null default 0 check (streak_longest >= 0),
  last_activity_date date,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks — a daily activity the learner wants vocabulary for (feature A)
-- ---------------------------------------------------------------------------
create table cats_tongue.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  status      cats_tongue.task_status not null default 'requested',
  level       cats_tongue.proficiency_level not null default 'beginner',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_user_created_idx on cats_tongue.tasks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- vocabulary — ONE CARD PER WORD (features A & B)
-- The unique index is what makes a repeated routine impossible to duplicate.
-- ---------------------------------------------------------------------------
create table cats_tongue.vocabulary (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  task_id          uuid references cats_tongue.tasks (id) on delete set null,
  word             text not null check (char_length(word) between 1 and 80),
  translation      text not null check (char_length(translation) <= 200),
  part_of_speech   text check (part_of_speech is null or char_length(part_of_speech) <= 40),
  task_context     text check (task_context is null or char_length(task_context) <= 120),
  level            cats_tongue.proficiency_level not null default 'beginner',
  mastery          smallint not null default 0 check (mastery between 0 and 5),
  created_at       timestamptz not null default now(),
  last_reviewed_at timestamptz
);
create unique index vocabulary_user_word_uniq on cats_tongue.vocabulary (user_id, lower(word));
create index vocabulary_user_created_idx on cats_tongue.vocabulary (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- vocabulary_examples — one sentence per context a word appears in.
-- Same routine twice → no-op. New situation → another sentence on the same card.
-- ---------------------------------------------------------------------------
create table cats_tongue.vocabulary_examples (
  id                   uuid primary key default gen_random_uuid(),
  vocabulary_id        uuid not null references cats_tongue.vocabulary (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  task_id              uuid references cats_tongue.tasks (id) on delete set null,
  context              text not null check (char_length(context) between 1 and 120),
  sentence             text not null check (char_length(sentence) <= 400),
  sentence_translation text check (sentence_translation is null or char_length(sentence_translation) <= 400),
  created_at           timestamptz not null default now()
);
create unique index vocabulary_examples_context_uniq
  on cats_tongue.vocabulary_examples (vocabulary_id, lower(context));
create index vocabulary_examples_word_idx on cats_tongue.vocabulary_examples (vocabulary_id, created_at);
create index vocabulary_examples_user_idx on cats_tongue.vocabulary_examples (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- challenges — friendly competition (feature G). Scores are SERVER-WRITTEN.
-- Declared before fred_sessions so the FK below resolves.
-- ---------------------------------------------------------------------------
create table cats_tongue.challenges (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null default 'fred_sprint'
                     check (kind in ('fred_sprint', 'vocab_quiz')),
  challenger_id    uuid not null references auth.users (id) on delete cascade,
  opponent_id      uuid not null references auth.users (id) on delete cascade,
  status           cats_tongue.challenge_status not null default 'pending',
  target_sessions  smallint not null default 5 check (target_sessions between 1 and 50),
  challenger_score integer not null default 0 check (challenger_score >= 0),
  opponent_score   integer not null default 0 check (opponent_score >= 0),
  winner_id        uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  constraint challenges_no_self check (challenger_id <> opponent_id)
);
create index challenges_challenger_idx on cats_tongue.challenges (challenger_id, status);
create index challenges_opponent_idx   on cats_tongue.challenges (opponent_id, status);

-- ---------------------------------------------------------------------------
-- fred_sessions — AI speaking practice log (feature C). SERVER-WRITTEN ONLY.
-- Raw audio is never stored here; it is deleted once transcribed.
-- ---------------------------------------------------------------------------
create table cats_tongue.fred_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  challenge_id       uuid references cats_tongue.challenges (id) on delete set null,
  prompt             text,
  user_response_text text,
  analysis_text      text,
  performance_score  smallint check (performance_score between 0 and 100),
  score_breakdown    jsonb,
  tokens_used        integer not null default 0 check (tokens_used >= 0),
  audio_seconds      integer not null default 0 check (audio_seconds >= 0),
  created_at         timestamptz not null default now()
);
create index fred_sessions_user_created_idx on cats_tongue.fred_sessions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- usage_daily — per-user AI spend guard. SERVER-WRITTEN ONLY.
-- ---------------------------------------------------------------------------
-- `kind` is part of the key so each rate-limited action has its own counter.
-- A single shared counter would let cheap mini-games exhaust the allowance for
-- the expensive AI features (and vice versa).
create table cats_tongue.usage_daily (
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null default current_date,
  kind          text not null check (kind in ('fred', 'vocab', 'game')),
  action_count  integer not null default 0 check (action_count >= 0),
  tokens_used   integer not null default 0 check (tokens_used >= 0),
  audio_seconds integer not null default 0 check (audio_seconds >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, day, kind)
);

-- ---------------------------------------------------------------------------
-- connections — friend graph (feature F)
-- ---------------------------------------------------------------------------
create table cats_tongue.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status       cats_tongue.connection_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint connections_no_self check (requester_id <> recipient_id)
);
-- One row per pair in either direction: no duplicate or reversed requests.
create unique index connections_unique_pair_idx on cats_tongue.connections (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
);
create index connections_requester_idx on cats_tongue.connections (requester_id, status);
create index connections_recipient_idx on cats_tongue.connections (recipient_id, status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch    before update on cats_tongue.profiles    for each row execute function cats_tongue.touch_updated_at();
create trigger tasks_touch       before update on cats_tongue.tasks       for each row execute function cats_tongue.touch_updated_at();
create trigger connections_touch before update on cats_tongue.connections for each row execute function cats_tongue.touch_updated_at();
create trigger challenges_touch  before update on cats_tongue.challenges  for each row execute function cats_tongue.touch_updated_at();

-- ---------------------------------------------------------------------------
-- public_profiles — the ONLY way one user sees another.
--
-- RLS is row-level: letting a friend read a `profiles` row would expose every
-- column of it. This view names an explicit, safe column list and filters on
-- the user's own privacy flag, giving column-level privacy RLS cannot express.
-- `security_invoker = off` lets it read the base tables; access is controlled
-- by the grant below.
-- ---------------------------------------------------------------------------
create view cats_tongue.public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar,
    p.target_language,
    s.star_points,
    s.streak_current
  from cats_tongue.profiles p
  join cats_tongue.user_stats s on s.user_id = p.id
  where p.is_public;

revoke all on cats_tongue.public_profiles from public;
grant select on cats_tongue.public_profiles to authenticated;
