-- ============================================================================
-- Society Authorities — replaces the single "chairman" name/phone
-- ----------------------------------------------------------------------------
-- A society now has a LIST of authorities (name + 10-digit mobile each), entered
-- by platform staff at creation and extendable later by staff or by any
-- onboarded authority. All authorities are equal for now: each gets the
-- existing top membership role ('secretary'), so every current permission check
-- keeps working unchanged.
--
-- One person = one membership. The Auth Hook issues a single role from the most
-- recent membership, so an authority is never "a resident row + an authority
-- row". Instead:
--   * first sign-in  -> claim_society_authority() links the authority and gives
--     them a flat-less 'secretary' membership (so they can set up wings/flats);
--   * onboard_resident() then attaches their chosen flat to THAT membership;
--   * an existing resident who is added as an authority has their membership
--     upgraded in place.
--
-- societies.secretary_name/secretary_phone are kept (set to the first authority)
-- only for older read paths such as the grievance-officer fallback.
-- ============================================================================

create table if not exists public.society_authorities (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  full_name   text not null check (char_length(trim(full_name)) between 2 and 80),
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  user_id     uuid references auth.users(id) on delete set null,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  unique (society_id, phone)
);
create index if not exists society_authorities_phone_idx on public.society_authorities (phone);
create index if not exists society_authorities_user_idx on public.society_authorities (user_id);

alter table public.society_authorities enable row level security;

-- Authorities of the society read the list; platform staff read everything.
-- Writes go only through the SECURITY DEFINER functions below.
drop policy if exists society_authorities_read on public.society_authorities;
create policy society_authorities_read on public.society_authorities
  for select to authenticated
  using (
    (society_id = public.current_society_id()
      and public.current_membership_role() in ('secretary', 'co_secretary'))
    or public.is_platform_admin_or_sales()
  );
revoke insert, update, delete on public.society_authorities from anon, authenticated;
grant select on public.society_authorities to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: each existing society's chairman becomes its first authority, and
-- is marked claimed when a secretary membership already exists.
-- ---------------------------------------------------------------------------
insert into public.society_authorities (society_id, full_name, phone, user_id, claimed_at)
select s.id,
       coalesce(nullif(trim(s.secretary_name), ''), nullif(trim(p.full_name), ''), 'Authority'),
       right(regexp_replace(s.secretary_phone, '\D', '', 'g'), 10),
       m.user_id,
       case when m.user_id is not null then now() end
from public.societies s
left join lateral (
  select sm.user_id from public.society_memberships sm
  where sm.society_id = s.id and sm.role = 'secretary' and sm.status = 'active'
  order by sm.joined_at limit 1
) m on true
left join public.profiles p on p.user_id = m.user_id
where s.secretary_phone is not null
  and right(regexp_replace(s.secretary_phone, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
on conflict (society_id, phone) do nothing;

-- ---------------------------------------------------------------------------
-- Internal: add one authority. If a user with that phone is already an active
-- member of the society, upgrade their membership in place and link them.
-- Not granted to clients — called by the two gated wrappers below.
-- ---------------------------------------------------------------------------
create or replace function public._add_society_authority(
  p_society_id uuid, p_name text, p_phone text, p_actor uuid
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_id    uuid;
  v_user  uuid;
begin
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then
    raise exception 'INVALID_NAME';
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if not exists (select 1 from public.societies where id = p_society_id) then
    raise exception 'SOCIETY_NOT_FOUND';
  end if;
  if exists (select 1 from public.society_authorities
              where society_id = p_society_id and phone = v_phone) then
    raise exception 'ALREADY_AUTHORITY';
  end if;

  insert into public.society_authorities (society_id, full_name, phone, added_by)
  values (p_society_id, trim(p_name), v_phone, p_actor)
  returning id into v_id;

  -- Already a member here? Upgrade that membership now.
  select m.user_id into v_user
  from public.society_memberships m
  join auth.users u on u.id = m.user_id
  where m.society_id = p_society_id and m.status = 'active'
    and right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = v_phone
  limit 1;
  if v_user is not null then
    update public.society_memberships
       set role = 'secretary'
     where society_id = p_society_id and user_id = v_user and status = 'active';
    update public.society_authorities set user_id = v_user, claimed_at = now() where id = v_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, p_actor, 'authority.added', 'society_authorities', v_id,
          jsonb_build_object('name', trim(p_name), 'phone', v_phone, 'linked', v_user is not null));

  return jsonb_build_object('id', v_id, 'linked', v_user is not null);
end; $$;
revoke all on function public._add_society_authority(uuid, text, text, uuid) from public, anon, authenticated;

-- An onboarded authority (secretary / co-secretary) adds another authority.
create or replace function public.add_society_authority(p_society_id uuid, p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid and status = 'active'
      and role in ('secretary', 'co_secretary')
  ) then
    raise exception 'NOT_AUTHORITY';
  end if;
  return public._add_society_authority(p_society_id, p_name, p_phone, v_uid);
end; $$;
grant execute on function public.add_society_authority(uuid, text, text) to authenticated;

-- Platform staff add an authority from the admin console.
create or replace function public.admin_add_society_authority(p_society_id uuid, p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return public._add_society_authority(p_society_id, p_name, p_phone, auth.uid());
end; $$;
grant execute on function public.admin_add_society_authority(uuid, text, text) to authenticated;

-- Platform staff fix an authority's details. Once the authority has signed in,
-- the phone is locked (their account is tied to it); the name stays editable.
create or replace function public.admin_update_society_authority(p_authority_id uuid, p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_row   public.society_authorities;
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;

  select * into v_row from public.society_authorities where id = p_authority_id;
  if v_row.id is null then raise exception 'AUTHORITY_NOT_FOUND'; end if;

  if v_row.user_id is not null then
    if v_phone <> v_row.phone then raise exception 'AUTHORITY_ALREADY_CLAIMED'; end if;
    update public.society_authorities set full_name = trim(p_name) where id = p_authority_id;
    update public.profiles set full_name = trim(p_name) where user_id = v_row.user_id;
  else
    if v_phone <> v_row.phone and exists (
      select 1 from public.society_authorities
      where society_id = v_row.society_id and phone = v_phone and id <> p_authority_id
    ) then
      raise exception 'ALREADY_AUTHORITY';
    end if;
    update public.society_authorities set full_name = trim(p_name), phone = v_phone
     where id = p_authority_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, auth.uid(), 'authority.updated', 'society_authorities', p_authority_id,
          jsonb_build_object('name', trim(p_name), 'phone', v_phone, 'was_claimed', v_row.user_id is not null));

  return jsonb_build_object('claimed', v_row.user_id is not null);
end; $$;
grant execute on function public.admin_update_society_authority(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- An authority's sign-in. Links the authority row and ensures ONE membership
-- with authority powers: an existing active membership in that society is
-- upgraded; otherwise a flat-less 'secretary' membership is created (the flat
-- is attached later by onboard_resident). Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.claim_society_authority()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_auth  public.society_authorities;
  v_has_flat boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select phone into v_phone from auth.users where id = v_uid;
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
grant execute on function public.claim_society_authority() to authenticated;

-- ---------------------------------------------------------------------------
-- Society creation with an authorities list (replaces the chairman params).
-- p_authorities: [{ "name": "...", "phone": "9876543210" }, ...] — at least one.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_society(text, text, text, text, text, text, text, text, uuid);

create or replace function public.admin_create_society(
  p_name text, p_address_line text, p_city text, p_state text, p_pincode text,
  p_landmark text, p_authorities jsonb, p_request_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_admin_id uuid := auth.uid(); v_society_id uuid; v_code text; v_full text;
  v_item jsonb; v_phone text; v_seen text[] := '{}'; v_first_name text; v_first_phone text;
begin
  if v_admin_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;

  if p_name is null or length(trim(p_name)) < 3 or length(p_name) > 100 then raise exception 'INVALID_NAME'; end if;
  if p_address_line is null or length(trim(p_address_line)) < 5 then raise exception 'INVALID_ADDRESS'; end if;
  if p_city is null or length(trim(p_city)) < 2 then raise exception 'INVALID_CITY'; end if;
  if p_state is null or length(trim(p_state)) < 2 then raise exception 'INVALID_STATE'; end if;
  if p_pincode is null or p_pincode !~ '^[1-9][0-9]{5}$' then raise exception 'INVALID_PINCODE'; end if;

  if p_authorities is null or jsonb_typeof(p_authorities) <> 'array'
     or jsonb_array_length(p_authorities) = 0 then
    raise exception 'AUTHORITY_REQUIRED';
  end if;
  for v_item in select * from jsonb_array_elements(p_authorities) loop
    if coalesce(char_length(trim(v_item->>'name')), 0) not between 2 and 80 then
      raise exception 'INVALID_AUTHORITY_NAME';
    end if;
    v_phone := right(regexp_replace(coalesce(v_item->>'phone', ''), '\D', '', 'g'), 10);
    if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_AUTHORITY_PHONE'; end if;
    if v_phone = any (v_seen) then raise exception 'DUPLICATE_AUTHORITY_PHONE'; end if;
    v_seen := v_seen || v_phone;
    if v_first_phone is null then
      v_first_phone := v_phone; v_first_name := trim(v_item->>'name');
    end if;
  end loop;

  v_full := concat_ws(', ', trim(p_address_line),
    nullif(trim(coalesce(p_landmark,'')),''), trim(p_city), trim(p_state), p_pincode);

  insert into public.societies
    (name, address, address_line, city, landmark, state, pincode, secretary_name, secretary_phone)
  values (trim(p_name), v_full, trim(p_address_line), trim(p_city),
          nullif(trim(coalesce(p_landmark,'')),''), trim(p_state), p_pincode, v_first_name, v_first_phone)
  returning id into v_society_id;

  for v_item in select * from jsonb_array_elements(p_authorities) loop
    insert into public.society_authorities (society_id, full_name, phone, added_by)
    values (v_society_id, trim(v_item->>'name'),
            right(regexp_replace(v_item->>'phone', '\D', '', 'g'), 10), v_admin_id);
  end loop;

  v_code := public.generate_society_code();
  insert into public.society_codes (code, society_id) values (v_code, v_society_id);

  if p_request_id is not null then
    update public.society_enrollment_requests
       set status='approved', society_id=v_society_id, handled_by=v_admin_id, updated_at=now()
     where id = p_request_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_admin_id, 'society.created_by_admin', 'societies', v_society_id,
          jsonb_build_object('name', trim(p_name), 'city', trim(p_city), 'state', trim(p_state),
            'pincode', p_pincode, 'authorities', p_authorities, 'request_id', p_request_id));

  return jsonb_build_object('society_id', v_society_id, 'code', v_code,
                            'authority_count', jsonb_array_length(p_authorities));
end; $$;
grant execute on function public.admin_create_society(text,text,text,text,text,text,jsonb,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff society detail: add the authorities list (existing keys unchanged).
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_authorities(p_society_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'full_name', a.full_name, 'phone', a.phone,
      'claimed', a.user_id is not null, 'claimed_at', a.claimed_at, 'created_at', a.created_at
    ) order by a.created_at), '[]'::jsonb)
    from public.society_authorities a where a.society_id = p_society_id
  );
end; $$;
grant execute on function public.admin_society_authorities(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resident onboarding, authority-aware.
--   * An authority's flat-less membership gets the chosen flat attached (same
--     row, role kept, stays active).
--   * A joiner whose phone is an authority of that society (added before they
--     ever signed in as one) joins with the authority role.
-- Everything else is unchanged from migration 031.
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
  v_authority uuid;
  v_role      public.membership_role := 'member';
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

  -- Is this person an authority of this society (claimed by them, or unclaimed on their phone)?
  select id into v_authority
  from public.society_authorities
  where society_id = v_soc
    and (user_id = v_uid
         or (user_id is null
             and phone = right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10)))
  limit 1;
  if v_authority is not null then
    v_role := 'secretary';
    update public.society_authorities
       set user_id = v_uid, claimed_at = coalesce(claimed_at, now())
     where id = v_authority;
  end if;

  -- First on the flat -> active; a later joiner on a taken flat -> pending_review.
  -- Authorities stay active (their powers must not wait on a review).
  select exists (select 1 from public.society_memberships
                  where flat_id = p_flat_id and society_id = v_soc and status = 'active'
                    and user_id <> v_uid)
    into v_taken;
  v_status := case when v_taken and v_authority is null then 'pending_review' else 'active' end;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, trim(p_full_name), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  -- An authority's flat-less membership: attach the flat to that same row.
  select id into v_mem_id
  from public.society_memberships
  where society_id = v_soc and user_id = v_uid and flat_id is null and status = 'active'
  limit 1;

  if v_mem_id is not null then
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
      set status = excluded.status, residency = excluded.residency,
          emergency_contact = excluded.emergency_contact, joined_at = now(),
          role = case when excluded.role = 'secretary' then excluded.role
                      else public.society_memberships.role end
    returning id into v_mem_id;
  end if;

  -- Pre-register family members (unchanged from 031).
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

grant execute on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb)
  to authenticated;
