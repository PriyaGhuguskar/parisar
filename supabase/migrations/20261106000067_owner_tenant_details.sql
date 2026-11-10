-- ============================================================================
-- Migration 067: proofs bucket, owner details, tenant details and approval chain.
--
-- A pending tenant has NO membership until the chain finishes, so the existing
-- review queue (approve_pending_membership) cannot skip the chain, and the JWT
-- hook gives them nothing to act with.
--
-- Chain: registered -> owner_approved -> admin_approved -> active, or rejected.
-- admin_approved is a resting state only while the tenancy start date is in the
-- future; otherwise the same call activates.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private bucket for proofs. Path: {society_id}/{uploader_user_id}/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('parisar-proofs', 'parisar-proofs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.flat_owners (
  id                   uuid primary key default gen_random_uuid(),
  society_id           uuid not null references public.societies(id) on delete cascade,
  flat_id              uuid not null references public.flats(id) on delete cascade,
  user_id              uuid references auth.users(id) on delete set null,
  full_name            text not null,
  phone10              text,
  is_primary           boolean not null default false,
  ownership_start_date date,
  membership_number    text,
  verified_at          timestamptz,
  verified_by          uuid references auth.users(id) on delete set null,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint flat_owners_name_len check (char_length(trim(full_name)) between 2 and 80),
  constraint flat_owners_phone check (phone10 is null or phone10 ~ '^[6-9][0-9]{9}$'),
  constraint flat_owners_number_len check (membership_number is null or char_length(membership_number) <= 40)
);
create unique index if not exists flat_owners_one_primary on public.flat_owners (flat_id) where is_primary;
create unique index if not exists flat_owners_flat_user on public.flat_owners (flat_id, user_id) where user_id is not null;
create unique index if not exists flat_owners_flat_phone on public.flat_owners (flat_id, phone10) where phone10 is not null;
create unique index if not exists flat_owners_membership_number
  on public.flat_owners (society_id, lower(membership_number)) where membership_number is not null;
create index if not exists idx_flat_owners_society on public.flat_owners (society_id);
create index if not exists idx_flat_owners_user on public.flat_owners (user_id);

create table if not exists public.flat_tenants (
  id                  uuid primary key default gen_random_uuid(),
  society_id          uuid not null references public.societies(id) on delete cascade,
  flat_id             uuid not null references public.flats(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  full_name           text not null,
  agreement_start     date,
  agreement_end       date,
  owner_name          text,
  owner_phone10       text,
  police_status       text not null default 'not_submitted',
  police_reference    text,
  status              text not null default 'registered',
  owner_approved_by   uuid references auth.users(id) on delete set null,
  owner_approved_at   timestamptz,
  owner_step_skipped  boolean not null default false,
  admin_approved_by   uuid references auth.users(id) on delete set null,
  admin_approved_at   timestamptz,
  activated_at        timestamptz,
  rejected_by         uuid references auth.users(id) on delete set null,
  rejected_at         timestamptz,
  rejected_reason     text,
  rejected_stage      text,
  membership_id       uuid references public.society_memberships(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint flat_tenants_status check (status in ('registered', 'owner_approved', 'admin_approved', 'active', 'rejected')),
  constraint flat_tenants_police check (police_status in ('not_submitted', 'submitted', 'verified', 'rejected')),
  constraint flat_tenants_name_len check (char_length(trim(full_name)) between 2 and 80),
  constraint flat_tenants_owner_phone check (owner_phone10 is null or owner_phone10 ~ '^[6-9][0-9]{9}$'),
  constraint flat_tenants_owner_name_len check (owner_name is null or char_length(owner_name) <= 80),
  constraint flat_tenants_reference_len check (police_reference is null or char_length(police_reference) <= 60),
  constraint flat_tenants_reason_len check (rejected_reason is null or char_length(rejected_reason) <= 500),
  constraint flat_tenants_dates check (agreement_end is null or agreement_start is null or agreement_end >= agreement_start)
);
create unique index if not exists flat_tenants_one_open_per_society
  on public.flat_tenants (society_id, user_id) where status in ('registered', 'owner_approved', 'admin_approved');
create unique index if not exists flat_tenants_one_active_per_flat_user
  on public.flat_tenants (flat_id, user_id) where status = 'active';
create index if not exists idx_flat_tenants_society_status on public.flat_tenants (society_id, status, created_at desc);
create index if not exists idx_flat_tenants_flat on public.flat_tenants (flat_id);

create table if not exists public.resident_documents (
  id           uuid primary key default gen_random_uuid(),
  society_id   uuid not null references public.societies(id) on delete cascade,
  subject_kind text not null,
  subject_id   uuid not null,
  doc_type     text not null,
  storage_path text not null unique,
  file_name    text,
  mime_type    text,
  byte_size    bigint,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint resident_documents_kind check (subject_kind in ('owner', 'tenant', 'staff')),
  constraint resident_documents_type check (doc_type in
    ('ownership_proof', 'sale_deed', 'share_certificate', 'id_proof', 'address_proof',
     'rent_agreement', 'police_verification', 'photo', 'other'))
);
create index if not exists idx_resident_documents_subject on public.resident_documents (subject_kind, subject_id);

alter table public.flat_owners enable row level security;
alter table public.flat_tenants enable row level security;
alter table public.resident_documents enable row level security;
revoke all on public.flat_owners from anon, authenticated;
revoke all on public.flat_tenants from anon, authenticated;
revoke all on public.resident_documents from anon, authenticated;

drop trigger if exists guard_society_service on public.flat_owners;
create trigger guard_society_service before insert or update or delete on public.flat_owners
  for each row execute function public.guard_society_service_write();
drop trigger if exists guard_society_service on public.flat_tenants;
create trigger guard_society_service before insert or update or delete on public.flat_tenants
  for each row execute function public.guard_society_service_write();
drop trigger if exists guard_society_service on public.resident_documents;
create trigger guard_society_service before insert or update or delete on public.resident_documents
  for each row execute function public.guard_society_service_write();

-- ---------------------------------------------------------------------------
-- Storage policies. Write: your own folder, in a society you have a live link to
-- (member, or an open tenant registration). Read and delete: the uploader or a
-- live manager of that society. Platform staff get no blanket access to proofs.
-- ---------------------------------------------------------------------------
create or replace function public.can_write_proof_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_parts text[];
  v_soc   uuid;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null or p_name is null or position('..' in p_name) > 0 then return false; end if;
  v_parts := string_to_array(p_name, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 3 then return false; end if;
  v_soc := public.parisar_try_uuid(v_parts[1]);
  if v_soc is null or public.parisar_try_uuid(v_parts[2]) is distinct from v_uid then return false; end if;
  if coalesce(v_parts[3] !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$', true) then return false; end if;
  return exists (select 1 from public.society_memberships m
                  where m.society_id = v_soc and m.user_id = v_uid and m.status = 'active')
      or exists (select 1 from public.flat_tenants t
                  where t.society_id = v_soc and t.user_id = v_uid
                    and t.status in ('registered', 'owner_approved', 'admin_approved'));
end;
$$;
revoke all on function public.can_write_proof_object(text) from public, anon;
grant execute on function public.can_write_proof_object(text) to authenticated, service_role;

create or replace function public.can_read_proof_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_parts text[];
  v_soc   uuid;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null or p_name is null then return false; end if;
  v_parts := string_to_array(p_name, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 3 then return false; end if;
  v_soc := public.parisar_try_uuid(v_parts[1]);
  if v_soc is null then return false; end if;
  return public.parisar_try_uuid(v_parts[2]) = v_uid
      or app_private.is_society_manager(v_soc);
end;
$$;
revoke all on function public.can_read_proof_object(text) from public, anon;
grant execute on function public.can_read_proof_object(text) to authenticated, service_role;

drop policy if exists parisar_proofs_read on storage.objects;
create policy parisar_proofs_read on storage.objects
  for select to authenticated
  using (bucket_id = 'parisar-proofs' and public.can_read_proof_object(name));

drop policy if exists parisar_proofs_write on storage.objects;
create policy parisar_proofs_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'parisar-proofs' and public.can_write_proof_object(name));

drop policy if exists parisar_proofs_delete on storage.objects;
create policy parisar_proofs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'parisar-proofs' and public.can_read_proof_object(name));

-- ---------------------------------------------------------------------------
-- Who may touch a proof subject. Returns the subject's society, or raises.
-- Managers may touch any subject in their society; a person only their own.
-- ---------------------------------------------------------------------------
create or replace function app_private.proof_subject_society(p_kind text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_soc  uuid;
  v_self boolean := false;
begin
  if p_kind = 'owner' then
    select o.society_id, o.user_id = v_uid into v_soc, v_self from public.flat_owners o where o.id = p_id;
  elsif p_kind = 'tenant' then
    select t.society_id, t.user_id = v_uid into v_soc, v_self from public.flat_tenants t where t.id = p_id;
  elsif p_kind = 'staff' then
    select s.society_id into v_soc from public.society_staff s where s.id = p_id;
  else
    raise exception 'INVALID_SUBJECT';
  end if;
  if v_soc is null or not (coalesce(v_self, false) or app_private.is_society_manager(v_soc)) then
    raise exception 'SUBJECT_NOT_FOUND';
  end if;
  return v_soc;
end;
$$;
revoke all on function app_private.proof_subject_society(text, uuid) from public, anon, authenticated;

create or replace function public.attach_proof(
  p_subject_kind text,
  p_subject_id   uuid,
  p_doc_type     text,
  p_storage_path text,
  p_file_name    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_soc   uuid;
  v_parts text[] := string_to_array(coalesce(p_storage_path, ''), '/');
  v_meta  jsonb;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_soc := app_private.proof_subject_society(p_subject_kind, p_subject_id);

  if coalesce(array_length(v_parts, 1), 0) <> 3
     or public.parisar_try_uuid(v_parts[1]) is distinct from v_soc
     or public.parisar_try_uuid(v_parts[2]) is distinct from v_uid then
    raise exception 'INVALID_PROOF_PATH';
  end if;

  select o.metadata into v_meta from storage.objects o
   where o.bucket_id = 'parisar-proofs' and o.name = p_storage_path;
  if not found then raise exception 'PROOF_NOT_UPLOADED'; end if;

  if (select count(*) from public.resident_documents d
       where d.subject_kind = p_subject_kind and d.subject_id = p_subject_id) >= 10 then
    raise exception 'TOO_MANY_PROOFS';
  end if;
  if exists (select 1 from public.resident_documents d where d.storage_path = p_storage_path) then
    raise exception 'PROOF_ALREADY_ATTACHED';
  end if;

  begin
    insert into public.resident_documents
      (society_id, subject_kind, subject_id, doc_type, storage_path, file_name, mime_type, byte_size, uploaded_by)
    values (v_soc, p_subject_kind, p_subject_id, p_doc_type, p_storage_path,
            left(nullif(trim(coalesce(p_file_name, '')), ''), 200),
            v_meta ->> 'mimetype', nullif(v_meta ->> 'size', '')::bigint, v_uid)
    returning id into v_id;
  exception when check_violation then
    raise exception 'INVALID_DOC_TYPE';
  end;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'proof.attached', 'resident_documents', v_id,
          jsonb_build_object('kind', p_subject_kind, 'subject_id', p_subject_id, 'doc_type', p_doc_type));

  return jsonb_build_object('id', v_id, 'storage_path', p_storage_path);
end;
$$;
revoke all on function public.attach_proof(text, uuid, text, text, text) from public, anon;
grant execute on function public.attach_proof(text, uuid, text, text, text) to authenticated;

create or replace function public.list_proofs(p_subject_kind text, p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.proof_subject_society(p_subject_kind, p_subject_id);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'doc_type', d.doc_type, 'storage_path', d.storage_path,
             'file_name', d.file_name, 'mime_type', d.mime_type, 'byte_size', d.byte_size,
             'uploaded_by_me', d.uploaded_by = v_uid, 'created_at', d.created_at
           ) order by d.created_at), '[]'::jsonb)
      from public.resident_documents d
     where d.subject_kind = p_subject_kind and d.subject_id = p_subject_id
  );
end;
$$;
revoke all on function public.list_proofs(text, uuid) from public, anon;
grant execute on function public.list_proofs(text, uuid) to authenticated;

-- Removes the record only. The client also removes the object through the Storage
-- API, which the storage policy allows for the uploader and managers.
create or replace function public.remove_proof(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_doc public.resident_documents;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_doc from public.resident_documents where id = p_document_id;
  if v_doc.id is null
     or not (v_doc.uploaded_by = v_uid or app_private.is_society_manager(v_doc.society_id)) then
    raise exception 'PROOF_NOT_FOUND';
  end if;
  delete from public.resident_documents where id = p_document_id;
  return jsonb_build_object('deleted', p_document_id, 'storage_path', v_doc.storage_path);
end;
$$;
revoke all on function public.remove_proof(uuid) from public, anon;
grant execute on function public.remove_proof(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner details
-- ---------------------------------------------------------------------------
-- Creates the owner row for someone who just joined a flat as an owner. The first
-- owner on a flat becomes primary. Idempotent.
create or replace function app_private.ensure_owner_row(
  p_society uuid, p_flat uuid, p_user uuid, p_name text, p_phone10 text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select o.id into v_id from public.flat_owners o
   where o.flat_id = p_flat and (o.user_id = p_user or (o.phone10 is not null and o.phone10 = p_phone10))
   limit 1;
  if v_id is not null then
    update public.flat_owners set user_id = p_user, updated_at = now()
     where id = v_id and user_id is null;
    return v_id;
  end if;
  insert into public.flat_owners (society_id, flat_id, user_id, full_name, phone10, is_primary, created_by)
  values (p_society, p_flat, p_user, p_name, p_phone10,
          not exists (select 1 from public.flat_owners o where o.flat_id = p_flat and o.is_primary), p_user)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function app_private.ensure_owner_row(uuid, uuid, uuid, text, text) from public, anon, authenticated;

create or replace function app_private.is_flat_owner(p_flat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.society_memberships m
                  where m.flat_id = p_flat and m.user_id = p_user
                    and m.status = 'active' and m.resident_type = 'owner')
$$;
revoke all on function app_private.is_flat_owner(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.owner_json(o public.flat_owners, p_show_phone boolean)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', o.id, 'flat_id', o.flat_id, 'user_id', o.user_id, 'full_name', o.full_name,
    'is_primary', o.is_primary, 'ownership_start_date', o.ownership_start_date,
    'membership_number', o.membership_number, 'verified', o.verified_at is not null,
    'verified_at', o.verified_at, 'phone', case when p_show_phone then o.phone10 end)
$$;
revoke all on function app_private.owner_json(public.flat_owners, boolean) from public, anon, authenticated;

-- Shared by the two entry points below; raises the documented codes.
create or replace function app_private.save_owner_row(
  p_owner_id uuid, p_society uuid, p_flat uuid, p_user uuid, p_name text, p_phone10 text,
  p_primary boolean, p_start date, p_number text
)
returns public.flat_owners
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text := nullif(trim(coalesce(p_number, '')), '');
  v_row    public.flat_owners;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if p_start is not null and p_start > current_date then raise exception 'INVALID_START_DATE'; end if;
  if v_number is not null and char_length(v_number) > 40 then raise exception 'INVALID_MEMBERSHIP_NUMBER'; end if;
  if v_number is not null and exists (
    select 1 from public.flat_owners o
     where o.society_id = p_society and lower(o.membership_number) = lower(v_number)
       and o.id is distinct from p_owner_id) then
    raise exception 'MEMBERSHIP_NUMBER_TAKEN';
  end if;
  if coalesce(p_primary, false) and exists (
    select 1 from public.flat_owners o
     where o.flat_id = p_flat and o.is_primary and o.id is distinct from p_owner_id) then
    raise exception 'PRIMARY_OWNER_EXISTS';
  end if;

  if p_owner_id is null then
    if exists (select 1 from public.flat_owners o
                where o.flat_id = p_flat
                  and ((p_user is not null and o.user_id = p_user)
                       or (p_phone10 is not null and o.phone10 = p_phone10))) then
      raise exception 'OWNER_ALREADY_ON_FLAT';
    end if;
    insert into public.flat_owners
      (society_id, flat_id, user_id, full_name, phone10, is_primary, ownership_start_date, membership_number, created_by)
    values (p_society, p_flat, p_user, trim(p_name), p_phone10, coalesce(p_primary, false), p_start, v_number, auth.uid())
    returning * into v_row;
  else
    update public.flat_owners
       set full_name = trim(p_name), phone10 = coalesce(p_phone10, phone10),
           is_primary = coalesce(p_primary, is_primary), ownership_start_date = p_start,
           membership_number = v_number, updated_at = now()
     where id = p_owner_id and flat_id = p_flat
    returning * into v_row;
    if v_row.id is null then raise exception 'OWNER_NOT_FOUND'; end if;
  end if;
  return v_row;
end;
$$;
revoke all on function app_private.save_owner_row(uuid, uuid, uuid, uuid, text, text, boolean, date, text)
  from public, anon, authenticated;

-- An active owner saves their own details. Self-declared until a manager verifies.
create or replace function public.owner_save_my_details(
  p_flat_id           uuid,
  p_full_name         text,
  p_is_primary        boolean default false,
  p_start_date        date default null,
  p_membership_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_soc   uuid;
  v_row   public.flat_owners;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not app_private.is_flat_owner(p_flat_id, v_uid) then raise exception 'NOT_FLAT_OWNER'; end if;
  select f.society_id into v_soc from public.flats f where f.id = p_flat_id;

  select o.id into v_id from public.flat_owners o where o.flat_id = p_flat_id and o.user_id = v_uid;
  v_row := app_private.save_owner_row(v_id, v_soc, p_flat_id, v_uid, p_full_name,
                                      app_private.caller_phone10(), p_is_primary, p_start_date, p_membership_number);
  return app_private.owner_json(v_row, true);
end;
$$;
revoke all on function public.owner_save_my_details(uuid, text, boolean, date, text) from public, anon;
grant execute on function public.owner_save_my_details(uuid, text, boolean, date, text) to authenticated;

-- A manager records an owner, who may not be on the app.
create or replace function public.manager_save_flat_owner(
  p_flat_id           uuid,
  p_full_name         text,
  p_phone             text default null,
  p_is_primary        boolean default false,
  p_start_date        date default null,
  p_membership_number text default null,
  p_owner_id          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_soc   uuid;
  v_phone text := null;
  v_row   public.flat_owners;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select f.society_id into v_soc from public.flats f where f.id = p_flat_id;
  if v_soc is null or not app_private.is_society_manager(v_soc) then raise exception 'NOT_SOCIETY_MANAGER'; end if;
  if nullif(trim(coalesce(p_phone, '')), '') is not null then
    v_phone := app_private.norm_mobile(p_phone);
    if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  end if;
  v_row := app_private.save_owner_row(p_owner_id, v_soc, p_flat_id, null, p_full_name, v_phone,
                                      p_is_primary, p_start_date, p_membership_number);
  return app_private.owner_json(v_row, true);
end;
$$;
revoke all on function public.manager_save_flat_owner(uuid, text, text, boolean, date, text, uuid) from public, anon;
grant execute on function public.manager_save_flat_owner(uuid, text, text, boolean, date, text, uuid) to authenticated;

-- Managers see phones. Active members of the flat see the owners without phones.
create or replace function public.list_flat_owners(p_flat_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_soc uuid;
  v_mgr boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select f.society_id into v_soc from public.flats f where f.id = p_flat_id;
  v_mgr := v_soc is not null and app_private.is_society_manager(v_soc);
  if v_soc is null or not (v_mgr or exists (
    select 1 from public.society_memberships m
     where m.flat_id = p_flat_id and m.user_id = v_uid and m.status = 'active')) then
    raise exception 'NOT_ALLOWED';
  end if;
  return (
    select coalesce(jsonb_agg(app_private.owner_json(o, v_mgr) order by o.is_primary desc, o.created_at), '[]'::jsonb)
      from public.flat_owners o where o.flat_id = p_flat_id
  );
end;
$$;
revoke all on function public.list_flat_owners(uuid) from public, anon;
grant execute on function public.list_flat_owners(uuid) to authenticated;

create or replace function public.manager_verify_flat_owner(p_owner_id uuid, p_verified boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.flat_owners;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.flat_owners where id = p_owner_id for update;
  if v_row.id is null or not app_private.is_society_manager(v_row.society_id) then
    raise exception 'OWNER_NOT_FOUND';
  end if;
  update public.flat_owners
     set verified_at = case when p_verified then now() end,
         verified_by = case when p_verified then auth.uid() end,
         updated_at = now()
   where id = p_owner_id
  returning * into v_row;
  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, auth.uid(), 'owner.verified', 'flat_owners', p_owner_id,
          jsonb_build_object('verified', p_verified));
  return app_private.owner_json(v_row, true);
end;
$$;
revoke all on function public.manager_verify_flat_owner(uuid, boolean) from public, anon;
grant execute on function public.manager_verify_flat_owner(uuid, boolean) to authenticated;

create or replace function public.manager_remove_flat_owner(p_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.flat_owners;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.flat_owners where id = p_owner_id;
  if v_row.id is null or not app_private.is_society_manager(v_row.society_id) then
    raise exception 'OWNER_NOT_FOUND';
  end if;
  delete from public.resident_documents where subject_kind = 'owner' and subject_id = p_owner_id;
  delete from public.flat_owners where id = p_owner_id;
  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, auth.uid(), 'owner.removed', 'flat_owners', p_owner_id, '{}'::jsonb);
  return jsonb_build_object('deleted', p_owner_id);
end;
$$;
revoke all on function public.manager_remove_flat_owner(uuid) from public, anon;
grant execute on function public.manager_remove_flat_owner(uuid) to authenticated;
