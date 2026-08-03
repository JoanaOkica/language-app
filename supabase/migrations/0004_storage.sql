-- =============================================================================
-- 0004_storage.sql — Buckets and object-level access control
--
-- CO-TENANCY: `storage.objects` is shared with every other app in this project.
-- Policies are additive, so these grant access to Linguafox buckets only —
-- every rule below is pinned to `bucket_id`, and both the bucket ids and the
-- policy names are prefixed so nothing collides with the other projects.
--
-- Path convention: <bucket>/<user-uuid>/<file>. The first path segment is
-- pinned to auth.uid(), so a user can neither read nor overwrite another user's
-- objects even if they guess the file name.
-- =============================================================================

-- Speech recordings: private. Raw audio is deleted by the fred-turn Edge
-- Function as soon as it has been transcribed (privacy + storage cost).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'linguafox-speech', 'linguafox-speech', false, 10485760,     -- 10 MB
  array['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Avatar uploads: readable by anyone signed in (friend lists), writable only
-- by their owner. Note the app ships emoji avatars by default; this bucket
-- exists for a future custom-image option and is locked down accordingly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'linguafox-avatars', 'linguafox-avatars', true, 2097152,     -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Speech — strictly owner-scoped, no public read at all.
-- ---------------------------------------------------------------------------
create policy linguafox_speech_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'linguafox-speech'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy linguafox_speech_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'linguafox-speech'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy linguafox_speech_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'linguafox-speech'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Avatars — owner writes; reads are open because the bucket is public.
-- ---------------------------------------------------------------------------
create policy linguafox_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'linguafox-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy linguafox_avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'linguafox-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'linguafox-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy linguafox_avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'linguafox-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy linguafox_avatars_read_all on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'linguafox-avatars');
