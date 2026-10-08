-- ============================================================================
-- Society service status: platform admins can STOP SERVICE (paused) or BLOCK a
-- society, with a reason the society sees after logging in. Both are
-- reversible and keep all data.
--
--   active  — normal.
--   paused  — "Service paused": members can log in but only see the reason.
--   blocked — "Society blocked": same, and the join code stops working (no new
--             residents can join or onboard).
--
-- Enforcement is at the database, not just the UI: current_society_id() (used
-- by every tenant RLS policy) and current_guard_society_id() return NULL for a
-- society that is not active, so all RLS-scoped reads and writes stop at once.
-- They become SECURITY DEFINER so they can read societies.service_status
-- without recursing into the societies RLS policy that itself calls them.
-- ============================================================================

alter table public.societies
  add column if not exists service_status text not null default 'active'
    check (service_status in ('active', 'paused', 'blocked')),
  add column if not exists service_reason text
    check (service_reason is null or char_length(service_reason) <= 500),
  add column if not exists service_changed_at timestamptz,
  add column if not exists service_changed_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Tenant helpers: NULL when the society is not active.
-- ---------------------------------------------------------------------------
create or replace function public.current_society_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.societies s
  where s.id = nullif(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'society_id',
          '')::uuid
    and s.service_status = 'active'
$$;
comment on function public.current_society_id() is
  'Society id from the JWT app_metadata, or NULL when absent or when that society''s service is paused/blocked. Used by all tenant RLS policies.';
grant execute on function public.current_society_id() to authenticated, anon, service_role;

create or replace function public.current_guard_society_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.societies s
  where s.id = nullif(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'guard_society_id',
          '')::uuid
    and s.service_status = 'active'
$$;
grant execute on function public.current_guard_society_id() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- What the signed-in user's society status is (for the "paused/blocked"
-- screen). Works even when RLS hides the society. Resident membership first,
-- then guard.
-- ---------------------------------------------------------------------------
create or replace function public.my_society_service_status()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid(); v_soc uuid;
begin
  if v_uid is null then return null; end if;
  select m.society_id into v_soc
  from public.society_memberships m
  where m.user_id = v_uid and m.status in ('active', 'pending_review')
  order by m.joined_at desc limit 1;
  if v_soc is null then
    select g.society_id into v_soc
    from public.society_guards g
    where g.user_id = v_uid and g.status = 'active' limit 1;
  end if;
  if v_soc is null then return null; end if;
  return (select jsonb_build_object(
            'society_id', s.id, 'society_name', s.name,
            'status', s.service_status, 'reason', s.service_reason,
            'changed_at', s.service_changed_at)
          from public.societies s where s.id = v_soc);
end; $$;
grant execute on function public.my_society_service_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: change a society's service status. A reason is required to pause or
-- block (the society reads it); resuming clears it.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_society_service(
  p_society_id uuid, p_status text, p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_prev text; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if p_status not in ('active', 'paused', 'blocked') then raise exception 'INVALID_STATUS'; end if;
  if p_status <> 'active' and (v_reason is null or char_length(v_reason) < 5) then
    raise exception 'REASON_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then raise exception 'REASON_TOO_LONG'; end if;

  select service_status into v_prev from public.societies where id = p_society_id for update;
  if v_prev is null then raise exception 'SOCIETY_NOT_FOUND'; end if;

  update public.societies
     set service_status = p_status,
         service_reason = case when p_status = 'active' then null else v_reason end,
         service_changed_at = now(),
         service_changed_by = auth.uid()
   where id = p_society_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, auth.uid(),
          case p_status when 'paused' then 'society.service_paused'
                        when 'blocked' then 'society.service_blocked'
                        else 'society.service_resumed' end,
          'societies', p_society_id,
          jsonb_build_object('from', v_prev, 'to', p_status, 'reason', v_reason));

  return jsonb_build_object('status', p_status, 'previous', v_prev);
end; $$;
grant execute on function public.admin_set_society_service(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Blocked societies: the join code stops working. These run before a joiner
-- has a membership, so they are checked explicitly here (RLS doesn't apply).
-- Everything else is unchanged from migration 031 / 048.
-- ---------------------------------------------------------------------------
create or replace function public.society_accepts_joins(p_society_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select service_status <> 'blocked' from public.societies where id = p_society_id), false);
$$;
revoke all on function public.society_accepts_joins(uuid) from public, anon;
grant execute on function public.society_accepts_joins(uuid) to authenticated;

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
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

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

-- onboard_resident (048 version) with the blocked-society check added.
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
  if v_authority is not null then
    v_role := 'secretary';
    update public.society_authorities
       set user_id = v_uid, claimed_at = coalesce(claimed_at, now())
     where id = v_authority;
  end if;

  select exists (select 1 from public.society_memberships
                  where flat_id = p_flat_id and society_id = v_soc and status = 'active'
                    and user_id <> v_uid)
    into v_taken;
  v_status := case when v_taken and v_authority is null then 'pending_review' else 'active' end;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, trim(p_full_name), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

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

-- ---------------------------------------------------------------------------
-- Staff views: include the service status. admin_list_societies changes its
-- return shape, so it is dropped and recreated.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_societies();
create or replace function public.admin_list_societies()
returns table (id uuid, name text, address text, city text, state text, pincode text,
  code text, secretary_phone text, member_count bigint, pending_count bigint, created_at timestamptz,
  service_status text, service_reason text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return query
  select s.id, s.name, s.address, s.city, s.state, s.pincode, c.code, s.secretary_phone,
    (select count(*) from public.society_memberships m where m.society_id=s.id and m.status='active'),
    (select count(*) from public.society_memberships m where m.society_id=s.id and m.status='pending_review'),
    s.created_at, s.service_status, s.service_reason
  from public.societies s
  left join public.society_codes c on c.society_id=s.id and c.revoked_at is null
  order by s.created_at desc;
end; $$;
grant execute on function public.admin_list_societies() to authenticated;

create or replace function public.admin_society_service(p_society_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return (select jsonb_build_object(
            'status', s.service_status, 'reason', s.service_reason,
            'changed_at', s.service_changed_at,
            'changed_by_name', (select p.full_name from public.profiles p where p.user_id = s.service_changed_by),
            'can_change', public.is_platform_admin())
          from public.societies s where s.id = p_society_id);
end; $$;
grant execute on function public.admin_society_service(uuid) to authenticated;
