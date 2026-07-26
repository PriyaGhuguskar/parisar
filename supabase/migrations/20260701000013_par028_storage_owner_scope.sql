-- PAR-028 (partial) — Storage UPDATE/DELETE on the parisar-attachments bucket were
-- society-wide, letting ANY same-society member overwrite or delete another
-- member's complaint photos / fine PDFs. Restrict mutation to the object OWNER
-- (the uploader, storage.objects.owner = auth.uid()) IN ADDITION to the existing
-- society-prefix check. Reads stay society-scoped (directory/detail views need
-- to display attachments); the `attachments` table SELECT scoping is tracked
-- separately.

drop policy if exists "parisar_tenant_update" on storage.objects;
create policy "parisar_tenant_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
    and owner = auth.uid()
  );

drop policy if exists "parisar_tenant_delete" on storage.objects;
create policy "parisar_tenant_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and (storage.foldername(name))[1]::uuid = public.current_society_id()
    and owner = auth.uid()
  );
