-- ============================================================================
-- Migration 073: fixes from reviewing 058-072 against the older flows.
--
--   §1 resident_type follows residency when an older RPC changes only residency.
--      onboard_resident does this to an authority's flat-less row: a tenant
--      authority stayed 'owner' and could have approved tenants on that flat.
--   §2 Removing a member erases what these new tables hold about them, matching
--      remove_member's DPDP redaction of the profile. Files in the proofs bucket
--      can only be removed through the Storage API; see REPORT notes in API.md.
--   §3 The request lifecycle cannot be skipped: staff lose direct UPDATE on
--      society_enrollment_requests. No client uses it (audited apps/ and packages/).
--   §4 Joining a flat needs an OTP-verified phone. A profile phone of '+' would
--      otherwise collide on profiles_phone_key.
--   §5 Cancelling an import drops its rows, which hold names and mobiles.
-- ============================================================================

-- §1
create or replace function app_private.membership_type_follows_residency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.residency is distinct from old.residency
     and new.resident_type is not distinct from old.resident_type
     and old.resident_type in ('owner', 'tenant') then
    new.resident_type := new.residency::text;
  end if;
  return new;
end;
$$;
revoke all on function app_private.membership_type_follows_residency() from public, anon, authenticated;

drop trigger if exists membership_type_follows_residency on public.society_memberships;
create trigger membership_type_follows_residency
  before update of residency on public.society_memberships
  for each row execute function app_private.membership_type_follows_residency();

-- §2
create or replace function app_private.membership_removed_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
begin
  if new.status <> 'deleted' or old.status = 'deleted' then return new; end if;

  select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) into v_phone
    from auth.users u where u.id = new.user_id;

  delete from public.resident_documents d
   where d.society_id = new.society_id
     and ((d.subject_kind = 'owner' and d.subject_id in
             (select o.id from public.flat_owners o
               where o.society_id = new.society_id and o.user_id = new.user_id))
       or (d.subject_kind = 'tenant' and d.subject_id in
             (select t.id from public.flat_tenants t
               where t.society_id = new.society_id and t.user_id = new.user_id)));

  delete from public.flat_owners o where o.society_id = new.society_id and o.user_id = new.user_id;
  delete from public.flat_tenants t where t.society_id = new.society_id and t.user_id = new.user_id;
  delete from public.household_access_requests r
   where r.society_id = new.society_id and r.requester_id = new.user_id;
  delete from public.resident_import_rows x
   where x.society_id = new.society_id and x.mobile = v_phone;
  delete from public.resident_records r
   where r.society_id = new.society_id and (r.user_id = new.user_id or r.phone10 = v_phone);

  return new;
end;
$$;
revoke all on function app_private.membership_removed_cleanup() from public, anon, authenticated;

drop trigger if exists membership_removed_cleanup on public.society_memberships;
create trigger membership_removed_cleanup
  after update of status on public.society_memberships
  for each row execute function app_private.membership_removed_cleanup();

-- §3
drop policy if exists enrollment_staff_update on public.society_enrollment_requests;
drop policy if exists enrollment_admin_update on public.society_enrollment_requests;
revoke update on public.society_enrollment_requests from authenticated;
revoke update (status, notes, handled_by, society_id, updated_at)
  on public.society_enrollment_requests from authenticated;

-- §4: body of 065, with the phone check first.
create or replace function app_private.link_member_to_flat(
  p_society   uuid,
  p_user      uuid,
  p_flat      uuid,
  p_residency public.residency_kind,
  p_type      text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mem   public.society_memberships;
  v_id    uuid;
  v_phone text;
begin
  select u.phone into v_phone from auth.users u
   where u.id = p_user and u.phone_confirmed_at is not null;
  if coalesce(v_phone, '') = '' then raise exception 'NO_PHONE'; end if;

  if not exists (select 1 from public.flats f where f.id = p_flat and f.society_id = p_society) then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;
  if not public.society_accepts_joins(p_society) then raise exception 'SOCIETY_BLOCKED'; end if;

  if exists (select 1 from public.society_memberships m
              where m.society_id = p_society and m.user_id = p_user and m.status = 'deleted')
     and not exists (select 1 from public.society_authorities a
                      where a.society_id = p_society and a.user_id = p_user) then
    raise exception 'MEMBERSHIP_REMOVED';
  end if;

  insert into public.profiles (user_id, full_name, phone)
  values (p_user, p_full_name, '+' || v_phone)
  on conflict (user_id) do update
    set full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name);

  select * into v_mem from public.society_memberships m
   where m.society_id = p_society and m.user_id = p_user and m.status = 'active'
   order by (m.flat_id is not null) desc
   limit 1
   for update;

  if v_mem.id is not null then
    if v_mem.flat_id is not null and v_mem.flat_id <> p_flat then
      raise exception 'ALREADY_MEMBER_OTHER_FLAT';
    end if;
    update public.society_memberships
       set flat_id = p_flat, residency = p_residency,
           resident_type = case when flat_id is null then p_type else coalesce(resident_type, p_type) end
     where id = v_mem.id;
    v_id := v_mem.id;
  else
    update public.society_memberships
       set status = 'rejected'
     where society_id = p_society and user_id = p_user
       and status = 'pending_review' and flat_id is distinct from p_flat;

    update public.society_memberships
       set status = 'active', residency = p_residency, resident_type = p_type, joined_at = now()
     where society_id = p_society and user_id = p_user and flat_id = p_flat
    returning id into v_id;

    if v_id is null then
      insert into public.society_memberships
        (society_id, user_id, flat_id, role, residency, household, resident_type, status, joined_at)
      values (p_society, p_user, p_flat, 'member', p_residency, 'family', p_type, 'active', now())
      returning id into v_id;
    end if;
  end if;

  update public.resident_records r
     set status = 'verified', user_id = p_user, membership_id = v_id,
         verified_at = coalesce(r.verified_at, now()), updated_at = now()
   where r.society_id = p_society and r.flat_id = p_flat
     and r.status in ('pending', 'needs_correction')
     and r.phone10 = right(regexp_replace(v_phone, '\D', '', 'g'), 10);

  return v_id;
end;
$$;
revoke all on function app_private.link_member_to_flat(uuid, uuid, uuid, public.residency_kind, text, text)
  from public, anon, authenticated;

-- §5
create or replace function public.import_cancel_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.resident_import_batches;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_batch from public.resident_import_batches where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  begin
    perform app_private.assert_manager(v_batch.society_id);
  exception when others then
    raise exception 'BATCH_NOT_FOUND';
  end;
  if v_batch.status = 'confirmed' then raise exception 'BATCH_ALREADY_CONFIRMED'; end if;
  delete from public.resident_import_rows where batch_id = p_batch_id;
  update public.resident_import_batches set status = 'cancelled' where id = p_batch_id;
  return jsonb_build_object('batch_id', p_batch_id, 'status', 'cancelled');
end;
$$;
revoke all on function public.import_cancel_batch(uuid) from public, anon;
grant execute on function public.import_cancel_batch(uuid) to authenticated;
