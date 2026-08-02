-- =============================================================================
-- 0002_rls.sql — Row Level Security: strict multi-tenant isolation
--
-- Threat model: every authenticated user is a potential attacker holding a
-- valid JWT and the public anon key. They can call PostgREST directly with
-- arbitrary filters, so *nothing* may rely on the client sending the right
-- query. Isolation is enforced here, in the database.
--
-- Layered defence:
--   1. GRANTs   — remove the ability to write tables the client must never
--                 write, so a future mistaken policy still cannot be exploited.
--   2. RLS      — row visibility/mutation scoped to auth.uid().
--   3. TRIGGERS — freeze server-owned columns (scores, winner, participants)
--                 that RLS alone cannot protect on UPDATE.
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.user_stats    enable row level security;
alter table public.tasks         enable row level security;
alter table public.vocabulary    enable row level security;
alter table public.fred_sessions enable row level security;
alter table public.usage_daily   enable row level security;
alter table public.connections   enable row level security;
alter table public.challenges    enable row level security;

-- ---------------------------------------------------------------------------
-- 1. Baseline privileges
-- Anonymous users get nothing at all. Authenticated users get only the verbs
-- they legitimately need; server-authoritative tables are read-only to them.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

revoke insert, update, delete on public.user_stats    from authenticated;
revoke insert, update, delete on public.fred_sessions from authenticated;
revoke insert, update, delete on public.usage_daily   from authenticated;
revoke delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Helper: is there an accepted friendship between two users?
-- STABLE + SECURITY DEFINER so it can consult `connections` from inside other
-- policies without granting the caller broad read access. `search_path = ''`
-- blocks search-path hijacking, a classic Postgres privilege-escalation route.
-- ---------------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and (
        (c.requester_id = a and c.recipient_id = b) or
        (c.requester_id = b and c.recipient_id = a)
      )
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. profiles — private. Other users see you only via `public_profiles`.
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. user_stats — read-only to its owner. No write policy exists on purpose:
-- Star Points, streaks and mascot unlocks can only change through the
-- SECURITY DEFINER functions in 0003, i.e. never at the client's discretion.
-- ---------------------------------------------------------------------------
create policy user_stats_select_own on public.user_stats
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. tasks & vocabulary — fully owned by the user.
-- ---------------------------------------------------------------------------
create policy tasks_all_own on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy vocabulary_all_own on public.vocabulary
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. fred_sessions & usage_daily — owner reads, server writes.
-- ---------------------------------------------------------------------------
create policy fred_sessions_select_own on public.fred_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy usage_select_own on public.usage_daily
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. connections — only the two parties involved can see or touch the row.
--
-- The UPDATE policy is deliberately asymmetric: `using` matches the OLD row and
-- `with check` the NEW one, so only the *recipient* can move a request out of
-- 'pending'. Without this a requester could accept their own friend request.
-- ---------------------------------------------------------------------------
create policy connections_select_involved on public.connections
  for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy connections_insert_own on public.connections
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and status = 'pending'
  );

create policy connections_respond on public.connections
  for update to authenticated
  using (recipient_id = (select auth.uid()) and status = 'pending')
  with check (
    recipient_id = (select auth.uid())
    and status in ('accepted', 'declined', 'blocked')
  );

create policy connections_delete_involved on public.connections
  for delete to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. challenges — participants only. A challenge may only be opened against an
-- accepted friend, which stops challenge spam being used to harass strangers.
-- ---------------------------------------------------------------------------
create policy challenges_select_participant on public.challenges
  for select to authenticated
  using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()));

create policy challenges_insert_own on public.challenges
  for insert to authenticated
  with check (
    challenger_id = (select auth.uid())
    and opponent_id <> (select auth.uid())
    and status = 'pending'
    and challenger_score = 0
    and opponent_score = 0
    and winner_id is null
    and public.are_friends((select auth.uid()), opponent_id)
  );

create policy challenges_respond on public.challenges
  for update to authenticated
  using (opponent_id = (select auth.uid()) and status = 'pending')
  with check (opponent_id = (select auth.uid()) and status in ('active', 'declined'));

-- ---------------------------------------------------------------------------
-- 8. Column freeze triggers
--
-- RLS `with check` validates the new row but cannot say "this column must not
-- have changed". These triggers close that gap: a client cannot rewrite the
-- participants of a connection, nor edit challenge scores or the winner.
-- Server-side code signals its intent with a session-local flag that only the
-- SECURITY DEFINER functions in 0003 ever set.
-- ---------------------------------------------------------------------------
create or replace function public.is_server_action()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(current_setting('app.server_action', true), 'off') = 'on';
$$;

create or replace function public.guard_connection_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_server_action() then
    return new;
  end if;
  if new.requester_id is distinct from old.requester_id
     or new.recipient_id is distinct from old.recipient_id then
    raise exception 'connection participants are immutable';
  end if;
  return new;
end;
$$;

create trigger connections_guard
  before update on public.connections
  for each row execute function public.guard_connection_columns();

create or replace function public.guard_challenge_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_server_action() then
    return new;
  end if;
  if new.challenger_id    is distinct from old.challenger_id
     or new.opponent_id      is distinct from old.opponent_id
     or new.challenger_score is distinct from old.challenger_score
     or new.opponent_score   is distinct from old.opponent_score
     or new.winner_id        is distinct from old.winner_id
     or new.target_sessions  is distinct from old.target_sessions then
    raise exception 'challenge scoring fields are server-controlled';
  end if;
  return new;
end;
$$;

create trigger challenges_guard
  before update on public.challenges
  for each row execute function public.guard_challenge_columns();
