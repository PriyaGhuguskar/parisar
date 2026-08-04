-- ============================================================================
-- Guard / visitor RPCs — the narrow, audited write doors.
-- All are SECURITY DEFINER and re-check the caller's right, so RLS stays
-- fail-closed (no direct INSERT/UPDATE policies on the visitor tables).
-- ============================================================================

-- secretary_add_guard: a society's secretary/co-sec registers a guard by name +
-- phone. The auth user is created on the guard's first OTP login (claim_guard),
-- exactly like the chairman-claim flow.
create or replace function public.secretary_add_guard(
  p_society_id uuid, p_name text, p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := nullif(trim(p_name), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id    uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_name is null then raise exception 'INVALID_NAME'; end if;
  -- accept a leading 91; keep the bare 10 digits
  if length(v_phone) = 12 and left(v_phone, 2) = '91' then v_phone := right(v_phone, 10); end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;

  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid
      and role in ('secretary', 'co_secretary') and status = 'active'
  ) then raise exception 'NOT_SECRETARY'; end if;

  if exists (select 1 from public.society_guards where society_id = p_society_id and phone = v_phone) then
    raise exception 'GUARD_EXISTS';
  end if;

  insert into public.society_guards (society_id, name, phone)
  values (p_society_id, v_name, v_phone)
  returning id into v_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'guard.added', 'society_guards', v_id,
          jsonb_build_object('name', v_name));

  return jsonb_build_object('guard_id', v_id, 'name', v_name);
end;
$$;
grant execute on function public.secretary_add_guard(uuid, text, text) to authenticated;

-- claim_guard: the guard's first login. Links their auth user to the pre-created
-- society_guards row (matched on phone) and creates a profile for attribution.
create or replace function public.claim_guard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_guard public.society_guards;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select right(regexp_replace(phone, '\D', '', 'g'), 10) into v_phone
    from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  select * into v_guard from public.society_guards
   where phone = v_phone and status = 'active'
     and (user_id is null or user_id = v_uid)
   limit 1;
  if v_guard.id is null then raise exception 'NOT_A_GUARD'; end if;

  update public.society_guards set user_id = v_uid where id = v_guard.id;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, v_guard.name, '+91' || v_phone)
  on conflict (user_id) do update set full_name = coalesce(nullif(trim(v_guard.name), ''), public.profiles.full_name);

  return jsonb_build_object('society_id', v_guard.society_id, 'guard_id', v_guard.id);
end;
$$;
grant execute on function public.claim_guard() to authenticated;

-- guard_list_flats: the guard needs to pick a flat, but has no resident RLS
-- access. This returns the wings + flats for the guard's own society only.
create or replace function public.guard_list_flats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soc uuid := public.current_guard_society_id();
begin
  if v_soc is null then raise exception 'NOT_GUARD'; end if;
  return (
    select coalesce(jsonb_agg(w order by w.name), '[]'::jsonb)
    from (
      select wg.id, wg.name,
             coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'number', f.number) order by f.number)
                        from public.flats f where f.wing_id = wg.id), '[]'::jsonb) as flats
        from public.wings wg where wg.society_id = v_soc
    ) w
  );
end;
$$;
grant execute on function public.guard_list_flats() to authenticated;

-- guard_create_visit: raise a pending request for a flat in the guard's society.
create or replace function public.guard_create_visit(
  p_flat_id uuid, p_visitor_name text, p_visitor_phone text default null, p_purpose text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_soc   uuid := public.current_guard_society_id();
  v_name  text := nullif(trim(p_visitor_name), '');
  v_guard uuid;
  v_id    uuid;
begin
  if v_soc is null then raise exception 'NOT_GUARD'; end if;
  if v_name is null then raise exception 'INVALID_VISITOR'; end if;
  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_soc) then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;

  select id into v_guard from public.society_guards where user_id = v_uid and society_id = v_soc limit 1;

  insert into public.visitor_requests (society_id, flat_id, guard_id, visitor_name, visitor_phone, purpose)
  values (v_soc, p_flat_id, v_guard, v_name,
          nullif(trim(coalesce(p_visitor_phone, '')), ''),
          nullif(trim(coalesce(p_purpose, '')), ''))
  returning id into v_id;

  return jsonb_build_object('request_id', v_id, 'status', 'pending');
end;
$$;
grant execute on function public.guard_create_visit(uuid, text, text, text) to authenticated;

-- resident_decide_visit: a resident of the flat approves or denies a pending request.
create or replace function public.resident_decide_visit(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.visitor_requests;
  v_new public.visitor_status;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_req from public.visitor_requests where id = p_request_id;
  if v_req.id is null then raise exception 'NOT_FOUND'; end if;

  if not exists (
    select 1 from public.society_memberships sm
     where sm.user_id = v_uid and sm.status = 'active' and sm.flat_id = v_req.flat_id
  ) then raise exception 'NOT_YOUR_FLAT'; end if;

  if v_req.status <> 'pending' then raise exception 'ALREADY_DECIDED'; end if;

  v_new := case when p_approve then 'approved'::public.visitor_status else 'denied'::public.visitor_status end;
  update public.visitor_requests
     set status = v_new, decided_at = now(), decided_by = v_uid
   where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', v_new::text);
end;
$$;
grant execute on function public.resident_decide_visit(uuid, boolean) to authenticated;
