-- =============================================================================
-- 0006_vocab_api.sql
--
--  * upsert_vocabulary — the repeated-routine rule, enforced in one transaction.
--  * list_vocabulary   — cards with all their contexts, for the library.
--  * The social read APIs are rebuilt because `public_profiles` changed shape
--    in 0005 (avatar replaced avatar_url / mascot_level).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- upsert_vocabulary
--
-- For each generated item:
--   • word unseen                  → create the card + its first sentence
--   • word known, context new      → add a sentence to the existing card
--   • word known, context repeated → do nothing
--
-- Returns the three counts so the UI can say what actually happened.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_vocabulary(
  p_user    uuid,
  p_task    uuid,
  p_context text,
  p_level   public.proficiency_level,
  p_items   jsonb
)
returns table (new_words integer, new_contexts integer, already_known integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item        jsonb;
  v_word      text;
  v_vocab_id  uuid;
  v_is_new    boolean;
  v_added     boolean;
begin
  new_words := 0;
  new_contexts := 0;
  already_known := 0;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_word := btrim(coalesce(item->>'word', ''));
    continue when v_word = '' or char_length(v_word) > 80;

    -- Create the card only if this learner has never had this word.
    insert into public.vocabulary
      (user_id, task_id, word, translation, part_of_speech, task_context, level)
    values
      (p_user, p_task, v_word,
       left(coalesce(item->>'translation', ''), 200),
       nullif(left(coalesce(item->>'part_of_speech', ''), 40), ''),
       left(coalesce(p_context, 'General'), 120),
       p_level)
    on conflict (user_id, lower(word)) do nothing
    returning id into v_vocab_id;

    v_is_new := v_vocab_id is not null;
    if not v_is_new then
      select id into v_vocab_id
      from public.vocabulary
      where user_id = p_user and lower(word) = lower(v_word);
    end if;

    -- Attach a sentence for this context. The unique index makes a repeated
    -- routine a no-op, while a new context adds a fresh sentence to the card.
    v_added := false;
    if coalesce(item->>'example_sentence', '') <> '' then
      insert into public.vocabulary_examples
        (vocabulary_id, user_id, task_id, context, sentence, sentence_translation)
      values
        (v_vocab_id, p_user, p_task,
         left(coalesce(p_context, 'General'), 120),
         left(item->>'example_sentence', 400),
         nullif(left(coalesce(item->>'sentence_translation', ''), 400), ''))
      on conflict (vocabulary_id, lower(context)) do nothing;
      v_added := found;
    end if;

    if v_is_new then
      new_words := new_words + 1;
    elsif v_added then
      new_contexts := new_contexts + 1;
    else
      already_known := already_known + 1;
    end if;
  end loop;

  return next;
end;
$$;

revoke all on function public.upsert_vocabulary(uuid, uuid, text, public.proficiency_level, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_vocabulary(uuid, uuid, text, public.proficiency_level, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- list_vocabulary — one row per card, with every context it appears in.
-- p_sort: 'alpha' (default) or 'recent'. p_since filters by date added.
-- ---------------------------------------------------------------------------
create or replace function public.list_vocabulary(
  p_sort  text default 'alpha',
  p_since timestamptz default null
)
returns table (
  id uuid, word text, translation text, part_of_speech text,
  level public.proficiency_level, created_at timestamptz, examples jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.word, v.translation, v.part_of_speech, v.level, v.created_at,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'context', e.context,
                     'sentence', e.sentence,
                     'translation', e.sentence_translation)
                   order by e.created_at)
            from public.vocabulary_examples e
            where e.vocabulary_id = v.id),
           '[]'::jsonb)
  from public.vocabulary v
  where v.user_id = (select auth.uid())
    and (p_since is null or v.created_at >= p_since)
  order by
    case when p_sort = 'alpha'  then lower(v.word) end asc,
    case when p_sort = 'recent' then v.created_at end desc
  limit 500;
$$;

grant execute on function public.list_vocabulary(text, timestamptz) to authenticated;

-- Words the learner already has, so the generator can be told to write a fresh
-- sentence for a known word instead of proposing it as new.
create or replace function public.known_words(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(word), '{}')
  from (
    select word from public.vocabulary
    where user_id = p_user
    order by created_at desc
    limit 200          -- cap the prompt size, and therefore the token cost
  ) recent;
$$;

revoke all on function public.known_words(uuid) from public, anon, authenticated;
grant execute on function public.known_words(uuid) to service_role;

-- =============================================================================
-- Social read APIs rebuilt for the new public_profiles shape.
-- =============================================================================
drop function if exists public.search_profiles(text);
drop function if exists public.list_friends();
drop function if exists public.list_pending_requests();
drop function if exists public.list_my_challenges();
drop function if exists public.friends_leaderboard();

create function public.search_profiles(p_query text)
returns table (id uuid, username citext, display_name text, avatar text,
               star_points integer, streak_current integer)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.username, pp.display_name, pp.avatar, pp.star_points, pp.streak_current
  from public.public_profiles pp
  where (select auth.uid()) is not null
    and char_length(btrim(p_query)) >= 2
    and pp.id <> (select auth.uid())
    and (pp.username ilike btrim(p_query) || '%' or pp.display_name ilike btrim(p_query) || '%')
  order by pp.username
  limit 20;
$$;
grant execute on function public.search_profiles(text) to authenticated;

create function public.list_friends()
returns table (id uuid, username citext, display_name text, avatar text,
               star_points integer, streak_current integer)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.username, pp.display_name, pp.avatar, pp.star_points, pp.streak_current
  from public.connections c
  join public.public_profiles pp
    on pp.id = case when c.requester_id = (select auth.uid()) then c.recipient_id else c.requester_id end
  where c.status = 'accepted'
    and (select auth.uid()) in (c.requester_id, c.recipient_id)
  order by pp.display_name;
$$;
grant execute on function public.list_friends() to authenticated;

create function public.list_pending_requests()
returns table (connection_id uuid, id uuid, username citext, display_name text,
               avatar text, star_points integer, streak_current integer)
language sql stable security definer set search_path = ''
as $$
  select c.id, pp.id, pp.username, pp.display_name, pp.avatar, pp.star_points, pp.streak_current
  from public.connections c
  join public.public_profiles pp on pp.id = c.requester_id
  where c.status = 'pending' and c.recipient_id = (select auth.uid())
  order by c.created_at desc;
$$;
grant execute on function public.list_pending_requests() to authenticated;

create function public.list_my_challenges()
returns table (id uuid, kind text, status public.challenge_status, target_sessions smallint,
               my_score integer, their_score integer, winner_id uuid,
               opponent_id uuid, opponent_name text, opponent_avatar text,
               i_am_opponent boolean, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.kind, c.status, c.target_sessions,
         case when c.challenger_id = (select auth.uid()) then c.challenger_score else c.opponent_score end,
         case when c.challenger_id = (select auth.uid()) then c.opponent_score else c.challenger_score end,
         c.winner_id, pp.id, pp.display_name, pp.avatar,
         (c.opponent_id = (select auth.uid())), c.expires_at
  from public.challenges c
  join public.public_profiles pp
    on pp.id = case when c.challenger_id = (select auth.uid()) then c.opponent_id else c.challenger_id end
  where (select auth.uid()) in (c.challenger_id, c.opponent_id)
  order by c.created_at desc;
$$;
grant execute on function public.list_my_challenges() to authenticated;

create function public.friends_leaderboard()
returns table (id uuid, display_name text, avatar text,
               star_points integer, streak_current integer, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.display_name, pp.avatar, pp.star_points, pp.streak_current,
         (pp.id = (select auth.uid()))
  from public.public_profiles pp
  where pp.id = (select auth.uid())
     or public.are_friends((select auth.uid()), pp.id)
  order by pp.star_points desc
  limit 50;
$$;
grant execute on function public.friends_leaderboard() to authenticated;
