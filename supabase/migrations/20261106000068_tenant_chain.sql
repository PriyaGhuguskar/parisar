-- ============================================================================
-- Migration 068: tenant registration and approval chain RPCs. Tables are in 067.
--
--   tenant_register        registered (no membership yet)
--   tenant_owner_decide    owner_approved | rejected  (an active owner of the flat)
--   tenant_admin_decide    admin_approved or active | rejected (a society manager)
--   tenant_activate        active, once the start date arrives
-- The manager may act on 'registered' only when the flat has no active owner; that
-- is recorded as owner_step_skipped.
-- ============================================================================

create or replace function app_private.flat_label(p_flat uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.name || '-' || f.number
    from public.flats f join public.wings w on w.id = f.wing_id
   where f.id = p_flat
$$;
revoke all on function app_private.flat_label(uuid) from public, anon, authenticated;

create or replace function app_private.tenant_json(t public.flat_tenants, p_contacts boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', t.id, 'society_id', t.society_id, 'flat_id', t.flat_id,
    'flat_label', app_private.flat_label(t.flat_id),
    'full_name', t.full_name, 'status', t.status,
    'agreement_start', t.agreement_start, 'agreement_end', t.agreement_end,
    'police_status', t.police_status, 'police_reference', t.police_reference,
    'owner_step_skipped', t.owner_step_skipped,
    'owner_approved_at', t.owner_approved_at, 'admin_approved_at', t.admin_approved_at,
    'activated_at', t.activated_at, 'rejected_at', t.rejected_at,
    'rejected_reason', t.rejected_reason, 'rejected_stage', t.rejected_stage,
    'created_at', t.created_at,
    'owner_name', case when p_contacts then t.owner_name end,
    'owner_phone', case when p_contacts then t.owner_phone10 end,
    'phone', case when p_contacts then
      (select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
         from auth.users u where u.id = t.user_id) end)
$$;
revoke all on function app_private.tenant_json(public.flat_tenants, boolean) from public, anon, authenticated;

create or replace function app_private.assert_tenant_fields(
  p_name text, p_start date, p_end date, p_owner_name text, p_owner_phone text,
  p_police text, p_reference text
)
returns void
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'INVALID_DATES'; end if;
  if char_length(coalesce(p_owner_name, '')) > 80 then raise exception 'INVALID_OWNER_NAME'; end if;
  if nullif(trim(coalesce(p_owner_phone, '')), '') is not null
     and app_private.norm_mobile(p_owner_phone) is null then
    raise exception 'INVALID_OWNER_PHONE';
  end if;
  -- 'verified' and 'rejected' are a manager's to set, never the tenant's.
  if coalesce(p_police, 'not_submitted') not in ('not_submitted', 'submitted') then
    raise exception 'INVALID_POLICE_STATUS';
  end if;
  if char_length(coalesce(p_reference, '')) > 60 then raise exception 'INVALID_POLICE_REFERENCE'; end if;
end;
$$;
revoke all on function app_private.assert_tenant_fields(text, date, date, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.tenant_register(
  p_code             text,
  p_flat_id          uuid,
  p_full_name        text,
  p_agreement_start  date default null,
  p_agreement_end    date default null,
  p_owner_name       text default null,
  p_owner_phone      text default null,
  p_police_status    text default 'not_submitted',
  p_police_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_soc uuid;
  v_row public.flat_tenants;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_res := app_private.resolve_join_code(p_code);
  if v_res ? 'error' then return v_res; end if;
  v_soc := (v_res ->> 'society_id')::uuid;

  perform app_private.assert_tenant_fields(p_full_name, p_agreement_start, p_agreement_end,
    p_owner_name, p_owner_phone, p_police_status, p_police_reference);

  if not exists (select 1 from public.flats f where f.id = p_flat_id and f.society_id = v_soc) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;
  if exists (select 1 from public.society_memberships m
              where m.society_id = v_soc and m.user_id = v_uid and m.status = 'active'
                and m.flat_id is not null) then
    raise exception 'ALREADY_A_RESIDENT';
  end if;
  if exists (select 1 from public.society_memberships m
              where m.society_id = v_soc and m.user_id = v_uid and m.status = 'deleted')
     and not exists (select 1 from public.society_authorities a
                      where a.society_id = v_soc and a.user_id = v_uid) then
    raise exception 'MEMBERSHIP_REMOVED';
  end if;
  if exists (select 1 from public.flat_tenants t
              where t.society_id = v_soc and t.user_id = v_uid
                and t.status in ('registered', 'owner_approved', 'admin_approved')) then
    raise exception 'TENANT_REGISTRATION_EXISTS';
  end if;

  perform app_private.assert_rate('rpc:tenant_register', v_uid::text, 5, 3600, 'TENANT_RATE_LIMITED');

  insert into public.flat_tenants
    (society_id, flat_id, user_id, full_name, agreement_start, agreement_end, owner_name,
     owner_phone10, police_status, police_reference)
  values (v_soc, p_flat_id, v_uid, trim(p_full_name), p_agreement_start, p_agreement_end,
          nullif(trim(coalesce(p_owner_name, '')), ''), app_private.norm_mobile(p_owner_phone),
          coalesce(p_police_status, 'not_submitted'), nullif(trim(coalesce(p_police_reference, '')), ''))
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'tenant.registered', 'flat_tenants', v_row.id,
          jsonb_build_object('flat_id', p_flat_id));

  return app_private.tenant_json(v_row, true);
end;
$$;
revoke all on function public.tenant_register(text, uuid, text, date, date, text, text, text, text) from public, anon;
grant execute on function public.tenant_register(text, uuid, text, date, date, text, text, text, text) to authenticated;

-- Edit my details: an open registration, or as an active tenant (imported or
-- onboarded before this existed), which creates the details row.
create or replace function public.tenant_save_my_details(
  p_society_id       uuid,
  p_full_name        text,
  p_agreement_start  date default null,
  p_agreement_end    date default null,
  p_owner_name       text default null,
  p_owner_phone      text default null,
  p_police_status    text default 'not_submitted',
  p_police_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.flat_tenants;
  v_mem public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_tenant_fields(p_full_name, p_agreement_start, p_agreement_end,
    p_owner_name, p_owner_phone, p_police_status, p_police_reference);

  select * into v_row from public.flat_tenants t
   where t.society_id = p_society_id and t.user_id = v_uid and t.status <> 'rejected'
   order by (t.status = 'active'), t.created_at desc
   limit 1
   for update;

  if v_row.id is null then
    select * into v_mem from public.society_memberships m
     where m.society_id = p_society_id and m.user_id = v_uid and m.status = 'active'
       and m.flat_id is not null and m.resident_type = 'tenant'
     limit 1;
    if v_mem.id is null then raise exception 'NOT_A_TENANT'; end if;
    insert into public.flat_tenants
      (society_id, flat_id, user_id, full_name, status, owner_step_skipped, activated_at, membership_id)
    values (p_society_id, v_mem.flat_id, v_uid, trim(p_full_name), 'active', true, now(), v_mem.id)
    returning * into v_row;
  end if;

  update public.flat_tenants
     set full_name = trim(p_full_name),
         agreement_start = p_agreement_start,
         agreement_end = p_agreement_end,
         owner_name = nullif(trim(coalesce(p_owner_name, '')), ''),
         owner_phone10 = app_private.norm_mobile(p_owner_phone),
         -- A tenant's edit never overwrites a manager's verdict.
         police_status = case when police_status in ('verified', 'rejected') then police_status
                              else coalesce(p_police_status, 'not_submitted') end,
         police_reference = case when police_status = 'verified' then police_reference
                                 else nullif(trim(coalesce(p_police_reference, '')), '') end,
         updated_at = now()
   where id = v_row.id
  returning * into v_row;

  return app_private.tenant_json(v_row, true);
end;
$$;
revoke all on function public.tenant_save_my_details(uuid, text, date, date, text, text, text, text) from public, anon;
grant execute on function public.tenant_save_my_details(uuid, text, date, date, text, text, text, text) to authenticated;

create or replace function public.my_tenant_registrations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return (
    select coalesce(jsonb_agg(
             app_private.tenant_json(t, true)
             || jsonb_build_object('society_name', s.name)
             order by t.created_at desc), '[]'::jsonb)
      from public.flat_tenants t
      join public.societies s on s.id = t.society_id
     where t.user_id = v_uid
  );
end;
$$;
revoke all on function public.my_tenant_registrations() from public, anon;
grant execute on function public.my_tenant_registrations() to authenticated;

-- Registrations waiting on this owner. No tenant phone, no owner-typed contact.
create or replace function public.owner_list_tenant_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return (
    select coalesce(jsonb_agg(app_private.tenant_json(t, false) order by t.created_at), '[]'::jsonb)
      from public.flat_tenants t
     where t.status = 'registered' and app_private.is_flat_owner(t.flat_id, v_uid)
  );
end;
$$;
revoke all on function public.owner_list_tenant_requests() from public, anon;
grant execute on function public.owner_list_tenant_requests() to authenticated;

create or replace function public.tenant_owner_decide(
  p_tenant_id uuid,
  p_approve   boolean,
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_row    public.flat_tenants;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_approve is null then raise exception 'INVALID_DECISION'; end if;
  select * into v_row from public.flat_tenants where id = p_tenant_id for update;
  if v_row.id is null or not app_private.is_flat_owner(v_row.flat_id, v_uid) then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if v_row.status <> 'registered' then raise exception 'INVALID_TENANT_STATE'; end if;

  if p_approve then
    update public.flat_tenants
       set status = 'owner_approved', owner_approved_by = v_uid, owner_approved_at = now(), updated_at = now()
     where id = p_tenant_id
    returning * into v_row;
  else
    if char_length(coalesce(v_reason, '')) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;
    update public.flat_tenants
       set status = 'rejected', rejected_by = v_uid, rejected_at = now(), rejected_reason = v_reason,
           rejected_stage = 'owner', updated_at = now()
     where id = p_tenant_id
    returning * into v_row;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'tenant.owner_decided', 'flat_tenants', p_tenant_id,
          jsonb_build_object('approved', p_approve));

  return app_private.tenant_json(v_row, false);
end;
$$;
revoke all on function public.tenant_owner_decide(uuid, boolean, text) from public, anon;
grant execute on function public.tenant_owner_decide(uuid, boolean, text) to authenticated;

create or replace function app_private.activate_tenant(p_tenant uuid)
returns public.flat_tenants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.flat_tenants;
  v_mem uuid;
begin
  select * into v_row from public.flat_tenants where id = p_tenant;
  v_mem := app_private.link_member_to_flat(
    v_row.society_id, v_row.user_id, v_row.flat_id, 'tenant', 'tenant', v_row.full_name);
  update public.flat_tenants
     set status = 'active', activated_at = now(), membership_id = v_mem, updated_at = now()
   where id = p_tenant
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function app_private.activate_tenant(uuid) from public, anon, authenticated;

create or replace function public.tenant_admin_decide(
  p_tenant_id uuid,
  p_approve   boolean,
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.flat_tenants;
  v_reason    text := nullif(trim(coalesce(p_reason, '')), '');
  v_has_owner boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_approve is null then raise exception 'INVALID_DECISION'; end if;
  select * into v_row from public.flat_tenants where id = p_tenant_id for update;
  if v_row.id is null or not app_private.is_society_manager(v_row.society_id) then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if v_row.user_id = v_uid then raise exception 'CANNOT_DECIDE_OWN_REQUEST'; end if;
  if v_row.status not in ('registered', 'owner_approved') then raise exception 'INVALID_TENANT_STATE'; end if;

  if not p_approve then
    if char_length(coalesce(v_reason, '')) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;
    update public.flat_tenants
       set status = 'rejected', rejected_by = v_uid, rejected_at = now(), rejected_reason = v_reason,
           rejected_stage = 'admin', updated_at = now()
     where id = p_tenant_id
    returning * into v_row;
  else
    if v_row.status = 'registered' then
      select exists (select 1 from public.society_memberships m
                      where m.flat_id = v_row.flat_id and m.status = 'active' and m.resident_type = 'owner')
        into v_has_owner;
      if v_has_owner then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
    end if;

    update public.flat_tenants
       set status = 'admin_approved', admin_approved_by = v_uid, admin_approved_at = now(),
           owner_step_skipped = (v_row.status = 'registered'), updated_at = now()
     where id = p_tenant_id
    returning * into v_row;

    if v_row.agreement_start is null or v_row.agreement_start <= (now() at time zone 'Asia/Kolkata')::date then
      v_row := app_private.activate_tenant(p_tenant_id);
    end if;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'tenant.admin_decided', 'flat_tenants', p_tenant_id,
          jsonb_build_object('approved', p_approve, 'status', v_row.status));

  return app_private.tenant_json(v_row, true);
end;
$$;
revoke all on function public.tenant_admin_decide(uuid, boolean, text) from public, anon;
grant execute on function public.tenant_admin_decide(uuid, boolean, text) to authenticated;

-- A manager may activate early. The tenant may once the start date has arrived.
create or replace function public.tenant_activate(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.flat_tenants;
  v_mgr boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.flat_tenants where id = p_tenant_id for update;
  if v_row.id is null then raise exception 'TENANT_NOT_FOUND'; end if;
  v_mgr := app_private.is_society_manager(v_row.society_id);
  if not (v_mgr or v_row.user_id = v_uid) then raise exception 'TENANT_NOT_FOUND'; end if;
  if v_row.status <> 'admin_approved' then raise exception 'INVALID_TENANT_STATE'; end if;
  if not v_mgr and v_row.agreement_start > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'TENANCY_NOT_STARTED';
  end if;

  v_row := app_private.activate_tenant(p_tenant_id);

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'tenant.activated', 'flat_tenants', p_tenant_id, '{}'::jsonb);

  return app_private.tenant_json(v_row, true) || jsonb_build_object('refresh_required', v_row.user_id = v_uid);
end;
$$;
revoke all on function public.tenant_activate(uuid) from public, anon;
grant execute on function public.tenant_activate(uuid) to authenticated;

create or replace function public.manager_set_tenant_police_status(
  p_tenant_id uuid,
  p_status    text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.flat_tenants;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.flat_tenants where id = p_tenant_id for update;
  if v_row.id is null or not app_private.is_society_manager(v_row.society_id) then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if p_status not in ('not_submitted', 'submitted', 'verified', 'rejected') then
    raise exception 'INVALID_POLICE_STATUS';
  end if;
  if char_length(coalesce(p_reference, '')) > 60 then raise exception 'INVALID_POLICE_REFERENCE'; end if;
  update public.flat_tenants
     set police_status = p_status,
         police_reference = coalesce(nullif(trim(coalesce(p_reference, '')), ''), police_reference),
         updated_at = now()
   where id = p_tenant_id
  returning * into v_row;
  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, auth.uid(), 'tenant.police_status', 'flat_tenants', p_tenant_id,
          jsonb_build_object('status', p_status));
  return app_private.tenant_json(v_row, true);
end;
$$;
revoke all on function public.manager_set_tenant_police_status(uuid, text, text) from public, anon;
grant execute on function public.manager_set_tenant_police_status(uuid, text, text) to authenticated;

create or replace function public.manager_list_tenants(
  p_society_id uuid,
  p_status     text default null,
  p_limit      int default 25,
  p_offset     int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  int := app_private.page_limit(p_limit);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform app_private.assert_manager(p_society_id);
  if p_status is not null and p_status not in ('registered', 'owner_approved', 'admin_approved', 'active', 'rejected') then
    raise exception 'INVALID_STATUS';
  end if;
  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(app_private.tenant_json(t, true) order by t.created_at desc), '[]'::jsonb)
        from (select * from public.flat_tenants x
               where x.society_id = p_society_id and (p_status is null or x.status = p_status)
               order by x.created_at desc limit v_limit offset v_offset) t),
    'total', (select count(*) from public.flat_tenants x
               where x.society_id = p_society_id and (p_status is null or x.status = p_status)),
    'limit', v_limit, 'offset', v_offset);
end;
$$;
revoke all on function public.manager_list_tenants(uuid, text, int, int) from public, anon;
grant execute on function public.manager_list_tenants(uuid, text, int, int) to authenticated;
