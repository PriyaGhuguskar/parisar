-- ============================================================================
-- Chairman claim + society-structure setup for admin-created societies
-- ----------------------------------------------------------------------------
-- An admin creates a society with a secretary_phone but NO membership and NO
-- wings/flats. Two things block that chairman today:
--
--   1. There is no path that turns "my phone is this society's secretary_phone"
--      into a secretary MEMBERSHIP. redeem_society_code only elevates to
--      co_secretary, and needs a flat to join — but no flats exist yet.
--   2. bootstrap_society_structure only lets the audit-log CREATOR set up wings
--      and flats. For an admin-made society the creator is the admin, so the
--      chairman is refused.
--
-- This migration fixes both and breaks the chicken-and-egg (need a flat to be a
-- member, need to be a member to make flats) by allowing a flat-less secretary
-- membership during setup.
-- ============================================================================

-- A secretary running first-time setup has not picked their own flat yet, so a
-- membership must be able to exist without one. Nothing asserts flat_id NOT NULL
-- elsewhere (checked), and the directory simply shows them without a flat until
-- they add it.
alter table public.society_memberships alter column flat_id drop not null;

-- ---------------------------------------------------------------------------
-- claim_chairman — run by a freshly-OTP-verified person whose number is a
-- society's secretary_phone. Creates their secretary membership. The OTP is the
-- proof of identity; the phone match is the authority.
-- ---------------------------------------------------------------------------
create or replace function public.claim_chairman()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_soc   public.societies;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select '+' || phone into v_phone from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  -- The society this number is the secretary of, that has NO active secretary
  -- yet. Match on the last 10 digits so +91/91/bare all line up.
  select s.* into v_soc
  from public.societies s
  where right(regexp_replace(s.secretary_phone, '\D', '', 'g'), 10)
        = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
    and not exists (
      select 1 from public.society_memberships m
      where m.society_id = s.id and m.role = 'secretary' and m.status = 'active'
    )
  limit 1;
  if v_soc.id is null then raise exception 'NOT_A_CHAIRMAN'; end if;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, 'Chairman', v_phone)
  on conflict (user_id) do nothing;

  -- Flat-less secretary membership. residency/household are placeholders they
  -- can correct when they add their own flat; the role is what matters here.
  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, status, joined_at)
  values (v_soc.id, v_uid, null, 'secretary', 'owner', 'family', 'active', now())
  on conflict (society_id, user_id, flat_id) do update set role = 'secretary';

  -- The audit action bootstrap_society_structure now also accepts, so the
  -- chairman is recognised as entitled to set the society up.
  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc.id, v_uid, 'chairman.claimed', 'society_memberships', v_soc.id, '{}'::jsonb);

  -- Does the society already have flats? Tells the client whether to send them
  -- to structure setup or straight to the dashboard.
  return jsonb_build_object(
    'society_id', v_soc.id,
    'needs_setup', not exists (select 1 from public.flats where society_id = v_soc.id)
  );
end;
$$;

grant execute on function public.claim_chairman() to authenticated;

comment on function public.claim_chairman() is
  'Called after a chairman passes OTP at first login. Creates their secretary membership so they can set the society up. Phone must match societies.secretary_phone and no secretary may exist yet.';

-- ---------------------------------------------------------------------------
-- bootstrap_society_structure: accept the active secretary, not only the audit
-- creator. This unblocks admin-created societies while keeping the old
-- self-serve path working.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_society_structure(
  p_society_id uuid, p_wings jsonb, p_flats jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id   uuid := auth.uid();
  v_entitled  boolean;
  v_wing_id   uuid;
  v_name      text;
  v_flat      jsonb;
  v_wing_map  jsonb := '{}'::jsonb;
  v_wings_out jsonb := '[]'::jsonb;
  v_flats_out jsonb := '[]'::jsonb;
  v_flat_id   uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Entitled = the audit-log creator (old self-serve flow) OR the society's
  -- current active secretary (admin-created flow).
  select
    exists (select 1 from public.audit_log
             where society_id = p_society_id and actor_id = v_user_id and action = 'society.created')
    or exists (select 1 from public.society_memberships
                where society_id = p_society_id and user_id = v_user_id
                  and role = 'secretary' and status = 'active')
  into v_entitled;
  if not v_entitled then raise exception 'NOT_SOCIETY_CREATOR'; end if;

  for v_name in select jsonb_array_elements_text(jsonb_path_query_array(p_wings, '$[*].name'))
  loop
    insert into public.wings (society_id, name) values (p_society_id, v_name)
    returning id into v_wing_id;
    v_wing_map := v_wing_map || jsonb_build_object(v_name, v_wing_id);
    v_wings_out := v_wings_out || jsonb_build_object('id', v_wing_id, 'name', v_name);
  end loop;

  for v_flat in select * from jsonb_array_elements(p_flats)
  loop
    v_wing_id := (v_wing_map ->> (v_flat ->> 'wing_name'))::uuid;
    if v_wing_id is null then raise exception 'UNKNOWN_WING: %', v_flat ->> 'wing_name'; end if;
    insert into public.flats (society_id, wing_id, number)
    values (p_society_id, v_wing_id, v_flat ->> 'number')
    returning id into v_flat_id;
    v_flats_out := v_flats_out || jsonb_build_object('id', v_flat_id, 'number', v_flat ->> 'number');
  end loop;

  return jsonb_build_object('wings', v_wings_out, 'flats', v_flats_out);
end;
$$;

grant execute on function public.bootstrap_society_structure(uuid, jsonb, jsonb) to authenticated;
