-- =====================================================================
-- Phase 3: Society Setup & Member Onboarding
-- Adds: 3 tables (code_redemptions, audit_log, amenities)
--       3 columns (societies.secretary_phone, societies.co_secretary_phone,
--                  society_codes.paused_at)
--       12 SECURITY DEFINER functions (1 helper + 11 RPCs):
--         generate_society_code (helper)
--         create_society_with_secretary, finalize_society_setup,
--         bootstrap_society_structure, list_society_structure,
--         rotate_society_code, resume_society_code,
--         redeem_society_code, validate_society_code,
--         reveal_phone, remove_member, transfer_secretary_role
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------

alter table public.societies
  add column if not exists secretary_phone    text,
  add column if not exists co_secretary_phone text;

alter table public.society_codes
  add column if not exists paused_at timestamptz;

create table if not exists public.code_redemptions (
  id          bigserial primary key,
  code        text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  society_id  uuid not null references public.societies(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  succeeded   boolean not null default true
);
create index if not exists idx_code_redemptions_code_time
  on public.code_redemptions (code, redeemed_at desc);
create index if not exists idx_code_redemptions_society
  on public.code_redemptions (society_id, redeemed_at desc);
-- No RLS; written only by SECURITY DEFINER RPCs
revoke all on public.code_redemptions from anon, authenticated;

create table if not exists public.audit_log (
  id           bigserial primary key,
  society_id   uuid,
  actor_id     uuid,
  action       text not null,
  target_table text,
  target_id    uuid,
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_log_society_action
  on public.audit_log (society_id, action, created_at desc);
create index if not exists idx_audit_log_target
  on public.audit_log (target_table, target_id);

alter table public.audit_log enable row level security;
drop policy if exists "secretary_select_audit_log" on public.audit_log;
create policy "secretary_select_audit_log"
  on public.audit_log for select to authenticated
  using (
    society_id = public.current_society_id()
    and public.current_membership_role() in ('secretary', 'co_secretary')
  );
revoke insert, update, delete on public.audit_log from authenticated, anon;

create table if not exists public.amenities (
  id         uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  name       text not null,
  is_custom  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_amenities_society on public.amenities (society_id);
alter table public.amenities enable row level security;
drop policy if exists "tenant_all_amenities" on public.amenities;
create policy "tenant_all_amenities"
  on public.amenities for all to authenticated
  using (society_id = public.current_society_id())
  with check (society_id = public.current_society_id());

-- ---------------------------------------------------------------------
-- 2. Helper: generate_society_code
-- ---------------------------------------------------------------------

create or replace function public.generate_society_code()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  charset   text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0/O/I/1/L
  candidate text;
  part1     text;
  part2     text;
  i         int;
  attempts  int := 0;
begin
  loop
    part1 := '';
    part2 := '';
    for i in 1..4 loop
      part1 := part1 || substr(charset, floor(random() * length(charset))::int + 1, 1);
      part2 := part2 || substr(charset, floor(random() * length(charset))::int + 1, 1);
    end loop;
    candidate := part1 || '-' || part2;
    if not exists (
      select 1 from public.society_codes
      where code = candidate
        and revoked_at is null
    ) then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'Unable to generate unique society code after 20 attempts';
    end if;
  end loop;
end;
$$;
revoke all on function public.generate_society_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. RPC: create_society_with_secretary
--    Step 1 of wizard. Creates society + code. Does NOT create membership
--    (flat doesn't exist yet — see finalize_society_setup).
-- ---------------------------------------------------------------------

create or replace function public.create_society_with_secretary(
  p_name               text,
  p_address            text,
  p_co_secretary_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_society_id      uuid;
  v_code            text;
  v_user_id         uuid := auth.uid();
  v_caller_phone    text;
  v_co_sec_user_id  uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Input validation
  if p_name is null or length(trim(p_name)) < 3 or length(p_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if p_address is null or length(trim(p_address)) < 10 or length(p_address) > 500 then
    raise exception 'INVALID_ADDRESS';
  end if;
  if p_co_secretary_phone is null or p_co_secretary_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_CO_SEC_PHONE';
  end if;

  select phone into v_caller_phone from public.profiles where user_id = v_user_id;
  if v_caller_phone is not null and v_caller_phone like '%' || p_co_secretary_phone then
    raise exception 'CO_SEC_SAME_AS_SELF';
  end if;

  insert into public.societies (name, address, secretary_phone, co_secretary_phone)
  values (trim(p_name), trim(p_address), v_caller_phone, p_co_secretary_phone)
  returning id into v_society_id;

  v_code := public.generate_society_code();
  insert into public.society_codes (code, society_id)
  values (v_code, v_society_id);

  select user_id into v_co_sec_user_id
  from public.profiles
  where phone like '%' || p_co_secretary_phone
  limit 1;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_user_id, 'society.created', 'societies', v_society_id,
          jsonb_build_object('name', p_name, 'co_sec_phone', p_co_secretary_phone));

  return jsonb_build_object(
    'society_id',         v_society_id,
    'code',               v_code,
    'co_secretary_found', (v_co_sec_user_id is not null)
  );
end;
$$;
grant execute on function public.create_society_with_secretary(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC: finalize_society_setup
--    Step 3+ of wizard. Creates the Secretary's membership row.
--    Caller must be the society creator (verified via audit_log).
-- ---------------------------------------------------------------------

create or replace function public.finalize_society_setup(
  p_society_id uuid,
  p_flat_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id       uuid := auth.uid();
  v_membership_id uuid;
  v_flat_society  uuid;
  v_is_creator    boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Caller must be the creator of this society (recorded in audit_log)
  select exists (
    select 1 from public.audit_log
    where society_id = p_society_id
      and actor_id   = v_user_id
      and action     = 'society.created'
  ) into v_is_creator;
  if not v_is_creator then
    raise exception 'NOT_SOCIETY_CREATOR';
  end if;

  -- Flat must belong to the same society
  select society_id into v_flat_society from public.flats where id = p_flat_id;
  if v_flat_society is null or v_flat_society <> p_society_id then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;

  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, status)
  values
    (p_society_id, v_user_id, p_flat_id, 'secretary', 'owner', 'family', 'active')
  on conflict (society_id, user_id, flat_id) do update
    set role = 'secretary', status = 'active'
  returning id into v_membership_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (p_society_id, v_user_id, 'setup.finalized', 'society_memberships', v_membership_id);

  return jsonb_build_object('membership_id', v_membership_id);
end;
$$;
grant execute on function public.finalize_society_setup(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC: bootstrap_society_structure
--    Wizard Steps 2+3 backend: insert wings + flats BEFORE the Secretary's
--    membership exists. Verifies caller is the society creator via audit_log.
--    Returns inserted ids so the client can pick the Secretary's flat.
-- ---------------------------------------------------------------------

create or replace function public.bootstrap_society_structure(
  p_society_id uuid,
  p_wings      jsonb,   -- array of {name: text}
  p_flats      jsonb    -- array of {wing_name: text, number: text}
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id    uuid := auth.uid();
  v_is_creator boolean;
  v_wing_id    uuid;
  v_name       text;
  v_flat       jsonb;
  v_wing_map   jsonb := '{}'::jsonb;
  v_wings_out  jsonb := '[]'::jsonb;
  v_flats_out  jsonb := '[]'::jsonb;
  v_flat_id    uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select exists (
    select 1 from public.audit_log
    where society_id = p_society_id and actor_id = v_user_id and action = 'society.created'
  ) into v_is_creator;
  if not v_is_creator then raise exception 'NOT_SOCIETY_CREATOR'; end if;

  -- Insert wings
  for v_name in select jsonb_array_elements_text(jsonb_path_query_array(p_wings, '$[*].name'))
  loop
    insert into public.wings (society_id, name) values (p_society_id, v_name)
    returning id into v_wing_id;
    v_wing_map := v_wing_map || jsonb_build_object(v_name, v_wing_id::text);
    v_wings_out := v_wings_out || jsonb_build_array(jsonb_build_object('name', v_name, 'id', v_wing_id));
  end loop;

  -- Insert flats
  for v_flat in select * from jsonb_array_elements(p_flats)
  loop
    v_wing_id := (v_wing_map ->> (v_flat ->> 'wing_name'))::uuid;
    if v_wing_id is null then raise exception 'WING_NOT_FOUND: %', v_flat ->> 'wing_name'; end if;
    insert into public.flats (society_id, wing_id, number)
    values (p_society_id, v_wing_id, v_flat ->> 'number')
    returning id into v_flat_id;
    v_flats_out := v_flats_out || jsonb_build_array(jsonb_build_object(
      'id', v_flat_id, 'wing_name', v_flat ->> 'wing_name', 'number', v_flat ->> 'number'
    ));
  end loop;

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (p_society_id, v_user_id, 'structure.bootstrapped', 'wings',
          jsonb_build_object('wing_count', jsonb_array_length(p_wings), 'flat_count', jsonb_array_length(p_flats)));

  return jsonb_build_object('wings', v_wings_out, 'flats', v_flats_out);
end;
$$;
grant execute on function public.bootstrap_society_structure(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RPC: list_society_structure
--    Pre-membership read: a Member with a valid (non-paused, non-revoked)
--    code can see wings + flats so they can pick their flat in the join form.
--    Gated by code status, not by JWT society_id.
-- ---------------------------------------------------------------------

create or replace function public.list_society_structure(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code_row record;
  v_wings    jsonb;
  v_flats    jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_code_row from public.society_codes
   where code = upper(p_code) and revoked_at is null;
  if not found then return jsonb_build_object('error', 'INVALID_CODE'); end if;
  if v_code_row.paused_at is not null then return jsonb_build_object('error', 'CODE_PAUSED'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
    into v_wings from public.wings where society_id = v_code_row.society_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'wing_id', wing_id, 'number', number) order by wing_id, number), '[]'::jsonb)
    into v_flats from public.flats where society_id = v_code_row.society_id;
  return jsonb_build_object('society_id', v_code_row.society_id, 'wings', v_wings, 'flats', v_flats);
end;
$$;
grant execute on function public.list_society_structure(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC: rotate_society_code
-- ---------------------------------------------------------------------

create or replace function public.rotate_society_code(p_society_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_role    text;
  v_new     text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Caller must be secretary/co_secretary of this society
  select role::text into v_role
  from public.society_memberships
  where user_id = v_user_id and society_id = p_society_id and status = 'active';

  if v_role not in ('secretary', 'co_secretary') then
    raise exception 'INSUFFICIENT_PRIVILEGES';
  end if;

  update public.society_codes
    set revoked_at = now()
    where society_id = p_society_id and revoked_at is null;

  v_new := public.generate_society_code();
  insert into public.society_codes (code, society_id) values (v_new, p_society_id);

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (p_society_id, v_user_id, 'code.rotated', 'society_codes',
          jsonb_build_object('new_code', v_new));

  return jsonb_build_object('code', v_new);
end;
$$;
grant execute on function public.rotate_society_code(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. RPC: resume_society_code (clears paused_at — Secretary action)
-- ---------------------------------------------------------------------

create or replace function public.resume_society_code(p_society_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_role    text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select role::text into v_role
  from public.society_memberships
  where user_id = v_user_id and society_id = p_society_id and status = 'active';
  if v_role not in ('secretary', 'co_secretary') then
    raise exception 'INSUFFICIENT_PRIVILEGES';
  end if;
  update public.society_codes
    set paused_at = null
    where society_id = p_society_id and revoked_at is null;
  insert into public.audit_log (society_id, actor_id, action, target_table)
  values (p_society_id, v_user_id, 'code.resumed', 'society_codes');
  return jsonb_build_object('resumed', true);
end;
$$;
grant execute on function public.resume_society_code(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. RPC: redeem_society_code (Member join)
--    Auto-elevates the membership role to 'co_secretary' when caller's
--    profiles.phone matches societies.co_secretary_phone (RESEARCH Q2 RESOLVED).
-- ---------------------------------------------------------------------

create or replace function public.redeem_society_code(
  p_code      text,
  p_flat_id   uuid,
  p_residency residency_kind,
  p_household household_kind,
  p_emergency text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code_row         record;
  v_user_id          uuid := auth.uid();
  v_society_id       uuid;
  v_membership_id    uuid;
  v_redemption_count int;
  v_flat_claimed     boolean;
  v_status           text;
  v_caller_phone     text;
  v_co_sec_phone     text;
  v_role             membership_role := 'member';
  v_auto_elevated    boolean := false;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_code_row
  from public.society_codes
  where code = upper(p_code) and revoked_at is null;

  if not found then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_code_row.paused_at is not null then
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;

  v_society_id := v_code_row.society_id;

  -- Validate flat belongs to this society
  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_society_id) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;

  -- Rolling-window rate limit (60s)
  select count(*) into v_redemption_count
  from public.code_redemptions
  where code = upper(p_code) and redeemed_at > now() - interval '60 seconds';

  if v_redemption_count >= 5 then
    update public.society_codes set paused_at = now() where code = upper(p_code);
    insert into public.audit_log (society_id, actor_id, action, target_table, payload)
    values (v_society_id, v_user_id, 'code.auto_paused', 'society_codes',
            jsonb_build_object('code', upper(p_code), 'redemption_count', v_redemption_count));
    return jsonb_build_object('error', 'CODE_PAUSED_RATE_LIMIT');
  end if;

  insert into public.code_redemptions (code, user_id, society_id)
  values (upper(p_code), v_user_id, v_society_id);

  select exists (
    select 1 from public.society_memberships
    where flat_id = p_flat_id and society_id = v_society_id and status = 'active'
  ) into v_flat_claimed;

  v_status := case when v_flat_claimed then 'pending_review' else 'active' end;

  -- Co-secretary auto-elevation: if caller's phone matches the society's
  -- co_secretary_phone (set at create_society_with_secretary time), insert with
  -- role='co_secretary' so they get Secretary powers on join. Server-side only —
  -- no client logic, no separate elevation step. RESEARCH Q2 RESOLVED.
  select phone into v_caller_phone from public.profiles where user_id = v_user_id;
  select co_secretary_phone into v_co_sec_phone from public.societies where id = v_society_id;
  if v_caller_phone is not null and v_co_sec_phone is not null
     and (v_caller_phone like '%' || v_co_sec_phone or v_caller_phone = v_co_sec_phone) then
    v_role := 'co_secretary';
    v_auto_elevated := true;
  end if;

  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, emergency_contact, status)
  values
    (v_society_id, v_user_id, p_flat_id, v_role, p_residency, p_household, p_emergency, v_status)
  on conflict (society_id, user_id, flat_id) do update
    set status = excluded.status, joined_at = now(), role = excluded.role
  returning id into v_membership_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_user_id, 'member.joined', 'society_memberships', v_membership_id,
          jsonb_build_object(
            'flat_id', p_flat_id,
            'status', v_status,
            'duplicate', v_flat_claimed,
            'role', v_role,
            'auto_elevated_to_co_secretary', v_auto_elevated
          ));

  return jsonb_build_object(
    'membership_id', v_membership_id,
    'society_id',    v_society_id,
    'status',        v_status,
    'duplicate',     v_flat_claimed,
    'role',          v_role,
    'auto_elevated_to_co_secretary', v_auto_elevated
  );
end;
$$;
grant execute on function public.redeem_society_code(text, uuid, residency_kind, household_kind, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. RPC: validate_society_code (lightweight — for Member preview screen)
-- ---------------------------------------------------------------------

create or replace function public.validate_society_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code_row record;
  v_society  record;
  v_member_count int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_code_row from public.society_codes
   where code = upper(p_code) and revoked_at is null;
  if not found then return jsonb_build_object('error', 'INVALID_CODE'); end if;
  if v_code_row.paused_at is not null then return jsonb_build_object('error', 'CODE_PAUSED'); end if;
  select id, name, address into v_society from public.societies where id = v_code_row.society_id;
  select count(*) into v_member_count from public.society_memberships
   where society_id = v_society.id and status = 'active';
  return jsonb_build_object(
    'society_id',  v_society.id,
    'name',        v_society.name,
    'address',     v_society.address,
    'member_count', v_member_count
  );
end;
$$;
grant execute on function public.validate_society_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. RPC: reveal_phone (per ONBD-06 — logs every reveal)
--    Returns the target's phone for members with status IN ('active',
--    'pending_review'). Secretary needs reveal access on pending_review
--    members so they can contact reviewees from the review queue.
-- ---------------------------------------------------------------------

create or replace function public.reveal_phone(p_target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_phone text;
  v_requester_id uuid := auth.uid();
  v_society_id   uuid := public.current_society_id();
begin
  if v_requester_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  select p.phone into v_phone
  from public.profiles p
  join public.society_memberships sm on sm.user_id = p.user_id
  where p.user_id = p_target_user_id
    and sm.society_id = v_society_id
    and sm.status in ('active', 'pending_review')
  limit 1;

  if v_phone is null then
    raise exception 'NOT_FOUND_OR_CROSS_TENANT';
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_requester_id, 'phone.revealed', 'profiles', p_target_user_id,
          jsonb_build_object('target_user_id', p_target_user_id));

  return v_phone;
end;
$$;
grant execute on function public.reveal_phone(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 12. RPC: remove_member (DPDP erasure)
-- ---------------------------------------------------------------------

create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_membership record;
  v_user_id    uuid;
  v_phone_hash text;
  v_caller_role text := public.current_membership_role();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_caller_role not in ('secretary', 'co_secretary') then
    raise exception 'INSUFFICIENT_PRIVILEGES';
  end if;

  select * into v_membership
  from public.society_memberships
  where id = p_membership_id and society_id = public.current_society_id();

  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  v_user_id := v_membership.user_id;

  update public.society_memberships set status = 'deleted' where id = p_membership_id;

  delete from public.family_members where membership_id = p_membership_id;

  if not exists (
    select 1 from public.society_memberships
    where user_id = v_user_id and status = 'active' and id <> p_membership_id
  ) then
    -- extensions.digest: pgcrypto lives in the 'extensions' schema on Supabase local;
    -- qualify fully so the search_path = public,auth setting doesn't hide it.
    v_phone_hash := 'REDACTED-' || encode(extensions.digest(
      coalesce((select phone from public.profiles where user_id = v_user_id), '')::bytea,
      'sha256'::text
    ), 'hex');
    update public.profiles
      set full_name = '[REDACTED]', phone = v_phone_hash
      where user_id = v_user_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (public.current_society_id(), auth.uid(), 'member.removed',
          'society_memberships', p_membership_id,
          jsonb_build_object('user_id', v_user_id, 'redacted', not exists (
            select 1 from public.society_memberships
            where user_id = v_user_id and status = 'active' and id <> p_membership_id
          )));
end;
$$;
grant execute on function public.remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. RPC: transfer_secretary_role
-- ---------------------------------------------------------------------

create or replace function public.transfer_secretary_role(p_new_secretary_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old_user_id uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
begin
  if v_old_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if public.current_membership_role() <> 'secretary' then
    raise exception 'ONLY_SECRETARY_CAN_TRANSFER';
  end if;

  if not exists (
    select 1 from public.society_memberships
    where user_id = p_new_secretary_user_id
      and society_id = v_society_id
      and status = 'active'
      and role in ('co_secretary', 'board_member')
  ) then
    raise exception 'TARGET_NOT_ELIGIBLE';
  end if;

  update public.society_memberships
    set role = 'member'
    where user_id = v_old_user_id and society_id = v_society_id and status = 'active';

  update public.society_memberships
    set role = 'secretary'
    where user_id = p_new_secretary_user_id and society_id = v_society_id and status = 'active';

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (v_society_id, v_old_user_id, 'role.transferred', 'society_memberships',
          jsonb_build_object('from', v_old_user_id, 'to', p_new_secretary_user_id));
end;
$$;
grant execute on function public.transfer_secretary_role(uuid) to authenticated;
