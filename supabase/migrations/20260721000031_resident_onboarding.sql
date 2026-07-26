-- ============================================================================
-- Resident onboarding: pick a flat, join, pre-register family — in one call
-- ----------------------------------------------------------------------------
-- The new-resident path after OTP: enter society code -> pick their flat from
-- the chairman's list -> name + owner/tenant + alt mobile -> list family -> PIN.
--
-- Two RPCs:
--   onboard_flats_for_code — a joiner has no membership yet, so flats RLS
--     (society_id = current_society_id()) hides everything. This returns the
--     pickable flats for a valid code, and marks which are already taken.
--   onboard_resident — validates + redeems + names + pre-registers family, all
--     atomically. Reuses the same status rule as redeem_society_code: the first
--     person on a flat is active, a second is pending_review (committee checks).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Flats to pick from, given a live code. SECURITY DEFINER so a not-yet-member
-- can read them; only ever exposes flat number + wing + taken-flag, nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.onboard_flats_for_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_soc uuid; v_row public.society_codes;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_row from public.society_codes
   where code = upper(p_code) and revoked_at is null;
  if not found then return jsonb_build_object('error', 'INVALID_CODE'); end if;
  if v_row.paused_at is not null then return jsonb_build_object('error', 'CODE_PAUSED'); end if;
  v_soc := v_row.society_id;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select name from public.societies where id = v_soc),
    'wings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name,
        'flats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'number', f.number,
            'taken', exists (select 1 from public.society_memberships m
                              where m.flat_id = f.id and m.status = 'active')
          ) order by f.number), '[]'::jsonb)
          from public.flats f where f.wing_id = w.id
        )
      ) order by w.name), '[]'::jsonb)
      from public.wings w where w.society_id = v_soc
    )
  );
end;
$$;

grant execute on function public.onboard_flats_for_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The onboarding commit. p_family is an array of
--   { name, relation, phone (optional), is_resident }
-- ---------------------------------------------------------------------------
create or replace function public.onboard_resident(
  p_code       text,
  p_flat_id    uuid,
  p_full_name  text,
  p_residency  public.residency_kind,
  p_alt_phone  text,
  p_family     jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 then raise exception 'INVALID_NAME'; end if;

  select * into v_row from public.society_codes where code = upper(p_code) and revoked_at is null;
  if not found then return jsonb_build_object('error', 'INVALID_CODE'); end if;
  if v_row.paused_at is not null then return jsonb_build_object('error', 'CODE_PAUSED'); end if;
  v_soc := v_row.society_id;

  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_soc) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;

  select '+' || phone into v_phone from auth.users where id = v_uid;

  -- First on the flat -> active; a later joiner on a taken flat -> pending_review.
  select exists (select 1 from public.society_memberships
                  where flat_id = p_flat_id and society_id = v_soc and status = 'active')
    into v_taken;
  v_status := case when v_taken then 'pending_review' else 'active' end;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, trim(p_full_name), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, emergency_contact, status)
  values (v_soc, v_uid, p_flat_id, 'member', p_residency, 'family',
          nullif(trim(coalesce(p_alt_phone,'')), ''), v_status)
  on conflict (society_id, user_id, flat_id) do update
    set status = excluded.status, residency = excluded.residency,
        emergency_contact = excluded.emergency_contact, joined_at = now()
  returning id into v_mem_id;

  -- Pre-register family members. Their phones become a login path (they claim
  -- with OTP + PIN later — see claim_family_membership). Skip a family phone
  -- that already belongs to a real user or another unclaimed entry, so onboarding
  -- never fails on a duplicate — just don't create a clashing row.
  for v_fam in select * from jsonb_array_elements(p_family)
  loop
    if coalesce(trim(v_fam->>'name'), '') = '' then continue; end if;
    v_fam_phone := nullif(regexp_replace(coalesce(v_fam->>'phone',''), '\D', '', 'g'), '');
    if v_fam_phone is not null then
      v_fam_phone := '+91' || right(v_fam_phone, 10);
      if exists (select 1 from public.family_members
                  where society_id = v_soc and phone = v_fam_phone and claimed_user_id is null) then
        v_fam_phone := null; -- already pending; don't duplicate, keep the name only
      end if;
    end if;
    insert into public.family_members (society_id, membership_id, full_name, phone, relation, is_resident)
    values (v_soc, v_mem_id, trim(v_fam->>'name'), v_fam_phone,
            nullif(trim(v_fam->>'relation'), ''), coalesce((v_fam->>'is_resident')::boolean, true));
  end loop;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'member.joined', 'society_memberships', v_mem_id,
          jsonb_build_object('flat_id', p_flat_id, 'status', v_status,
            'family_count', jsonb_array_length(p_family)));

  return jsonb_build_object('society_id', v_soc, 'status', v_status);
end;
$$;

grant execute on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb)
  to authenticated;
