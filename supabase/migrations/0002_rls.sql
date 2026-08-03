-- =============================================================================
-- 0002_rls.sql — Row Level Security and least-privilege grants
--
-- Threat model: every authenticated user is a potential attacker holding a
-- valid JWT and the public anon key. They can call PostgREST directly with
-- arbitrary filters, so nothing may rely on the client sending the right query.
--
-- Four layers, in order of how hard they are to get wrong:
--   1. GRANTS   — the client role is given only the verbs it genuinely needs.
--                 Tables the server owns carry no write grant at all, so even a
--                 mistaken policy later cannot be exploited.
--   2. RLS      — row visibility and mutation scoped to auth.uid().
--   3. TRIGGERS — freeze server-owned columns that RLS cannot protect on UPDATE.
--   4. DEFAULTS — future tables in this schema inherit "no access" until an
--                 explicit grant is written.
--
-- Nothing here touches the `public` schema or any other app's objects.
-- =============================================================================

alter table linguafox.profiles            enable row level security;
alter table linguafox.user_stats          enable row level security;
alter table linguafox.tasks               enable row level security;
alter table linguafox.vocabulary          enable row level security;
alter table linguafox.vocabulary_examples enable row level security;
alter table linguafox.fred_sessions       enable row level security;
alter table linguafox.usage_daily         enable row level security;
alter table linguafox.connections         enable row level security;
alter table linguafox.challenges          enable row level security;

-- ---------------------------------------------------------------------------
-- 1. Least-privilege grants
--
-- Supabase's default privileges apply to `public` only, so this schema starts
-- with nothing granted — an allow-list by construction. `anon` is never named.
-- ---------------------------------------------------------------------------
-- Column-level UPDATE: the client may edit its own profile fields and nothing
-- else. `id`, `created_at` and `updated_at` are unreachable even for the owner.
grant select, insert on linguafox.profiles to authenticated;
grant update (username, display_name, avatar, native_language,
              target_language, level, is_public, onboarded)
  on linguafox.profiles to authenticated;
grant select                         on linguafox.user_stats          to authenticated;
grant select, insert, update, delete on linguafox.tasks               to authenticated;
grant select, delete                 on linguafox.vocabulary          to authenticated;
grant select, delete                 on linguafox.vocabulary_examples to authenticated;
grant select                         on linguafox.fred_sessions       to authenticated;
grant select                         on linguafox.usage_daily         to authenticated;
grant select, insert, update, delete on linguafox.connections         to authenticated;
grant select, insert, update         on linguafox.challenges          to authenticated;

-- Vocabulary rows are written by the trusted server (see upsert_vocabulary),
-- never by the client, which is why no INSERT/UPDATE grant appears above.

grant all on all tables in schema linguafox to service_role;

-- Anything added to this schema later is inaccessible until granted explicitly.
alter default privileges in schema linguafox revoke all on tables from public;
alter default privileges in schema linguafox grant all on tables to service_role;

-- ---------------------------------------------------------------------------
-- Helper: is there an accepted friendship between two users?
-- SECURITY DEFINER so policies can consult `connections` without granting the
-- caller broad read access. `search_path = ''` blocks search-path hijacking,
-- the classic Postgres privilege-escalation route.
-- ---------------------------------------------------------------------------
create or replace function linguafox.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from linguafox.connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.recipient_id = b)
        or (c.requester_id = b and c.recipient_id = a))
  );
$$;

revoke all on function linguafox.are_friends(uuid, uuid) from public;
grant execute on function linguafox.are_friends(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. profiles — private. Others see you only through `public_profiles`.
-- ---------------------------------------------------------------------------
create policy profiles_select_own on linguafox.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own on linguafox.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on linguafox.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Deletion goes through the delete-account Edge Function, which also clears
-- storage objects; there is deliberately no client DELETE grant or policy.

-- ---------------------------------------------------------------------------
-- 3. user_stats — read-only to its owner. XP, streaks and leagues can only
-- change through award_points(), which `authenticated` cannot execute.
-- ---------------------------------------------------------------------------
create policy user_stats_select_own on linguafox.user_stats
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. tasks — fully owned by the user.
-- ---------------------------------------------------------------------------
create policy tasks_all_own on linguafox.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. vocabulary + examples — owner reads and deletes; the server writes.
-- ---------------------------------------------------------------------------
create policy vocabulary_select_own on linguafox.vocabulary
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy vocabulary_delete_own on linguafox.vocabulary
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy vocabulary_examples_select_own on linguafox.vocabulary_examples
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy vocabulary_examples_delete_own on linguafox.vocabulary_examples
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. fred_sessions & usage_daily — owner reads, server writes.
-- ---------------------------------------------------------------------------
create policy fred_sessions_select_own on linguafox.fred_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy usage_select_own on linguafox.usage_daily
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. connections — only the two parties can see or touch the row.
--
-- The UPDATE policy is deliberately asymmetric: `using` matches the OLD row and
-- `with check` the NEW one, so only the *recipient* can move a request out of
-- 'pending'. Without this a requester could accept their own friend request.
-- ---------------------------------------------------------------------------
create policy connections_select_involved on linguafox.connections
  for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy connections_insert_own on linguafox.connections
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and status = 'pending'
  );

create policy connections_respond on linguafox.connections
  for update to authenticated
  using (recipient_id = (select auth.uid()) and status = 'pending')
  with check (
    recipient_id = (select auth.uid())
    and status in ('accepted', 'declined', 'blocked')
  );

create policy connections_delete_involved on linguafox.connections
  for delete to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. challenges — participants only, and friends only. Requiring an accepted
-- friendship stops challenge spam being used to harass strangers.
-- ---------------------------------------------------------------------------
create policy challenges_select_participant on linguafox.challenges
  for select to authenticated
  using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()));

create policy challenges_insert_own on linguafox.challenges
  for insert to authenticated
  with check (
    challenger_id = (select auth.uid())
    and opponent_id <> (select auth.uid())
    and status = 'pending'
    and challenger_score = 0
    and opponent_score = 0
    and winner_id is null
    and linguafox.are_friends((select auth.uid()), opponent_id)
  );

create policy challenges_respond on linguafox.challenges
  for update to authenticated
  using (opponent_id = (select auth.uid()) and status = 'pending')
  with check (opponent_id = (select auth.uid()) and status in ('active', 'declined'));

-- ---------------------------------------------------------------------------
-- 9. Column-freeze triggers
--
-- RLS `with check` validates the new row but cannot say "this column must not
-- have changed". These close that gap: a client cannot rewrite the participants
-- of a connection, nor edit challenge scores or the winner. Trusted code opts
-- out with a session-local flag that only SECURITY DEFINER functions set.
-- ---------------------------------------------------------------------------
create or replace function linguafox.is_server_action()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(current_setting('linguafox.server_action', true), 'off') = 'on';
$$;

create or replace function linguafox.guard_connection_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if linguafox.is_server_action() then
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
  before update on linguafox.connections
  for each row execute function linguafox.guard_connection_columns();

create or replace function linguafox.guard_challenge_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if linguafox.is_server_action() then
    return new;
  end if;
  if new.challenger_id       is distinct from old.challenger_id
     or new.opponent_id      is distinct from old.opponent_id
     or new.challenger_score is distinct from old.challenger_score
     or new.opponent_score   is distinct from old.opponent_score
     or new.winner_id        is distinct from old.winner_id
     or new.target_sessions  is distinct from old.target_sessions
     or new.kind             is distinct from old.kind
     -- expires_at MUST be frozen: progress_challenge settles a winner as soon
     -- as now() >= expires_at, so an opponent who could backdate it would win
     -- instantly (and collect the bonus) on their first session.
     or new.expires_at       is distinct from old.expires_at then
    raise exception 'challenge scoring fields are server-controlled';
  end if;
  return new;
end;
$$;

create trigger challenges_guard
  before update on linguafox.challenges
  for each row execute function linguafox.guard_challenge_columns();
