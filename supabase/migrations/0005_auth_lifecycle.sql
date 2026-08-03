-- =============================================================================
-- 0005_auth_lifecycle.sql — Unconfirmed-signup expiry
--
-- Requirement: an account that is never confirmed must disappear after 24 hours.
--
-- CO-TENANCY WARNING: `auth.users` is shared with every other app in this
-- project, so a blanket "delete unconfirmed users" job would delete the pet
-- game's pending signups too. The purge is therefore scoped to rows the
-- Cat's Tongue client tagged at signup:
--
--     supabase.auth.signUp({ ..., options: { data: { app: 'cats_tongue' } } })
--
-- which lands in `raw_user_meta_data->>'app'`. A user created by any other app
-- has no such tag and is never touched. Three further conditions must all hold:
-- the address is still unconfirmed, the row is older than the grace period, and
-- no Cat's Tongue profile exists (profiles are only created after confirmation).
-- =============================================================================

create or replace function cats_tongue.purge_unconfirmed_signups(
  p_grace interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with doomed as (
    delete from auth.users u
    where u.raw_user_meta_data->>'app' = 'cats_tongue'   -- ours, and only ours
      and u.email_confirmed_at is null                 -- never verified
      and u.created_at < now() - p_grace               -- past the grace period
      and not exists (                                 -- belt and braces
        select 1 from cats_tongue.profiles p where p.id = u.id
      )
    returning u.id
  )
  select count(*) into v_deleted from doomed;

  return v_deleted;
end;
$$;

comment on function cats_tongue.purge_unconfirmed_signups(interval) is
  'Deletes Cat''s Tongue signups that were never email-confirmed within the grace '
  'period. Scoped by raw_user_meta_data->>''app'' so other apps sharing '
  'auth.users are unaffected.';

revoke all on function cats_tongue.purge_unconfirmed_signups(interval) from public;
grant execute on function cats_tongue.purge_unconfirmed_signups(interval) to service_role;

-- ---------------------------------------------------------------------------
-- Hourly schedule, if pg_cron is available.
--
-- Enable it once per project with:  create extension pg_cron with schema cron;
-- If it is not installed this migration still succeeds — it just prints a
-- notice, and the purge can be driven by any external scheduler calling the
-- function (or the `purge-unconfirmed` Edge Function) instead. Installing an
-- extension is a project-wide act, so it is left as a deliberate choice rather
-- than something this migration does to a shared database.
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cats-tongue-purge-unconfirmed') then
      perform cron.unschedule('cats-tongue-purge-unconfirmed');
    end if;
    perform cron.schedule(
      'cats-tongue-purge-unconfirmed',
      '17 * * * *',                                   -- hourly, off the hour
      $job$ select cats_tongue.purge_unconfirmed_signups(); $job$
    );
    raise notice 'Scheduled hourly job cats-tongue-purge-unconfirmed.';
  else
    raise notice
      'pg_cron not installed — schedule cats_tongue.purge_unconfirmed_signups() externally.';
  end if;
end
$do$;
