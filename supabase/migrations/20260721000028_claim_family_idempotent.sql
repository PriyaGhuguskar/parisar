-- ============================================================================
-- claim_family_membership: make a retry-after-success a graceful no-op
-- ----------------------------------------------------------------------------
-- The first version looked up the UNCLAIMED family row first, so once a claim
-- succeeded a second call (e.g. a network retry) found no unclaimed row and
-- raised NOT_A_FAMILY_MEMBER — surfacing an error to someone who is, in fact,
-- already a member. Now it checks "already a member" FIRST and returns cleanly.
-- ============================================================================

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

  select '+' || phone into v_phone from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  -- Already a member somewhere they were listed as family? Then this is a
  -- retry or a second visit — succeed quietly.
  select sf.* into v_fam
  from public.family_members sf
  where sf.claimed_user_id = v_uid
  limit 1;
  if v_fam.id is not null then
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  -- Otherwise find the pending entry for this phone.
  select * into v_fam from public.family_members
   where claimed_user_id is null
     and right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
   limit 1;
  if v_fam.id is null then raise exception 'NOT_A_FAMILY_MEMBER'; end if;

  if exists (select 1 from public.society_memberships
              where user_id = v_uid and society_id = v_fam.society_id) then
    update public.family_members set claimed_user_id = v_uid where id = v_fam.id;
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  select * into v_primary from public.society_memberships where id = v_fam.membership_id;
  if v_primary.id is null then raise exception 'PRIMARY_MEMBERSHIP_GONE'; end if;

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

grant execute on function public.claim_family_membership() to authenticated;
