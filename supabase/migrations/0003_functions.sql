-- =============================================================================
-- 0003_functions.sql — Server-authoritative logic and safe read APIs
--
-- Anything that awards XP, advances a streak or scores a challenge is a
-- SECURITY DEFINER function that `authenticated` cannot execute; only Edge
-- Functions (service_role) may call those. Client-callable helpers always
-- re-derive the caller from auth.uid() and never accept a user id argument.
--
-- Every function pins `search_path = ''` and fully qualifies object names.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ensure_profile — lazy provisioning, called by the client after sign-in.
--
-- This replaces the usual `on auth.users` trigger, which would fire for every
-- signup in this shared Supabase project — including the other apps' users.
-- Provisioning on first use keeps Cat's Tongue entirely out of their way.
--
-- It also enforces the confirmation rule at the data layer: no profile exists
-- until the address is verified, so an unconfirmed account cannot be used even
-- if the Auth settings were ever relaxed.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.ensure_profile()
returns cats_tongue.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_email    text;
  v_verified timestamptz;
  v_profile  cats_tongue.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select u.email, u.email_confirmed_at
    into v_email, v_verified
  from auth.users u
  where u.id = v_uid;

  if v_verified is null then
    raise exception 'email_not_confirmed' using errcode = '28000';
  end if;

  insert into cats_tongue.profiles (id, display_name)
  values (v_uid, left(coalesce(split_part(v_email, '@', 1), ''), 40))
  on conflict (id) do nothing;

  insert into cats_tongue.user_stats (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select * into v_profile from cats_tongue.profiles where id = v_uid;
  return v_profile;
end;
$$;

revoke all on function cats_tongue.ensure_profile() from public;
grant execute on function cats_tongue.ensure_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- award_points — the ONLY writer of star_points and streaks.
-- Idempotent per day for the streak: extra activity adds XP but does not
-- inflate the streak counter.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.award_points(p_user uuid, p_stars integer)
returns cats_tongue.user_stats
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stats   cats_tongue.user_stats;
  v_today   date := current_date;
  v_current integer;
  v_longest integer;
begin
  if p_stars is null or p_stars < 0 or p_stars > 500 then
    raise exception 'invalid star amount';
  end if;

  -- Lock the row so concurrent sessions cannot double-advance the streak.
  select * into v_stats from cats_tongue.user_stats where user_id = p_user for update;
  if not found then
    raise exception 'no stats row for user';
  end if;

  v_current := v_stats.streak_current;
  if v_stats.last_activity_date is distinct from v_today then
    if v_stats.last_activity_date = v_today - 1 then
      v_current := v_current + 1;      -- consecutive day
    else
      v_current := 1;                  -- first activity, or streak broken
    end if;
  end if;
  v_longest := greatest(v_stats.streak_longest, v_current);

  update cats_tongue.user_stats
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

revoke all on function cats_tongue.award_points(uuid, integer) from public;
grant execute on function cats_tongue.award_points(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- consume_daily_quota — atomic spend guard, counted PER ACTION KIND.
--
-- Each kind ('fred', 'vocab', 'game') has its own counter, so cheap mini-games
-- cannot exhaust the allowance for the expensive AI calls, and vice versa.
-- Raising rolls the increment back, so a user at the cap stays at the cap.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.consume_daily_quota(
  p_user uuid,
  p_kind text,
  p_limit integer default 30,
  p_tokens integer default 0,
  p_audio_seconds integer default 0
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_kind not in ('fred', 'vocab', 'game') then
    raise exception 'unknown quota kind';
  end if;

  insert into cats_tongue.usage_daily (user_id, day, kind, action_count, tokens_used, audio_seconds)
  values (p_user, current_date, p_kind, 1, greatest(p_tokens, 0), greatest(p_audio_seconds, 0))
  on conflict (user_id, day, kind) do update
    set action_count  = cats_tongue.usage_daily.action_count + 1,
        tokens_used   = cats_tongue.usage_daily.tokens_used + greatest(p_tokens, 0),
        audio_seconds = cats_tongue.usage_daily.audio_seconds + greatest(p_audio_seconds, 0),
        updated_at    = now()
  returning action_count into v_count;

  if v_count > p_limit then
    raise exception 'daily_quota_exceeded' using errcode = 'P0001';
  end if;
  return v_count;
end;
$$;

revoke all on function cats_tongue.consume_daily_quota(uuid, text, integer, integer, integer) from public;
grant execute on function cats_tongue.consume_daily_quota(uuid, text, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- add_token_usage — accumulate spend outside a FRED turn.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.add_token_usage(p_user uuid, p_kind text, p_tokens integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cats_tongue.usage_daily (user_id, day, kind, tokens_used)
  values (p_user, current_date,
          case when p_kind in ('fred', 'vocab', 'game') then p_kind else 'vocab' end,
          greatest(coalesce(p_tokens, 0), 0))
  on conflict (user_id, day, kind) do update
    set tokens_used = cats_tongue.usage_daily.tokens_used + greatest(coalesce(p_tokens, 0), 0),
        updated_at  = now();
$$;

revoke all on function cats_tongue.add_token_usage(uuid, text, integer) from public;
grant execute on function cats_tongue.add_token_usage(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- progress_challenge — advance a participant's score, settle a winner.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.progress_challenge(p_challenge uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c            cats_tongue.challenges;
  v_challenger integer;
  v_opponent   integer;
  v_winner     uuid;
begin
  -- Tell the column-freeze trigger this is trusted server code.
  perform set_config('cats_tongue.server_action', 'on', true);

  select * into c from cats_tongue.challenges where id = p_challenge for update;
  if not found or c.status <> 'active' then
    return;
  end if;
  if p_user <> c.challenger_id and p_user <> c.opponent_id then
    return;                                  -- not a participant: ignore
  end if;

  v_challenger := c.challenger_score + (case when p_user = c.challenger_id then 1 else 0 end);
  v_opponent   := c.opponent_score   + (case when p_user = c.opponent_id   then 1 else 0 end);

  if greatest(v_challenger, v_opponent) >= c.target_sessions or now() >= c.expires_at then
    v_winner := case when v_challenger >= v_opponent then c.challenger_id else c.opponent_id end;
  end if;

  update cats_tongue.challenges
     set challenger_score = v_challenger,
         opponent_score   = v_opponent,
         status           = case when v_winner is not null
                                 then 'completed'::cats_tongue.challenge_status
                                 else status end,
         winner_id        = coalesce(v_winner, winner_id),
         updated_at       = now()
   where id = p_challenge;

  if v_winner is not null then
    perform cats_tongue.award_points(v_winner, 20);   -- winner's bonus
  end if;

  perform set_config('cats_tongue.server_action', 'off', true);
end;
$$;

revoke all on function cats_tongue.progress_challenge(uuid, uuid) from public;
grant execute on function cats_tongue.progress_challenge(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- record_fred_session — session + tokens + XP + challenge, in one transaction.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.record_fred_session(
  p_user uuid,
  p_prompt text,
  p_response text,
  p_analysis text,
  p_score smallint,
  p_breakdown jsonb,
  p_tokens integer,
  p_audio_seconds integer,
  p_challenge_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_score smallint := greatest(0, least(100, coalesce(p_score, 0)));
begin
  insert into cats_tongue.fred_sessions (
    user_id, challenge_id, prompt, user_response_text, analysis_text,
    performance_score, score_breakdown, tokens_used, audio_seconds
  ) values (
    p_user, p_challenge_id, p_prompt, p_response, p_analysis,
    v_score, p_breakdown,
    greatest(coalesce(p_tokens, 0), 0), greatest(coalesce(p_audio_seconds, 0), 0)
  )
  returning id into v_session_id;

  update cats_tongue.usage_daily
     set tokens_used   = tokens_used + greatest(coalesce(p_tokens, 0), 0),
         audio_seconds = audio_seconds + greatest(coalesce(p_audio_seconds, 0), 0),
         updated_at    = now()
   where user_id = p_user and day = current_date and kind = 'fred';

  perform cats_tongue.award_points(p_user, (v_score / 10)::integer);

  if p_challenge_id is not null then
    perform cats_tongue.progress_challenge(p_challenge_id, p_user);
  end if;

  return v_session_id;
end;
$$;

revoke all on function cats_tongue.record_fred_session(uuid, text, text, text, smallint, jsonb, integer, integer, uuid) from public;
grant execute on function cats_tongue.record_fred_session(uuid, text, text, text, smallint, jsonb, integer, integer, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- upsert_vocabulary — the repeated-routine rule, in one transaction.
--   word unseen                  → create the card + its first sentence
--   word known, context new      → add a sentence to the existing card
--   word known, context repeated → do nothing
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.upsert_vocabulary(
  p_user    uuid,
  p_task    uuid,
  p_context text,
  p_level   cats_tongue.proficiency_level,
  p_items   jsonb
)
returns table (new_words integer, new_contexts integer, already_known integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item       jsonb;
  v_word     text;
  v_vocab_id uuid;
  v_is_new   boolean;
  v_added    boolean;
begin
  new_words := 0;
  new_contexts := 0;
  already_known := 0;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_word := btrim(coalesce(item->>'word', ''));
    continue when v_word = '' or char_length(v_word) > 80;

    v_vocab_id := null;

    insert into cats_tongue.vocabulary
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
      from cats_tongue.vocabulary
      where user_id = p_user and lower(word) = lower(v_word);
    end if;

    v_added := false;
    if coalesce(item->>'example_sentence', '') <> '' then
      insert into cats_tongue.vocabulary_examples
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

revoke all on function cats_tongue.upsert_vocabulary(uuid, uuid, text, cats_tongue.proficiency_level, jsonb) from public;
grant execute on function cats_tongue.upsert_vocabulary(uuid, uuid, text, cats_tongue.proficiency_level, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- known_words — recent words sent to the generator so a repeat comes back with
-- a sentence written for the *new* context. Capped to bound the prompt cost.
-- ---------------------------------------------------------------------------
create or replace function cats_tongue.known_words(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(word), '{}')
  from (
    select word from cats_tongue.vocabulary
    where user_id = p_user
    order by created_at desc
    limit 200
  ) recent;
$$;

revoke all on function cats_tongue.known_words(uuid) from public;
grant execute on function cats_tongue.known_words(uuid) to service_role;

-- =============================================================================
-- Client-callable read APIs. Each derives the user from auth.uid(); none takes
-- a user id, so they cannot be pointed at anyone else's data.
-- =============================================================================

create or replace function cats_tongue.list_vocabulary(
  p_sort  text default 'alpha',
  p_since timestamptz default null
)
returns table (
  id uuid, word text, translation text, part_of_speech text,
  level cats_tongue.proficiency_level, created_at timestamptz, examples jsonb
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
            from cats_tongue.vocabulary_examples e
            where e.vocabulary_id = v.id),
           '[]'::jsonb)
  from cats_tongue.vocabulary v
  where v.user_id = (select auth.uid())
    and (p_since is null or v.created_at >= p_since)
  order by
    case when p_sort = 'alpha'  then lower(v.word) end asc,
    case when p_sort = 'recent' then v.created_at end desc
  limit 500;
$$;
grant execute on function cats_tongue.list_vocabulary(text, timestamptz) to authenticated;

-- Prefix-only, minimum two characters, hard row cap: blunts directory scraping.
create or replace function cats_tongue.search_profiles(p_query text)
returns table (id uuid, username text, display_name text, avatar text,
               star_points integer, streak_current integer)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.username, pp.display_name, pp.avatar, pp.star_points, pp.streak_current
  from cats_tongue.public_profiles pp
  where (select auth.uid()) is not null
    and char_length(btrim(p_query)) >= 2
    and pp.id <> (select auth.uid())
    and (pp.username ilike btrim(p_query) || '%' or pp.display_name ilike btrim(p_query) || '%')
  order by pp.username
  limit 20;
$$;
grant execute on function cats_tongue.search_profiles(text) to authenticated;

create or replace function cats_tongue.list_friends()
returns table (id uuid, username text, display_name text, avatar text,
               star_points integer, streak_current integer)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.username, pp.display_name, pp.avatar, pp.star_points, pp.streak_current
  from cats_tongue.connections c
  join cats_tongue.public_profiles pp
    on pp.id = case when c.requester_id = (select auth.uid()) then c.recipient_id else c.requester_id end
  where c.status = 'accepted'
    and (select auth.uid()) in (c.requester_id, c.recipient_id)
  order by pp.display_name;
$$;
grant execute on function cats_tongue.list_friends() to authenticated;

create or replace function cats_tongue.list_pending_requests()
returns table (connection_id uuid, id uuid, username text, display_name text,
               avatar text, star_points integer, streak_current integer)
language sql stable security definer set search_path = ''
as $$
  select c.id, pp.id, pp.username, pp.display_name, pp.avatar, pp.star_points, pp.streak_current
  from cats_tongue.connections c
  join cats_tongue.public_profiles pp on pp.id = c.requester_id
  where c.status = 'pending' and c.recipient_id = (select auth.uid())
  order by c.created_at desc;
$$;
grant execute on function cats_tongue.list_pending_requests() to authenticated;

create or replace function cats_tongue.list_my_challenges()
returns table (id uuid, kind text, status cats_tongue.challenge_status, target_sessions smallint,
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
  from cats_tongue.challenges c
  join cats_tongue.public_profiles pp
    on pp.id = case when c.challenger_id = (select auth.uid()) then c.opponent_id else c.challenger_id end
  where (select auth.uid()) in (c.challenger_id, c.opponent_id)
  order by c.created_at desc;
$$;
grant execute on function cats_tongue.list_my_challenges() to authenticated;

create or replace function cats_tongue.friends_leaderboard()
returns table (id uuid, display_name text, avatar text,
               star_points integer, streak_current integer, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.display_name, pp.avatar, pp.star_points, pp.streak_current,
         (pp.id = (select auth.uid()))
  from cats_tongue.public_profiles pp
  where pp.id = (select auth.uid())
     or cats_tongue.are_friends((select auth.uid()), pp.id)
  order by pp.star_points desc
  limit 50;
$$;
grant execute on function cats_tongue.friends_leaderboard() to authenticated;
