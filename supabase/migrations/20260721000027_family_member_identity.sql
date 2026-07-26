-- ============================================================================
-- Family members as a login identity
-- ----------------------------------------------------------------------------
-- During onboarding a resident lists who lives in the flat, each with a mobile.
-- Those numbers are a login path: a family member later signs in with just
-- phone + OTP + a PIN they set — NO society code, NO re-onboarding — because
-- their flat and name are already known from the entry the primary resident made.
--
-- family_members gains:
--   relation        — "spouse", "son", etc. (the onboarding form collects it)
--   is_resident     — actually lives in the flat vs an off-site emergency contact
--   claimed_user_id — set when that person logs in and becomes a real member,
--                     so a number cannot be claimed twice.
--
-- SECURITY: the family member's number was typed by someone else, so holding it
-- is not proof of identity on its own. The OTP at their first login is what
-- proves the person — same principle as the society code (which building) vs the
-- OTP (which person). Nobody becomes a member off a family entry without passing
-- an OTP to the number.
-- ============================================================================

alter table public.family_members
  add column if not exists relation        text,
  add column if not exists is_resident     boolean not null default true,
  add column if not exists claimed_user_id uuid references auth.users(id) on delete set null;

-- A given phone can be a pending (unclaimed) family entry only once per society,
-- so two flats cannot both pre-register the same number and race to claim it.
create unique index if not exists family_members_unclaimed_phone_per_society
  on public.family_members (society_id, phone)
  where claimed_user_id is null and phone is not null;

comment on column public.family_members.claimed_user_id is
  'Set when this family member signs in for the first time and gets their own membership. NULL = not yet claimed.';

-- ---------------------------------------------------------------------------
-- claim_family_membership — run by a freshly-OTP-verified family member.
--
-- Turns the pre-entered family_members row into a real society_membership for
-- the caller, sharing the primary resident's flat. Guards:
--   * caller must be authenticated (they just passed OTP)
--   * an UNCLAIMED family_members row must exist for the caller's phone
--   * the caller must not already be a member of that society
-- Returns the society_id so the client can proceed to set a PIN and land in.
-- ---------------------------------------------------------------------------
create or replace function public.claim_family_membership()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid     uuid := auth.uid();
  v_phone   text;
  v_fam     public.family_members;
  v_primary public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  -- The phone GoTrue verified for this user (stored without the +).
  select '+' || phone into v_phone from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  -- Match on the last 10 digits so +91 / 91 / bare all line up.
  select * into v_fam from public.family_members
   where claimed_user_id is null
     and right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
   limit 1;
  if v_fam.id is null then raise exception 'NOT_A_FAMILY_MEMBER'; end if;

  -- Already a member of this society? Nothing to do — just report it.
  if exists (select 1 from public.society_memberships
              where user_id = v_uid and society_id = v_fam.society_id) then
    update public.family_members set claimed_user_id = v_uid where id = v_fam.id;
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  -- Inherit the flat from the membership that listed this person.
  select * into v_primary from public.society_memberships where id = v_fam.membership_id;
  if v_primary.id is null then raise exception 'PRIMARY_MEMBERSHIP_GONE'; end if;

  -- A profile row (name) so the app has an identity for them.
  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, coalesce(v_fam.full_name, 'Family member'), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  -- Their own membership, same flat, role member. status active — the primary
  -- resident already vouched for them by entering them, and the OTP proved the
  -- phone, so a second committee review would be friction without a threat.
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

grant execute on function public.claim_family_membership() to authenticated;

comment on function public.claim_family_membership() is
  'Called after a family member passes OTP at first login. Creates their membership in the flat they were pre-entered into. No society code needed — the OTP is the proof.';
