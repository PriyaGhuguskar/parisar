-- ============================================================================
-- claim_chairman: use the name entered at society creation, not "Chairman"
-- ----------------------------------------------------------------------------
-- The chairman's name is captured at creation (societies.secretary_name). The
-- first version of claim_chairman ignored it and set the profile to the literal
-- "Chairman", throwing that name away. Now it carries secretary_name through, so
-- the chairman never has to re-type a name we already have. If they later change
-- it, that edit updates the profile normally.
-- ============================================================================

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
  v_existing uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select '+' || phone into v_phone from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  select society_id into v_existing
  from public.society_memberships
  where user_id = v_uid and role = 'secretary' and status = 'active'
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('society_id', v_existing,
      'needs_setup', not exists (select 1 from public.flats where society_id = v_existing));
  end if;

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

  -- The name we already have, falling back only if it was never set.
  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, coalesce(nullif(trim(v_soc.secretary_name), ''), 'Chairman'), v_phone)
  on conflict (user_id) do update
    set full_name = coalesce(nullif(trim(v_soc.secretary_name), ''), public.profiles.full_name);

  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, status, joined_at)
  values (v_soc.id, v_uid, null, 'secretary', 'owner', 'family', 'active', now())
  on conflict (society_id, user_id, flat_id) do update set role = 'secretary';

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc.id, v_uid, 'chairman.claimed', 'society_memberships', v_soc.id, '{}'::jsonb);

  return jsonb_build_object('society_id', v_soc.id,
    'needs_setup', not exists (select 1 from public.flats where society_id = v_soc.id));
end;
$$;

grant execute on function public.claim_chairman() to authenticated;
