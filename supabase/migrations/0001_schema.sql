-- =============================================================================
-- 0001_schema.sql — Core schema for the language learning app
--
-- Design notes:
--  * Every table is owned by the app schema `public` and protected by RLS
--    (enabled in 0002_rls.sql). Nothing is readable without an explicit policy.
--  * Scoring/progress columns live in `user_stats`, separate from `profiles`,
--    so the client can be granted write access to profile fields while being
--    completely locked out of anything that affects points, streaks or ranking.
--  * Public-facing data is exposed through the `public_profiles` view only,
--    which selects an explicit column list (no `SELECT *`) — this gives us
--    column-level privacy that row-level security alone cannot express.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive text

-- ---------------------------------------------------------------------------
-- Enumerated types (constrain values at the database layer, not just the app)
-- ---------------------------------------------------------------------------
create type public.fluency_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
create type public.task_status   as enum ('requested', 'generating', 'generated', 'error');
create type public.connection_status as enum ('pending', 'accepted', 'declined', 'blocked');
create type public.challenge_status  as enum ('pending', 'active', 'completed', 'declined', 'expired');

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users. Client-editable fields only.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         citext unique
                     check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name     text not null default ''
                     check (char_length(display_name) <= 40),
  avatar_url       text
                     check (avatar_url is null or char_length(avatar_url) <= 500),
  native_language  text not null default 'English'
                     check (char_length(native_language) <= 40),
  target_language  text not null default 'Spanish'
                     check (char_length(target_language) <= 40),
  level            public.fluency_level not null default 'A1',
  is_public        boolean not null default true,
  onboarded        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_stats — SERVER-AUTHORITATIVE. No client write policy exists for this
-- table; only SECURITY DEFINER functions and the service role can modify it.
-- ---------------------------------------------------------------------------
create table public.user_stats (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  star_points        integer not null default 0 check (star_points >= 0),
  streak_current     integer not null default 0 check (streak_current >= 0),
  streak_longest     integer not null default 0 check (streak_longest >= 0),
  last_activity_date date,
  mascot_level       integer not null default 1 check (mascot_level between 1 and 5),
  equipped_outfit    text not null default 'default',
  unlocked_outfits   text[] not null default array['default'],
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks — a daily activity the learner wants vocabulary for (feature A)
-- ---------------------------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null
                check (char_length(title) between 1 and 120),
  description text
                check (description is null or char_length(description) <= 500),
  status      public.task_status not null default 'requested',
  level       public.fluency_level not null default 'A1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_user_created_idx on public.tasks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- vocabulary — generated words/sentences (features A & B)
-- ---------------------------------------------------------------------------
create table public.vocabulary (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  task_id              uuid references public.tasks (id) on delete set null,
  word                 text not null check (char_length(word) between 1 and 80),
  translation          text not null check (char_length(translation) <= 200),
  part_of_speech       text check (part_of_speech is null or char_length(part_of_speech) <= 40),
  example_sentence     text check (example_sentence is null or char_length(example_sentence) <= 400),
  sentence_translation text check (sentence_translation is null or char_length(sentence_translation) <= 400),
  task_context         text check (task_context is null or char_length(task_context) <= 120),
  level                public.fluency_level not null default 'A1',
  mastery              smallint not null default 0 check (mastery between 0 and 5),
  created_at           timestamptz not null default now(),
  last_reviewed_at     timestamptz
);
-- Alphabetical is the default library ordering; the expression index makes the
-- case-insensitive sort cheap. The second index serves "filter by date added".
create index vocabulary_user_alpha_idx   on public.vocabulary (user_id, lower(word));
create index vocabulary_user_created_idx on public.vocabulary (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- fred_sessions — AI speaking practice log (feature C). SERVER-WRITTEN ONLY.
-- ---------------------------------------------------------------------------
create table public.fred_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  challenge_id       uuid,
  prompt             text,
  user_response_text text,
  analysis_text      text,
  performance_score  smallint check (performance_score between 0 and 100),
  score_breakdown    jsonb,
  tokens_used        integer not null default 0 check (tokens_used >= 0),
  audio_seconds      integer not null default 0 check (audio_seconds >= 0),
  created_at         timestamptz not null default now()
);
create index fred_sessions_user_created_idx on public.fred_sessions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- usage_daily — per-user AI spend guard (cost control). SERVER-WRITTEN ONLY.
-- ---------------------------------------------------------------------------
create table public.usage_daily (
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null default current_date,
  session_count integer not null default 0 check (session_count >= 0),
  tokens_used   integer not null default 0 check (tokens_used >= 0),
  audio_seconds integer not null default 0 check (audio_seconds >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- connections — friend graph (feature F)
-- A partial unique index on the *sorted* pair makes a relationship idempotent
-- in both directions, so A->B and B->A cannot both exist.
-- ---------------------------------------------------------------------------
create table public.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status       public.connection_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint connections_no_self check (requester_id <> recipient_id)
);
create unique index connections_unique_pair_idx on public.connections (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
);
create index connections_requester_idx on public.connections (requester_id, status);
create index connections_recipient_idx on public.connections (recipient_id, status);

-- ---------------------------------------------------------------------------
-- challenges — friendly competition (feature G). Scores are SERVER-WRITTEN.
-- ---------------------------------------------------------------------------
create table public.challenges (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'fred_sprint'
                    check (kind in ('fred_sprint', 'vocab_quiz')),
  challenger_id   uuid not null references auth.users (id) on delete cascade,
  opponent_id     uuid not null references auth.users (id) on delete cascade,
  status          public.challenge_status not null default 'pending',
  target_sessions smallint not null default 5 check (target_sessions between 1 and 50),
  challenger_score integer not null default 0 check (challenger_score >= 0),
  opponent_score   integer not null default 0 check (opponent_score >= 0),
  winner_id       uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  constraint challenges_no_self check (challenger_id <> opponent_id)
);
create index challenges_challenger_idx on public.challenges (challenger_id, status);
create index challenges_opponent_idx   on public.challenges (opponent_id, status);

alter table public.fred_sessions
  add constraint fred_sessions_challenge_fk
  foreign key (challenge_id) references public.challenges (id) on delete set null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
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

create trigger profiles_touch    before update on public.profiles    for each row execute function public.touch_updated_at();
create trigger tasks_touch       before update on public.tasks       for each row execute function public.touch_updated_at();
create trigger connections_touch before update on public.connections for each row execute function public.touch_updated_at();
create trigger challenges_touch  before update on public.challenges  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Provision profile + stats rows automatically on signup.
-- SECURITY DEFINER because it writes on behalf of a brand-new user, with an
-- empty search_path so the function body cannot be hijacked by a rogue schema.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;

  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- public_profiles — the ONLY way one user sees another.
--
-- The column list is explicit and deliberately excludes email, privacy flags,
-- language settings and anything else non-public. The view is owned by the
-- migration role and runs with `security_invoker = off`, so it can read the
-- underlying tables while the base-table RLS keeps direct access owner-only.
-- The `where is_public` clause enforces the user's own privacy choice.
-- ---------------------------------------------------------------------------
create view public.public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.target_language,
    s.star_points,
    s.streak_current,
    s.mascot_level,
    s.equipped_outfit
  from public.profiles p
  join public.user_stats s on s.user_id = p.id
  where p.is_public;

-- Only signed-in users may browse profiles; anonymous visitors get nothing.
revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;
