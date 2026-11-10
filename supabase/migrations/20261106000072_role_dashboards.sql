-- ============================================================================
-- Migration 072: role dashboards, the post-OTP summary, and a self-check.
--
-- Every number comes from a real table. Metrics with no backing module (dues,
-- parking occupancy, accounting, vendors, events) are absent rather than zero, and
-- are named in docs/onboarding/API.md. "Today" means the Asia/Kolkata calendar day.
-- ============================================================================

create or replace function public.society_admin_dashboard(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_flats jsonb;
begin
  perform app_private.assert_can_manage(p_society_id);

  select jsonb_build_object(
           'flats', count(*),
           'occupied', count(*) filter (where e = 'occupied'),
           'vacant', count(*) filter (where e = 'vacant'),
           'under_construction', count(*) filter (where e = 'under_construction'),
           'maintenance', count(*) filter (where e = 'maintenance'))
    into v_flats
    from (select app_private.flat_effective_status(f.id, f.status) as e
            from public.flats f where f.society_id = p_society_id) x;

  return v_flats || jsonb_build_object(
    'residents', (select count(distinct m.user_id) from public.society_memberships m
                   where m.society_id = p_society_id and m.status = 'active' and m.flat_id is not null),
    'pending_requests', jsonb_build_object(
      'memberships', (select count(*) from public.society_memberships m
                       where m.society_id = p_society_id and m.status = 'pending_review'),
      'household', (select count(*) from public.household_access_requests r
                     where r.society_id = p_society_id and r.status = 'pending'),
      'tenants', (select count(*) from public.flat_tenants t
                   where t.society_id = p_society_id and t.status in ('registered', 'owner_approved'))),
    'pending_verification', (select count(*) from public.resident_records r
                              where r.society_id = p_society_id and r.status in ('pending', 'needs_correction')),
    'open_complaints', (select count(*) from public.complaints c
                         where c.society_id = p_society_id and c.status <> 'resolved'),
    'todays_visitors', (select count(*) from public.visitor_requests v
                         where v.society_id = p_society_id and v.created_at >= v_day_start)
  );
end;
$$;
revoke all on function public.society_admin_dashboard(uuid) from public, anon;
grant execute on function public.society_admin_dashboard(uuid) to authenticated;

-- p_society_id NULL = the caller's active society. Only their own or their flat's data.
create or replace function public.resident_dashboard(p_society_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_soc uuid := p_society_id;
  v_mem public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_soc is null then
    select r.society_id into v_soc from app_private.resolve_active_membership(v_uid) r;
  end if;

  select * into v_mem from public.society_memberships m
   where m.society_id = v_soc and m.user_id = v_uid and m.status = 'active'
   order by (m.flat_id is not null) desc
   limit 1;
  if v_mem.id is null then raise exception 'NOT_A_MEMBER'; end if;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select s.name from public.societies s where s.id = v_soc),
    'role', v_mem.role,
    'society_title', app_private.effective_title(v_mem.society_title, v_mem.role),
    'resident_type', v_mem.resident_type,
    'flat_id', v_mem.flat_id,
    'flat_label', app_private.flat_label(v_mem.flat_id),
    'household_members', case when v_mem.flat_id is null then 0 else
      (select count(*) from public.society_memberships m where m.flat_id = v_mem.flat_id and m.status = 'active') end,
    'my_open_complaints', (select count(*) from public.complaints c
                            where c.society_id = v_soc and c.reporter_id = v_uid and c.status <> 'resolved'),
    'pending_visitors', case when v_mem.flat_id is null then 0 else
      (select count(*) from public.visitor_requests v
        where v.flat_id = v_mem.flat_id and v.status = 'pending'
          and v.created_at > now() - interval '30 minutes') end,
    'upcoming_bookings', (select count(*) from public.bookings b
                           where b.society_id = v_soc and b.requester_id = v_uid
                             and b.status in ('pending', 'approved') and upper(b.time_range) > now()),
    'open_polls', (select count(*) from public.polls p where p.society_id = v_soc and p.status = 'open'),
    'notices_last_7_days', (select count(*) from public.notifications n
                             where n.society_id = v_soc and n.created_at >= now() - interval '7 days'),
    'pending_household_requests', case when v_mem.flat_id is null then 0 else
      (select count(*) from public.household_access_requests r
        where r.flat_id = v_mem.flat_id and r.status = 'pending'
          and app_private.can_decide_household(r, v_uid)) end,
    'pending_tenant_approvals', case when v_mem.flat_id is null then 0 else
      (select count(*) from public.flat_tenants t
        where t.flat_id = v_mem.flat_id and t.status = 'registered'
          and app_private.is_flat_owner(t.flat_id, v_uid)) end
  );
end;
$$;
revoke all on function public.resident_dashboard(uuid) from public, anon;
grant execute on function public.resident_dashboard(uuid) to authenticated;

-- Active guards only, and only for a society they guard.
create or replace function public.security_dashboard(p_society_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_soc uuid;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select g.society_id into v_soc from public.society_guards g
   where g.user_id = v_uid and g.status = 'active'
     and (p_society_id is null or g.society_id = p_society_id)
   order by g.created_at desc, g.id
   limit 1;
  if v_soc is null then raise exception 'NOT_A_GUARD'; end if;

  return (
    select jsonb_build_object(
      'society_id', v_soc,
      'society_name', (select s.name from public.societies s where s.id = v_soc),
      'todays_visitors', count(*),
      'pending', count(*) filter (where v.status = 'pending' and v.created_at > now() - interval '30 minutes'),
      'approved', count(*) filter (where v.status = 'approved'),
      'denied', count(*) filter (where v.status = 'denied'),
      'active_sos', (select count(*) from public.sos_alerts a
                      where a.society_id = v_soc and a.resolved_at is null
                        and a.audience in ('all', 'watchman', 'secretary_watchman')))
      from public.visitor_requests v
     where v.society_id = v_soc and v.created_at >= v_day_start
  );
end;
$$;
revoke all on function public.security_dashboard(uuid) from public, anon;
grant execute on function public.security_dashboard(uuid) to authenticated;

-- One call after OTP: everything waiting for this person. Complements my_login_state.
create or replace function public.my_onboarding_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    'authority_societies', public.my_authority_societies() -> 'societies',
    'resident_records', public.my_resident_records(),
    'tenant_registrations', public.my_tenant_registrations(),
    'household_requests', public.household_my_requests()
  );
end;
$$;
revoke all on function public.my_onboarding_state() from public, anon;
grant execute on function public.my_onboarding_state() to authenticated;

-- ============================================================================
-- Self-check: same guarantees as 057 §8, for everything added since.
-- ============================================================================
do $$
declare
  v_list text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e');
  if v_list is not null then raise exception '072 self-check: RLS off on: %', v_list; end if;

  -- Exactly two new pre-auth RPCs; dev_peek_otp is re-granted only by seed.sql.
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and p.proname not in ('submit_connect_request', 'get_connect_request_status', 'dev_peek_otp')
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_list is not null then raise exception '072 self-check: executable by anon: %', v_list; end if;

  -- New RPC-only tables give clients nothing, whatever the default privileges were.
  select string_agg(t, ', ') into v_list
    from unnest(array['resident_records', 'resident_import_batches', 'resident_import_rows', 'flat_owners',
                      'flat_tenants', 'resident_documents', 'family_invites', 'household_access_requests',
                      'society_staff_details', 'society_setup_steps', 'platform_feature_gaps']) as t
   where has_table_privilege('authenticated', 'public.' || t, 'SELECT')
      or has_table_privilege('anon', 'public.' || t, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || t, 'DELETE');
  if v_list is not null then raise exception '072 self-check: client privileges on: %', v_list; end if;

  if exists (select 1 from storage.buckets where id = 'parisar-proofs' and public) then
    raise exception '072 self-check: bucket parisar-proofs is public';
  end if;
end
$$;
