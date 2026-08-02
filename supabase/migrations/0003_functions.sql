-- =============================================================================
-- 0003_functions.sql — Server-authoritative game logic & safe read APIs
--
-- Anything that awards points, advances a streak, unlocks an outfit or scores a
-- challenge lives here as a SECURITY DEFINER function. The `authenticated` role
-- is explicitly denied EXECUTE on the privileged ones, so only Edge Functions
-- (service role) can invoke them. Read helpers that *are* client-callable
-- always re-derive the caller from auth.uid() and never trust an argument.
-- =============================================================================

-- Outfit unlock thresholds (feature E), kept in one place.
create or replace function public.outfit_for_streak(p_streak integer)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_streak >= 30 then 'legend'
    when p_streak >= 14 then 'globetrotter'
    when p_streak >= 7  then 'scholar'
    when p_streak >= 3  then 'explorer'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- award_points — the ONLY writer of star_points / streaks / mascot unlocks.
-- Idempotent per day for the streak counter: repeated activity on the same
-- day adds points but does not inflate the streak.
-- ---------------------------------------------------------------------------
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
  v_outfit  text;
begin
  if p_stars is null or p_stars < 0 or p_stars > 500 then
    raise exception 'invalid star amount';
  end if;

  -- Lock the row so concurrent sessions cannot double-advance the streak.
  select * into v_stats from public.user_stats where user_id = p_user for update;
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
  v_outfit  := public.outfit_for_streak(v_current);

  update public.user_stats
     set star_points        = star_points + p_stars,
         streak_current     = v_current,
         streak_longest     = v_longest,
         last_activity_date = v_today,
         mascot_level       = least(5, 1 + (v_longest / 7)),
         unlocked_outfits   = case
                                when v_outfit is not null and not (v_outfit = any(unlocked_outfits))
                                then unlocked_outfits || v_outfit
                                else unlocked_outfits
                              end,
         updated_at         = now()
   where user_id = p_user
   returning * into v_stats;

  return v_stats;
end;
$$;

revoke all on function public.award_points(uuid, integer) from public, anon, authenticated;
grant execute on function public.award_points(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- consume_daily_quota — atomic AI spend guard. Raises once the cap is reached,
-- which is what stops a single account from running up the API bill.
-- ---------------------------------------------------------------------------
create or replace function public.consume_daily_quota(
  p_user uuid,
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
  insert into public.usage_daily (user_id, day, session_count, tokens_used, audio_seconds)
  values (p_user, current_date, 1, greatest(p_tokens, 0), greatest(p_audio_seconds, 0))
  on conflict (user_id, day) do update
    set session_count = public.usage_daily.session_count + 1,
        tokens_used   = public.usage_daily.tokens_used + greatest(p_tokens, 0),
        audio_seconds = public.usage_daily.audio_seconds + greatest(p_audio_seconds, 0),
        updated_at    = now()
  returning session_count into v_count;

  if v_count > p_limit then
    raise exception 'daily_quota_exceeded' using errcode = 'P0001';
  end if;
  return v_count;
end;
$$;

revoke all on function public.consume_daily_quota(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_daily_quota(uuid, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- record_fred_session — one transaction: persist the session, bill the tokens,
-- award the points, advance any challenge. Called only by the fred-turn Edge
-- Function after it has verified the caller and run the AI pipeline.
-- ---------------------------------------------------------------------------
create or replace function public.record_fred_session(
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
  insert into public.fred_sessions (
    user_id, challenge_id, prompt, user_response_text, analysis_text,
    performance_score, score_breakdown, tokens_used, audio_seconds
  ) values (
    p_user, p_challenge_id, p_prompt, p_response, p_analysis,
    v_score, p_breakdown, greatest(coalesce(p_tokens, 0), 0), greatest(coalesce(p_audio_seconds, 0), 0)
  )
  returning id into v_session_id;

  update public.usage_daily
     set tokens_used   = tokens_used + greatest(coalesce(p_tokens, 0), 0),
         audio_seconds = audio_seconds + greatest(coalesce(p_audio_seconds, 0), 0),
         updated_at    = now()
   where user_id = p_user and day = current_date;

  perform public.award_points(p_user, (v_score / 10)::integer);

  if p_challenge_id is not null then
    perform public.progress_challenge(p_challenge_id, p_user);
  end if;

  return v_session_id;
end;
$$;

revoke all on function public.record_fred_session(uuid, text, text, text, smallint, jsonb, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.record_fred_session(uuid, text, text, text, smallint, jsonb, integer, integer, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- add_token_usage — accumulate spend outside a FRED turn (e.g. vocabulary
-- generation). Increments rather than overwrites the running daily total.
-- ---------------------------------------------------------------------------
create or replace function public.add_token_usage(p_user uuid, p_tokens integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_daily (user_id, day, tokens_used)
  values (p_user, current_date, greatest(coalesce(p_tokens, 0), 0))
  on conflict (user_id, day) do update
    set tokens_used = public.usage_daily.tokens_used + greatest(coalesce(p_tokens, 0), 0),
        updated_at  = now();
$$;

revoke all on function public.add_token_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_token_usage(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- progress_challenge — increments the caller's side of a challenge and settles
-- a winner when the target is met or the deadline passes (feature G).
-- ---------------------------------------------------------------------------
create or replace function public.progress_challenge(p_challenge uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
  v_challenger integer;
  v_opponent integer;
  v_winner uuid;
begin
  -- Signal to the column-freeze trigger that this is trusted server code.
  perform set_config('app.server_action', 'on', true);

  select * into c from public.challenges where id = p_challenge for update;
  if not found or c.status <> 'active' then
    return;
  end if;
  if p_user <> c.challenger_id and p_user <> c.opponent_id then
    return;                     -- not a participant: silently ignore
  end if;

  v_challenger := c.challenger_score + (case when p_user = c.challenger_id then 1 else 0 end);
  v_opponent   := c.opponent_score   + (case when p_user = c.opponent_id   then 1 else 0 end);

  if greatest(v_challenger, v_opponent) >= c.target_sessions or now() >= c.expires_at then
    v_winner := case when v_challenger >= v_opponent then c.challenger_id else c.opponent_id end;
  end if;

  update public.challenges
     set challenger_score = v_challenger,
         opponent_score   = v_opponent,
         status           = case when v_winner is not null then 'completed'::public.challenge_status else status end,
         winner_id        = coalesce(v_winner, winner_id),
         updated_at       = now()
   where id = p_challenge;

  if v_winner is not null then
    perform public.award_points(v_winner, 20);   -- winner's bonus
  end if;

  perform set_config('app.server_action', 'off', true);
end;
$$;

revoke all on function public.progress_challenge(uuid, uuid) from public, anon, authenticated;

-- =============================================================================
-- Client-callable helpers. Each one derives the user from auth.uid(); none of
-- them accepts a user id from the caller, so they cannot be pointed at someone
-- else's data.
-- =============================================================================

-- Equip an outfit — validated server-side against what is actually unlocked,
-- so a user cannot wear a reward they have not earned.
create or replace function public.equip_outfit(p_outfit text)
returns public.user_stats
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_stats public.user_stats;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select * into v_stats from public.user_stats where user_id = v_uid;
  if not found or not (p_outfit = any(v_stats.unlocked_outfits)) then
    raise exception 'outfit not unlocked';
  end if;

  update public.user_stats
     set equipped_outfit = p_outfit, updated_at = now()
   where user_id = v_uid
   returning * into v_stats;
  return v_stats;
end;
$$;

grant execute on function public.equip_outfit(text) to authenticated;

-- Profile search. Requires a real query string and returns a hard-capped page,
-- which blunts scraping of the whole user table.
create or replace function public.search_profiles(p_query text)
returns table (
  id uuid, username citext, display_name text, avatar_url text,
  star_points integer, streak_current integer, mascot_level integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.username, pp.display_name, pp.avatar_url,
         pp.star_points, pp.streak_current, pp.mascot_level
  from public.public_profiles pp
  where (select auth.uid()) is not null
    and char_length(btrim(p_query)) >= 2
    and pp.id <> (select auth.uid())
    and (pp.username ilike btrim(p_query) || '%' or pp.display_name ilike btrim(p_query) || '%')
  order by pp.username
  limit 20;
$$;

grant execute on function public.search_profiles(text) to authenticated;

-- Accepted friends, with the public stats needed to render the list.
create or replace function public.list_friends()
returns table (
  id uuid, username citext, display_name text, avatar_url text,
  star_points integer, streak_current integer, mascot_level integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.username, pp.display_name, pp.avatar_url,
         pp.star_points, pp.streak_current, pp.mascot_level
  from public.connections c
  join public.public_profiles pp
    on pp.id = case when c.requester_id = (select auth.uid()) then c.recipient_id else c.requester_id end
  where c.status = 'accepted'
    and (select auth.uid()) in (c.requester_id, c.recipient_id)
  order by pp.display_name;
$$;

grant execute on function public.list_friends() to authenticated;

-- Friend requests awaiting *my* response.
create or replace function public.list_pending_requests()
returns table (
  connection_id uuid, id uuid, username citext, display_name text,
  avatar_url text, star_points integer, streak_current integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, pp.id, pp.username, pp.display_name,
         pp.avatar_url, pp.star_points, pp.streak_current
  from public.connections c
  join public.public_profiles pp on pp.id = c.requester_id
  where c.status = 'pending'
    and c.recipient_id = (select auth.uid())
  order by c.created_at desc;
$$;

grant execute on function public.list_pending_requests() to authenticated;

-- Challenges I am part of, with the opponent's display info resolved.
create or replace function public.list_my_challenges()
returns table (
  id uuid, kind text, status public.challenge_status, target_sessions smallint,
  my_score integer, their_score integer, winner_id uuid,
  opponent_id uuid, opponent_name text, opponent_avatar text,
  i_am_opponent boolean, expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.kind, c.status, c.target_sessions,
         case when c.challenger_id = (select auth.uid()) then c.challenger_score else c.opponent_score end,
         case when c.challenger_id = (select auth.uid()) then c.opponent_score else c.challenger_score end,
         c.winner_id,
         pp.id, pp.display_name, pp.avatar_url,
         (c.opponent_id = (select auth.uid())),
         c.expires_at
  from public.challenges c
  join public.public_profiles pp
    on pp.id = case when c.challenger_id = (select auth.uid()) then c.opponent_id else c.challenger_id end
  where (select auth.uid()) in (c.challenger_id, c.opponent_id)
  order by c.created_at desc;
$$;

grant execute on function public.list_my_challenges() to authenticated;

-- Friends-and-me leaderboard (feature F/G).
create or replace function public.friends_leaderboard()
returns table (
  id uuid, display_name text, avatar_url text,
  star_points integer, streak_current integer, is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.display_name, pp.avatar_url, pp.star_points, pp.streak_current,
         (pp.id = (select auth.uid()))
  from public.public_profiles pp
  where pp.id = (select auth.uid())
     or public.are_friends((select auth.uid()), pp.id)
  order by pp.star_points desc
  limit 50;
$$;

grant execute on function public.friends_leaderboard() to authenticated;
