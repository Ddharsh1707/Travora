-- =============================================================================
-- Phase 1: private document storage
--
--  * Bucket is PRIVATE. Files are only reachable through short-lived signed
--    URLs, and creating a signed URL requires passing the SELECT policy below.
--  * Path layout: <employee profile id>/<random uuid>.<ext>
--    The first folder decides who may see the file, so a user-chosen filename
--    never reaches the path (no traversal, no collisions, no PII in URLs).
--  * Size and MIME limits are enforced by Storage itself.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'travel-documents',
  'travel-documents',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy travel_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'travel-documents'
    and private.can_view_employee(private.try_uuid((storage.foldername(name))[1]))
  );

create policy travel_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'travel-documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp|csv|xlsx)$'
    and (
      private.try_uuid((storage.foldername(name))[1]) = private.current_profile_id()
      or private.is_staff()
    )
  );

-- No UPDATE policy: files are immutable. Replace = upload new + delete old.

create policy travel_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'travel-documents'
    and private.is_staff()
  );
