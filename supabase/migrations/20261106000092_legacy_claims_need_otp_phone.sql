-- ============================================================================
-- Migration 092: the older claim RPCs trust only an OTP-verified phone.
--
-- claim_authority_for_society (062) and every new RPC read the caller's number
-- through app_private.caller_phone10(), which ignores a phone that was never
-- OTP-verified. Three older RPCs read auth.users.phone directly, so a session
-- whose phone was set but never confirmed could:
--   claim_society_authority  -> become secretary of the society on that number
--   onboard_resident         -> be matched as that society's authority
--   claim_family_membership  -> take a family pre-registration on that number
-- The current auth config gives no such session to a client (SMS confirmations
-- are on, and a phone change waits for its OTP), so this is defence in depth:
-- a later config change must not turn an Authority Number into a password.
-- Bodies are unchanged apart from the marked (092) lines.
-- ============================================================================

create or replace function public.claim_society_authority()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_auth  public.society_authorities;
  v_has_flat boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  -- (092) OTP-verified number only: an unconfirmed phone on auth.users proves nothing.
  select phone into v_phone from auth.users where id = v_uid and phone_confirmed_at is not null;
  if v_phone is null then raise exception 'NO_PHONE'; end if;
  v_phone := right(regexp_replace(v_phone, '\D', '', 'g'), 10);

  select * into v_auth
  from public.society_authorities
  where phone = v_phone and (user_id is null or user_id = v_uid)
  order by (user_id = v_uid) desc nulls last, created_at
  limit 1;
  if v_auth.id is null then raise exception 'NOT_AN_AUTHORITY'; end if;

  if v_auth.user_id is null then
    update public.society_authorities set user_id = v_uid, claimed_at = now() where id = v_auth.id;
  end if;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, v_auth.full_name, '+' || (select phone from auth.users where id = v_uid))
  on conflict (user_id) do update
    set full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name);

  if exists (select 1 from public.society_memberships
              where society_id = v_auth.society_id and user_id = v_uid and status = 'active') then
    update public.society_memberships set role = 'secretary'
     where society_id = v_auth.society_id and user_id = v_uid and status = 'active';
  else
    insert into public.society_memberships
      (society_id, user_id, flat_id, role, residency, household, status, joined_at)
    values (v_auth.society_id, v_uid, null, 'secretary', 'owner', 'family', 'active', now());
  end if;

  select exists (select 1 from public.society_memberships
                  where society_id = v_auth.society_id and user_id = v_uid
                    and status = 'active' and flat_id is not null)
    into v_has_flat;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_auth.society_id, v_uid, 'authority.claimed', 'society_authorities', v_auth.id, '{}'::jsonb);

  return jsonb_build_object(
    'society_id', v_auth.society_id,
    'needs_setup', not exists (select 1 from public.flats where society_id = v_auth.society_id),
    'needs_flat', not v_has_flat);
end; $$;

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

  -- (092) OTP-verified number only, so an authority row is never matched on an
  -- unconfirmed phone.
  select '+' || phone into v_phone from auth.users where id = v_uid and phone_confirmed_at is not null;

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

create or replace function public.claim_family_membership()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_uid     uuid := auth.uid();
  v_phone   text;
  v_fam     public.family_members;
  v_primary public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  -- (092) OTP-verified number only: a family pre-registration is claimed by
  -- proving possession of that number.
  select '+' || phone into v_phone from auth.users where id = v_uid and phone_confirmed_at is not null;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  select sf.* into v_fam
  from public.family_members sf
  where sf.claimed_user_id = v_uid
  limit 1;
  if v_fam.id is not null then
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  -- (054) phone10 is the indexed generated column added by migration 055
  -- (right(digits(phone),10)); plpgsql resolves it at call time, after 055.
  select * into v_fam from public.family_members
   where claimed_user_id is null
     and phone10 = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
   order by id
   limit 1;
  if v_fam.id is null then raise exception 'NOT_A_FAMILY_MEMBER'; end if;

  if exists (select 1 from public.society_memberships
              where user_id = v_uid and society_id = v_fam.society_id) then
    update public.family_members set claimed_user_id = v_uid where id = v_fam.id;
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  select * into v_primary from public.society_memberships where id = v_fam.membership_id;
  -- (054) the primary membership must exist, be in the SAME society as the
  -- family row, be ACTIVE and have a flat. Previously a row pointing at any
  -- membership (another society, a removed or pending member) was honoured.
  if v_primary.id is null or v_primary.society_id is distinct from v_fam.society_id then
    raise exception 'PRIMARY_MEMBERSHIP_GONE';
  end if;
  if v_primary.status <> 'active' then raise exception 'PRIMARY_NOT_ACTIVE'; end if;
  if v_primary.flat_id is null then raise exception 'PRIMARY_HAS_NO_FLAT'; end if;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, coalesce(v_fam.full_name, 'Family member'), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, status, joined_at)
  values (v_fam.society_id, v_uid, v_primary.flat_id, 'member',
          v_primary.residency, v_primary.household, 'active', now());

  update public.family_members set claimed_user_id = v_uid where id = v_fam.id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_fam.society_id, v_uid, 'family.claimed', 'family_members', v_fam.id,
          jsonb_build_object('flat_id', v_primary.flat_id, 'relation', v_fam.relation));

  return jsonb_build_object('society_id', v_fam.society_id, 'already_member', false);
end;
$$;
revoke all on function public.claim_society_authority() from public, anon;
grant execute on function public.claim_society_authority() to authenticated;
revoke all on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb) from public, anon;
grant execute on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb) to authenticated;
revoke all on function public.claim_family_membership() from public, anon;
grant execute on function public.claim_family_membership() to authenticated;
