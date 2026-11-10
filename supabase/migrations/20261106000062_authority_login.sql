-- ============================================================================
-- Migration 062: authority login and society titles.
--
-- An authority number is a mobile on society_authorities. Possession is proven by
-- OTP, so everything here reads the phone from the OTP-verified auth.users row of
-- the caller. Nothing is callable by anon, and no RPC takes a phone number, so a
-- number alone can never reveal a society name.
--
-- setup_state:
--   needs_setup               society structure not finished (setup_completed_at)
--   needs_personal_onboarding structure done, this authority has no flat and has
--                             not said they do not live in the society
--   complete                  nothing left to do
-- ============================================================================

alter table public.society_authorities
  add column if not exists personal_onboarding_skipped_at timestamptz;

comment on column public.society_authorities.personal_onboarding_skipped_at is
  'Set when an authority who does not live in the society skips picking a flat.';

create or replace function app_private.authority_setup_state(p_society uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when (select s.setup_completed_at from public.societies s where s.id = p_society) is null
      then 'needs_setup'
    when exists (select 1 from public.society_memberships m
                  where m.society_id = p_society and m.user_id = p_user
                    and m.status = 'active' and m.flat_id is not null)
      then 'complete'
    when exists (select 1 from public.society_authorities a
                  where a.society_id = p_society and a.user_id = p_user
                    and a.personal_onboarding_skipped_at is not null)
      then 'complete'
    else 'needs_personal_onboarding'
  end
$$;
revoke all on function app_private.authority_setup_state(uuid, uuid) from public, anon, authenticated;

-- Which societies is the signed-in phone an authority of?
create or replace function public.my_authority_societies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_phone := app_private.caller_phone10();
  if v_phone is null then return jsonb_build_object('societies', '[]'::jsonb); end if;

  return jsonb_build_object('societies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'authority_id', a.id,
             'society_id', s.id,
             'society_name', s.name,
             'society_code', (select c.code from public.society_codes c
                               where c.society_id = s.id and c.revoked_at is null limit 1),
             'service_status', s.service_status,
             'claimed', a.user_id is not null,
             'setup_state', app_private.authority_setup_state(s.id, v_uid),
             'setup_completed_at', s.setup_completed_at,
             'has_flat', exists (select 1 from public.society_memberships m
                                  where m.society_id = s.id and m.user_id = v_uid
                                    and m.status = 'active' and m.flat_id is not null),
             'membership', (select jsonb_build_object(
                                'id', m.id, 'role', m.role, 'status', m.status, 'flat_id', m.flat_id,
                                'society_title', app_private.effective_title(m.society_title, m.role))
                              from public.society_memberships m
                             where m.society_id = s.id and m.user_id = v_uid and m.status = 'active'
                             order by (m.flat_id is not null) desc limit 1)
           ) order by s.name), '[]'::jsonb)
      from public.society_authorities a
      join public.societies s on s.id = a.society_id
     where a.phone = v_phone
       and (a.user_id is null or a.user_id = v_uid)
  ));
end;
$$;
revoke all on function public.my_authority_societies() from public, anon;
grant execute on function public.my_authority_societies() to authenticated;

-- Claim one specific society (claim_society_authority only ever reaches the first
-- match, so a person who is an authority of two societies could not get the second).
create or replace function public.claim_authority_for_society(p_society_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_auth  public.society_authorities;
  v_mem   public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_phone := app_private.caller_phone10();
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  select * into v_auth from public.society_authorities a
   where a.society_id = p_society_id and a.phone = v_phone
     and (a.user_id is null or a.user_id = v_uid)
   for update;
  if v_auth.id is null then raise exception 'NOT_AN_AUTHORITY'; end if;
  if not public.society_accepts_joins(p_society_id) then raise exception 'SOCIETY_BLOCKED'; end if;

  if v_auth.user_id is null then
    update public.society_authorities set user_id = v_uid, claimed_at = now() where id = v_auth.id;
  end if;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, v_auth.full_name, '+' || (select u.phone from auth.users u where u.id = v_uid))
  on conflict (user_id) do update
    set full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name);

  -- One person, one membership: active first, then a pending claim, else a new
  -- flat-less row. onboard_resident attaches the flat to this same row.
  select * into v_mem from public.society_memberships m
   where m.society_id = p_society_id and m.user_id = v_uid and m.status in ('active', 'pending_review')
   order by (m.status = 'active') desc, (m.flat_id is not null) desc
   limit 1
   for update;

  if v_mem.id is not null then
    update public.society_memberships
       set role = 'secretary', status = 'active'
     where id = v_mem.id;
  else
    insert into public.society_memberships
      (society_id, user_id, flat_id, role, residency, household, status, joined_at)
    values (p_society_id, v_uid, null, 'secretary', 'owner', 'family', 'active', now())
    returning * into v_mem;
  end if;

  update public.profiles set active_society_id = p_society_id where user_id = v_uid;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'authority.claimed', 'society_authorities', v_auth.id, '{}'::jsonb);

  return jsonb_build_object(
    'society_id', p_society_id,
    'setup_state', app_private.authority_setup_state(p_society_id, v_uid),
    'refresh_required', true
  );
end;
$$;
revoke all on function public.claim_authority_for_society(uuid) from public, anon;
grant execute on function public.claim_authority_for_society(uuid) to authenticated;

-- An authority who does not live in the society has no flat to pick.
create or replace function public.authority_skip_personal_onboarding(p_society_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.society_authorities
     set personal_onboarding_skipped_at = now()
   where society_id = p_society_id and user_id = v_uid;
  if not found then raise exception 'NOT_AN_AUTHORITY'; end if;
  return jsonb_build_object(
    'society_id', p_society_id,
    'setup_state', app_private.authority_setup_state(p_society_id, v_uid));
end;
$$;
revoke all on function public.authority_skip_personal_onboarding(uuid) from public, anon;
grant execute on function public.authority_skip_personal_onboarding(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Society title. Only a live secretary sets it. The title maps onto
-- membership_role, which is what actually grants permissions:
--   resident -> member, committee_member -> board_member, treasurer -> co_secretary,
--   secretary | chairman -> secretary.
-- Granting a secretary-level title goes through the authority list, keeping
-- "secretary role <=> authority row". Taking one away revokes the authority row so
-- the office cannot come back on the next sign-in.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_society_title(
  p_society_id     uuid,
  p_target_user_id uuid,
  p_title          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  public.membership_role := app_private.society_title_role(p_title);
  v_mem   public.society_memberships;
  v_phone text;
  v_name  text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_live_role(p_society_id, array['secretary'], 'ONLY_SECRETARY_CAN_SET_TITLE');
  if v_role is null then raise exception 'INVALID_TITLE'; end if;

  select * into v_mem from public.society_memberships m
   where m.society_id = p_society_id and m.user_id = p_target_user_id and m.status = 'active'
   order by (m.flat_id is not null) desc
   limit 1
   for update;
  if v_mem.id is null then raise exception 'TARGET_NOT_IN_SOCIETY'; end if;

  -- Changing your own title is fine while your permissions stay the same.
  if p_target_user_id = v_uid and v_mem.role <> v_role then
    raise exception 'CANNOT_CHANGE_OWN_ROLE';
  end if;

  if v_role = 'secretary' and v_mem.role <> 'secretary' then
    select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) into v_phone
      from auth.users u where u.id = p_target_user_id;
    if coalesce(v_phone, '') !~ '^[6-9][0-9]{9}$' then raise exception 'TARGET_HAS_NO_PHONE'; end if;
    select p.full_name into v_name from public.profiles p where p.user_id = p_target_user_id;
    if exists (select 1 from public.society_authorities a
                where a.society_id = p_society_id and a.phone = v_phone) then
      update public.society_authorities
         set user_id = p_target_user_id, claimed_at = coalesce(claimed_at, now())
       where society_id = p_society_id and phone = v_phone;
    else
      perform public._add_society_authority(p_society_id, v_name, v_phone, v_uid);
    end if;
  elsif v_role <> 'secretary' and v_mem.role = 'secretary' then
    perform app_private.revoke_society_authority(p_society_id, p_target_user_id, v_uid, 'title_changed');
  end if;

  update public.society_memberships
     set role = v_role, society_title = p_title
   where id = v_mem.id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'title.changed', 'society_memberships', v_mem.id,
          jsonb_build_object('target_user_id', p_target_user_id, 'title', p_title,
                             'from_role', v_mem.role, 'to_role', v_role));

  return jsonb_build_object('user_id', p_target_user_id, 'society_title', p_title, 'role', v_role);
end;
$$;
revoke all on function public.set_member_society_title(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_society_title(uuid, uuid, text) to authenticated;
