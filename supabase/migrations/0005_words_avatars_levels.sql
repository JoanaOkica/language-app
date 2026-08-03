-- =============================================================================
-- 0005_words_avatars_levels.sql
--
-- Three changes:
--   1. Plain-English proficiency levels instead of CEFR codes.
--   2. Customisable avatars; mascot outfits give way to XP leagues.
--   3. One card per word, with MANY example sentences — so a repeated routine
--      never duplicates a word, but a *new* context adds a fresh sentence to
--      the card the learner already has.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Proficiency levels
-- ---------------------------------------------------------------------------
create type public.proficiency_level as enum
  ('beginner', 'elementary', 'intermediate', 'advanced');

alter table public.profiles   alter column level drop default;
alter table public.tasks      alter column level drop default;
alter table public.vocabulary alter column level drop default;

-- CEFR bands collapse onto the new four-step scale.
create or replace function public.cefr_to_level(p text)
returns public.proficiency_level
language sql immutable security invoker set search_path = ''
as $$
  select case p
    when 'A1' then 'beginner'
    when 'A2' then 'elementary'
    when 'B1' then 'intermediate'
    else 'advanced'
  end::public.proficiency_level;
$$;

alter table public.profiles
  alter column level type public.proficiency_level
  using public.cefr_to_level(level::text);
alter table public.tasks
  alter column level type public.proficiency_level
  using public.cefr_to_level(level::text);
alter table public.vocabulary
  alter column level type public.proficiency_level
  using public.cefr_to_level(level::text);

alter table public.profiles   alter column level set default 'beginner';
alter table public.tasks      alter column level set default 'beginner';
alter table public.vocabulary alter column level set default 'beginner';

drop function public.cefr_to_level(text);
drop type public.fluency_level;

-- ---------------------------------------------------------------------------
-- 2. Avatars replace mascot outfits
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column avatar text not null default 'fox'
    check (avatar in ('fox', 'bear', 'panda', 'koala', 'tiger',
                      'frog', 'hedgehog', 'owl', 'unicorn', 'penguin'));

-- The view depends on the outfit columns, so it is rebuilt after the drop.
drop view public.public_profiles;

alter table public.user_stats
  drop column equipped_outfit,
  drop column unlocked_outfits,
  drop column mascot_level;

drop function if exists public.equip_outfit(text);
drop function if exists public.outfit_for_streak(integer);

-- Leagues are derived from XP and rendered client-side, so there is no
-- server-owned "level" column left to keep in sync.
create view public.public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar,
    p.target_language,
    s.star_points,
    s.streak_current
  from public.profiles p
  join public.user_stats s on s.user_id = p.id
  where p.is_public;

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- award_points no longer manages outfits; streak + XP logic is unchanged.
create or replace function public.award_points(p_user uuid, p_stars integer)
returns public.user_stats
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stats   public.user_stats;
  v_today   date := current_date;
  v_current integer;
  v_longest integer;
begin
  if p_stars is null or p_stars < 0 or p_stars > 500 then
    raise exception 'invalid star amount';
  end if;

  select * into v_stats from public.user_stats where user_id = p_user for update;
  if not found then
    raise exception 'no stats row for user';
  end if;

  v_current := v_stats.streak_current;
  if v_stats.last_activity_date is distinct from v_today then
    if v_stats.last_activity_date = v_today - 1 then
      v_current := v_current + 1;
    else
      v_current := 1;
    end if;
  end if;
  v_longest := greatest(v_stats.streak_longest, v_current);

  update public.user_stats
     set star_points        = star_points + p_stars,
         streak_current     = v_current,
         streak_longest     = v_longest,
         last_activity_date = v_today,
         updated_at         = now()
   where user_id = p_user
   returning * into v_stats;

  return v_stats;
end;
$$;

revoke all on function public.award_points(uuid, integer) from public, anon, authenticated;
grant execute on function public.award_points(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. One card per word, many contexts
--
-- The unique index is the actual guarantee that a repeated routine cannot
-- create a duplicate card. Example sentences move to a child table keyed by
-- context, so "coffee" learned for *Morning routine* and again for *Meeting a
-- friend* is one card carrying two sentences.
-- ---------------------------------------------------------------------------
create table public.vocabulary_examples (
  id                   uuid primary key default gen_random_uuid(),
  vocabulary_id        uuid not null references public.vocabulary (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  task_id              uuid references public.tasks (id) on delete set null,
  context              text not null check (char_length(context) between 1 and 120),
  sentence             text not null check (char_length(sentence) <= 400),
  sentence_translation text check (sentence_translation is null or char_length(sentence_translation) <= 400),
  created_at           timestamptz not null default now()
);

create index vocabulary_examples_word_idx on public.vocabulary_examples (vocabulary_id, created_at desc);
create index vocabulary_examples_user_idx on public.vocabulary_examples (user_id, created_at desc);

-- One sentence per (word, context): the same routine twice is a no-op.
create unique index vocabulary_examples_context_uniq
  on public.vocabulary_examples (vocabulary_id, lower(context));

alter table public.vocabulary_examples enable row level security;

create policy vocabulary_examples_all_own on public.vocabulary_examples
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Carry existing sentences over before the columns disappear.
insert into public.vocabulary_examples
  (vocabulary_id, user_id, task_id, context, sentence, sentence_translation, created_at)
select v.id, v.user_id, v.task_id,
       coalesce(nullif(v.task_context, ''), 'General'),
       v.example_sentence, v.sentence_translation, v.created_at
from public.vocabulary v
where v.example_sentence is not null and v.example_sentence <> ''
on conflict do nothing;

alter table public.vocabulary
  drop column example_sentence,
  drop column sentence_translation;

-- De-duplicate any pre-existing repeats, keeping the oldest card, before the
-- uniqueness rule is enforced.
with ranked as (
  select id, row_number() over (partition by user_id, lower(word) order by created_at) as rn
  from public.vocabulary
)
delete from public.vocabulary v using ranked r
where v.id = r.id and r.rn > 1;

create unique index vocabulary_user_word_uniq on public.vocabulary (user_id, lower(word));
