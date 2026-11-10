-- ============================================================================
-- Migration 090: adversarial review fixes (flat claims and the tenant chain).
--
-- HIGH  onboard_resident (the older join RPC, still granted to every signed-in
--       user) made anyone with the society code an ACTIVE tenant of any vacant
--       flat, skipping the owner and society approvals of the tenant chain (068).
--       A tenant now always lands in the society's pending_review queue unless
--       they are an authority of that society.
-- HIGH  A flat counted as free when no app user lived on it, even when the
--       society had imported or recorded its residents (065/067). A stranger
--       with the code could claim such a flat as owner and become active before
--       the real owner confirmed their record. "Taken" now also covers a live
--       resident record, a recorded owner or an approved tenancy belonging to
--       someone else. The caller's own record never blocks them.
-- MED   tenant_owner_decide let the registrant decide their own tenancy when
--       they were also an owner of the flat.
--
-- Unchanged: an owner on a genuinely free flat joins at once, an authority is
-- never held back, an occupied flat goes to review as before.
-- ============================================================================

-- Is this flat already held by someone other than this caller?
create or replace function app_private.flat_held_by_other(p_flat uuid, p_uid uuid, p_phone10 text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.society_memberships m
                  where m.flat_id = p_flat and m.status = 'active' and m.user_id <> p_uid)
      or exists (select 1 from public.resident_records r
                  where r.flat_id = p_flat and r.status <> 'rejected'
                    and r.user_id is distinct from p_uid
                    and r.phone10 is distinct from p_phone10)
      or exists (select 1 from public.flat_owners o
                  where o.flat_id = p_flat
                    and o.user_id is distinct from p_uid
                    and (o.phone10 is null or o.phone10 is distinct from p_phone10))
      -- Approved tenancies only: an unapproved registration must not let a
      -- stranger push the real owner into review.
      or exists (select 1 from public.flat_tenants t
                  where t.flat_id = p_flat and t.user_id <> p_uid
                    and t.status in ('owner_approved', 'admin_approved', 'active'))
$$;
revoke all on function app_private.flat_held_by_other(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.onboard_resident(p_code text, p_flat_id uuid, p_full_name text, p_residency residency_kind, p_alt_phone text, p_family jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.society_codes;
  v_soc       uuid;
  v_phone     text;
  v_status    text;
  v_taken     boolean;
  v_mem_id    uuid;
  v_fam       jsonb;
  v_fam_phone text;
  v_authority uuid;
  v_role      public.membership_role := 'member';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_code_attempts_ok(v_uid);                       -- (054)
  if p_full_name is null or length(trim(p_full_name)) < 2 then raise exception 'INVALID_NAME'; end if;

  select * into v_row from public.society_codes where code = upper(p_code) and revoked_at is null;
  if not found then
    perform app_private.record_code_failure(v_uid, 'INVALID_CODE');         -- (054)
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_row.paused_at is not null and not exists (select 1 from public.society_memberships m
                       where m.society_id = v_row.society_id and m.user_id = v_uid
                         and m.status = 'active' and m.flat_id is null
                         and m.role in ('secretary', 'co_secretary')) then
    perform app_private.record_code_failure(v_uid, 'CODE_PAUSED');          -- (054)
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_soc) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;

  select '+' || phone into v_phone from auth.users where id = v_uid;

  select id into v_authority
  from public.society_authorities
  where society_id = v_soc
    and (user_id = v_uid
         or (user_id is null
             and phone = right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10)))
  limit 1;

  -- (054) removed by the society: no self-service way back in.
  if v_authority is null and exists (
    select 1 from public.society_memberships
     where society_id = v_soc and user_id = v_uid and status = 'deleted'
  ) then
    return jsonb_build_object('error', 'MEMBERSHIP_REMOVED');
  end if;

  if v_authority is not null then
    v_role := 'secretary';
    update public.society_authorities
       set user_id = v_uid, claimed_at = coalesce(claimed_at, now())
     where id = v_authority;
  end if;

  -- (090) "Taken" also covers a flat the society has already recorded for
  -- someone else, and a tenant always waits: the tenant chain (068) is the
  -- only way to an active tenancy, so a direct call goes to the review queue.
  v_taken := app_private.flat_held_by_other(p_flat_id, v_uid, app_private.caller_phone10());
  v_status := case when v_authority is null and (v_taken or p_residency = 'tenant')
                   then 'pending_review' else 'active' end;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, trim(p_full_name), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  select id into v_mem_id
  from public.society_memberships
  where society_id = v_soc and user_id = v_uid and flat_id is null and status = 'active'
  limit 1;

  -- (090) Attaching a flat to an existing flat-less membership makes it live at
  -- once, so only do that when the claim needs no review.
  if v_mem_id is not null and v_status = 'active' then
    update public.society_memberships
       set flat_id = p_flat_id, residency = p_residency,
           emergency_contact = nullif(trim(coalesce(p_alt_phone,'')), ''),
           role = case when v_role = 'secretary' then 'secretary'::public.membership_role else role end
     where id = v_mem_id;
  else
    insert into public.society_memberships
      (society_id, user_id, flat_id, role, residency, household, emergency_contact, status)
    values (v_soc, v_uid, p_flat_id, v_role, p_residency, 'family',
            nullif(trim(coalesce(p_alt_phone,'')), ''), v_status)
    on conflict (society_id, user_id, flat_id) do update
      set status = case
                     when public.society_memberships.status = 'deleted'
                          and excluded.role <> 'secretary'
                       then public.society_memberships.status          -- (054)
                     -- (090) re-submitting never demotes a row that is already live
                     when public.society_memberships.status = 'active'
                       then public.society_memberships.status
                     else excluded.status
                   end,
          residency = excluded.residency,
          emergency_contact = excluded.emergency_contact, joined_at = now(),
          role = case when excluded.role = 'secretary' then excluded.role
                      else public.society_memberships.role end
    returning id into v_mem_id;
  end if;

  for v_fam in select * from jsonb_array_elements(p_family)
  loop
    if coalesce(trim(v_fam->>'name'), '') = '' then continue; end if;
    v_fam_phone := nullif(regexp_replace(coalesce(v_fam->>'phone',''), '\D', '', 'g'), '');
    if v_fam_phone is not null then
      v_fam_phone := '+91' || right(v_fam_phone, 10);
      if exists (select 1 from public.family_members
                  where society_id = v_soc and phone = v_fam_phone and claimed_user_id is null) then
        v_fam_phone := null;
      end if;
    end if;
    insert into public.family_members (society_id, membership_id, full_name, phone, relation, is_resident)
    values (v_soc, v_mem_id, trim(v_fam->>'name'), v_fam_phone,
            nullif(trim(v_fam->>'relation'), ''), coalesce((v_fam->>'is_resident')::boolean, true));
  end loop;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'member.joined', 'society_memberships', v_mem_id,
          jsonb_build_object('flat_id', p_flat_id, 'status', v_status,
            'authority', v_authority is not null,
            'family_count', jsonb_array_length(p_family)));

  return jsonb_build_object('society_id', v_soc, 'status', v_status);
end;
$$;
revoke all on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb) from public, anon;
grant execute on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb) to authenticated;

create or replace function public.tenant_owner_decide(p_tenant_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_uid    uuid := auth.uid();
  v_row    public.flat_tenants;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_approve is null then raise exception 'INVALID_DECISION'; end if;
  select * into v_row from public.flat_tenants where id = p_tenant_id for update;
  if v_row.id is null or not app_private.is_flat_owner(v_row.flat_id, v_uid) then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  -- (090) the registrant never decides their own tenancy, even if they also own the flat.
  if v_row.user_id = v_uid then raise exception 'CANNOT_DECIDE_OWN_REQUEST'; end if;
  if v_row.status <> 'registered' then raise exception 'INVALID_TENANT_STATE'; end if;

  if p_approve then
    update public.flat_tenants
       set status = 'owner_approved', owner_approved_by = v_uid, owner_approved_at = now(), updated_at = now()
     where id = p_tenant_id
    returning * into v_row;
  else
    if char_length(coalesce(v_reason, '')) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;
    update public.flat_tenants
       set status = 'rejected', rejected_by = v_uid, rejected_at = now(), rejected_reason = v_reason,
           rejected_stage = 'owner', updated_at = now()
     where id = p_tenant_id
    returning * into v_row;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'tenant.owner_decided', 'flat_tenants', p_tenant_id,
          jsonb_build_object('approved', p_approve));

  return app_private.tenant_json(v_row, false);
end;
$$;
revoke all on function public.tenant_owner_decide(uuid, boolean, text) from public, anon;
grant execute on function public.tenant_owner_decide(uuid, boolean, text) to authenticated;

create or replace function public.onboard_structure_for_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_uid uuid := auth.uid();
  v_row public.society_codes;
  v_soc uuid;
  v_phone text := app_private.caller_phone10();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_code_attempts_ok(v_uid);

  select * into v_row from public.society_codes
   where code = upper(trim(coalesce(p_code, ''))) and revoked_at is null;
  if not found then
    perform app_private.record_code_failure(v_uid, 'INVALID_CODE');
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  -- Same exception as onboard_flats_for_code: a flat-less authority of the
  -- society may still pick their own flat while the code is paused.
  if v_row.paused_at is not null and not exists (
       select 1 from public.society_memberships m
        where m.society_id = v_row.society_id and m.user_id = v_uid
          and m.status = 'active' and m.flat_id is null
          and m.role in ('secretary', 'co_secretary')) then
    perform app_private.record_code_failure(v_uid, 'CODE_PAUSED');
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select s.name from public.societies s where s.id = v_soc),
    'wings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'code', w.code,
        'floors', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', fl.id, 'number', fl.number, 'name', fl.name
          ) order by fl.number), '[]'::jsonb)
          from public.floors fl where fl.wing_id = w.id
        ),
        'flats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id,
            'number', f.number,
            'floor_id', f.floor_id,
            'status', app_private.flat_effective_status(f.id, f.status),
            -- (090) same rule onboard_resident applies
            'taken', app_private.flat_held_by_other(f.id, v_uid, v_phone)
          ) order by f.number), '[]'::jsonb)
          from public.flats f where f.wing_id = w.id
        )
      ) order by w.sort_order, w.name), '[]'::jsonb)
      from public.wings w where w.society_id = v_soc
    )
  );
end;
$$;
revoke all on function public.onboard_structure_for_code(text) from public, anon;
grant execute on function public.onboard_structure_for_code(text) to authenticated;
