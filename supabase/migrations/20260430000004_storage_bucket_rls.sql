-- Phase 1 — Foundation: Storage bucket + prefix-based RLS
-- Per ARCHITECTURE.md Pattern 6 (lines 314-345) and PITFALLS.md Anti-Pattern 5.
-- Single bucket; first path segment = society_id; RLS on storage.objects.

-- Create the bucket (private, 50MB file size limit).
insert into storage.buckets (id, name, public, file_size_limit)
values ('parisar-attachments', 'parisar-attachments', false, 52428800)
on conflict (id) do update
  set public = false, file_size_limit = 52428800;

-- ============== storage.objects RLS ==============
-- Note: storage.objects already has RLS enabled by Supabase; we only add policies.

-- Tenant read: a user can SELECT objects whose first path segment matches their society_id.
create policy "parisar_tenant_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
  );

-- Tenant insert: a user can INSERT objects only into their own society's prefix.
create policy "parisar_tenant_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
  );

-- Tenant update: a user can UPDATE (rename, replace) only their own society's objects.
create policy "parisar_tenant_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
  )
  with check (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
  );

-- Tenant delete: a user can DELETE only their own society's objects.
-- (Phase 4+ will tighten this to "owner of the object only" for member-uploaded files;
-- for the foundation, society-scoped is sufficient.)
create policy "parisar_tenant_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
  );
