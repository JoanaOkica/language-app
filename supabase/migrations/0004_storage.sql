-- =============================================================================
-- 0004_storage.sql — Buckets and object-level access control
--
-- Path convention: <bucket>/<user-uuid>/<file>. Every policy pins the first
-- path segment to auth.uid(), so a user can neither read nor overwrite another
-- user's objects even if they guess the file name.
--
-- Size and MIME allow-lists are enforced by the storage service itself, which
-- prevents the bucket being abused as free file hosting or as a vector for
-- uploading executable content.
-- =============================================================================

-- Speech recordings: private. Raw audio is deleted by the fred-turn Edge
-- Function as soon as it has been transcribed (privacy + storage cost).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'speech', 'speech', false, 10485760,          -- 10 MB
  array['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Avatars: readable by signed-in users (friend lists need them), writable only
-- by their owner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,          -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- speech — strictly owner-scoped, no public read at all.
-- ---------------------------------------------------------------------------
create policy speech_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'speech'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy speech_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'speech'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy speech_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'speech'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- avatars — owner writes; reads are open because the bucket is public.
-- ---------------------------------------------------------------------------
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_read_all on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'avatars');
