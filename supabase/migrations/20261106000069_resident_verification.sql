-- ============================================================================
-- Migration 069: resident verification.
--
-- A resident sees only records whose phone matches their OTP-verified number. A
-- record owned by someone else looks exactly like one that does not exist. No RPC
-- here takes a phone number from the caller. Edits are proposals: nothing a
-- resident submits changes the record until a manager applies it.
--
-- Status: pending -> verified | needs_correction | rejected
--         needs_correction -> pending (manager applied or reopened) | rejected
-- ============================================================================

create or replace function app_private.record_json(r public.resident_records, p_for_manager boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id, 'society_id', r.society_id, 'flat_id', r.flat_id,
    'flat_label', app_private.flat_label(r.flat_id),
    'wing', (select w.name from public.flats f join public.wings w on w.id = f.wing_id where f.id = r.flat_id),
    'floor', (select coalesce(fl.name, fl.number::text) from public.flats f
                join public.floors fl on fl.id = f.floor_id where f.id = r.flat_id),
    'flat', (select f.number from public.flats f where f.id = r.flat_id),
    'full_name', r.full_name, 'email', r.email, 'resident_type', r.resident_type,
    'status', r.status, 'source', r.source, 'proposed_changes', r.proposed_changes,
    'correction_note', r.correction_note, 'reported_incorrect', r.reported_incorrect,
    'rejection_reason', r.rejection_reason, 'verified_at', r.verified_at, 'created_at', r.created_at
  ) || case when p_for_manager then jsonb_build_object(
    'phone', r.phone10, 'batch_id', r.batch_id, 'user_id', r.user_id,
    'invite_prepared_at', r.invite_prepared_at, 'reviewed_at', r.reviewed_at
  ) else '{}'::jsonb end
$$;
revoke all on function app_private.record_json(public.resident_records, boolean) from public, anon, authenticated;

-- Lock a record the caller's verified phone matches, or raise RECORD_NOT_FOUND.
create or replace function app_private.lock_my_record(p_record uuid)
returns public.resident_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.resident_records;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.resident_records r
   where r.id = p_record and r.phone10 = app_private.caller_phone10()
   for update;
  if v_row.id is null then raise exception 'RECORD_NOT_FOUND'; end if;
  return v_row;
end;
$$;
revoke all on function app_private.lock_my_record(uuid) from public, anon, authenticated;

create or replace function public.my_resident_records()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_phone := app_private.caller_phone10();
  if v_phone is null then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(
             app_private.record_json(r, false)
             || jsonb_build_object('society_name', s.name, 'service_status', s.service_status)
             order by r.created_at desc), '[]'::jsonb)
      from public.resident_records r
      join public.societies s on s.id = r.society_id
     where r.phone10 = v_phone and r.status <> 'rejected'
  );
end;
$$;
revoke all on function public.my_resident_records() from public, anon;
grant execute on function public.my_resident_records() to authenticated;

-- The person confirms the record. This is what creates the membership.
create or replace function public.resident_confirm_record(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.resident_records;
  v_mem       uuid;
  v_residency public.residency_kind;
begin
  v_row := app_private.lock_my_record(p_record_id);

  if v_row.status = 'verified' then
    return jsonb_build_object('record_id', v_row.id, 'status', 'verified', 'society_id', v_row.society_id,
                              'flat_id', v_row.flat_id, 'membership_id', v_row.membership_id,
                              'refresh_required', false);
  end if;
  if v_row.status = 'needs_correction' then raise exception 'RECORD_UNDER_REVIEW'; end if;
  if v_row.status = 'rejected' then raise exception 'RECORD_REJECTED'; end if;

  v_residency := case v_row.resident_type
    when 'owner' then 'owner'::public.residency_kind
    when 'tenant' then 'tenant'::public.residency_kind
    else coalesce((select m.residency from public.society_memberships m
                    where m.flat_id = v_row.flat_id and m.status = 'active'
                      and m.resident_type in ('owner', 'tenant')
                    order by (m.resident_type = 'owner') desc limit 1), 'owner'::public.residency_kind)
  end;

  v_mem := app_private.link_member_to_flat(v_row.society_id, v_uid, v_row.flat_id, v_residency,
                                           v_row.resident_type, v_row.full_name);

  update public.resident_records
     set status = 'verified', user_id = v_uid, membership_id = v_mem,
         verified_at = coalesce(verified_at, now()), updated_at = now()
   where id = v_row.id;

  if v_row.resident_type = 'owner' then
    perform app_private.ensure_owner_row(v_row.society_id, v_row.flat_id, v_uid, v_row.full_name, v_row.phone10);
  elsif v_row.resident_type = 'family_member' then
    perform app_private.ensure_family_row(v_row.society_id, v_uid, v_row.flat_id, v_row.full_name,
                                          v_row.phone10, null);
  else
    -- The society itself listed this tenant, so the chain is already answered.
    update public.flat_tenants
       set status = 'active', activated_at = now(), membership_id = v_mem, owner_step_skipped = true, updated_at = now()
     where society_id = v_row.society_id and user_id = v_uid and flat_id = v_row.flat_id
       and status in ('registered', 'owner_approved', 'admin_approved');
    if not found then
      insert into public.flat_tenants
        (society_id, flat_id, user_id, full_name, status, owner_step_skipped, activated_at, membership_id)
      values (v_row.society_id, v_row.flat_id, v_uid, v_row.full_name, 'active', true, now(), v_mem)
      on conflict (flat_id, user_id) where status = 'active' do nothing;
    end if;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'resident.confirmed', 'resident_records', v_row.id,
          jsonb_build_object('flat_id', v_row.flat_id, 'resident_type', v_row.resident_type));

  return jsonb_build_object('record_id', v_row.id, 'status', 'verified', 'society_id', v_row.society_id,
                            'flat_id', v_row.flat_id, 'membership_id', v_mem, 'refresh_required', true);
end;
$$;
revoke all on function public.resident_confirm_record(uuid) from public, anon;
grant execute on function public.resident_confirm_record(uuid) to authenticated;

-- p_changes: any of full_name, email, resident_type, flat_label. Others are refused.
create or replace function app_private.clean_record_changes(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_out  jsonb := '{}'::jsonb;
  v_key  text;
  v_val  text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'INVALID_CHANGES'; end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('full_name', 'email', 'resident_type', 'flat_label') then
      raise exception 'INVALID_CHANGES';
    end if;
    v_val := nullif(trim(coalesce(p ->> v_key, '')), '');
    if v_val is null then continue; end if;
    if v_key = 'full_name' and char_length(v_val) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
    if v_key = 'email' and not app_private.valid_email(lower(v_val)) then raise exception 'INVALID_EMAIL'; end if;
    if v_key = 'resident_type' and v_val not in ('owner', 'tenant', 'family_member') then
      raise exception 'INVALID_RESIDENT_TYPE';
    end if;
    if v_key = 'flat_label' and char_length(v_val) > 40 then raise exception 'INVALID_CHANGES'; end if;
    v_out := v_out || jsonb_build_object(v_key, case when v_key = 'email' then lower(v_val) else v_val end);
  end loop;
  if v_out = '{}'::jsonb then raise exception 'INVALID_CHANGES'; end if;
  return v_out;
end;
$$;
revoke all on function app_private.clean_record_changes(jsonb) from public, anon, authenticated;

create or replace function public.resident_submit_correction(
  p_record_id uuid,
  p_changes   jsonb,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  public.resident_records;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  v_row := app_private.lock_my_record(p_record_id);
  if v_row.status not in ('pending', 'needs_correction') then raise exception 'RECORD_NOT_EDITABLE'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'INVALID_NOTE'; end if;

  update public.resident_records
     set status = 'needs_correction', proposed_changes = app_private.clean_record_changes(p_changes),
         correction_note = v_note, updated_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, auth.uid(), 'resident.correction_submitted', 'resident_records', v_row.id, '{}'::jsonb);

  return app_private.record_json(v_row, false);
end;
$$;
revoke all on function public.resident_submit_correction(uuid, jsonb, text) from public, anon;
grant execute on function public.resident_submit_correction(uuid, jsonb, text) to authenticated;

create or replace function public.resident_report_incorrect(p_record_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    public.resident_records;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  v_row := app_private.lock_my_record(p_record_id);
  if v_row.status not in ('pending', 'needs_correction') then raise exception 'RECORD_NOT_EDITABLE'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;

  update public.resident_records
     set status = 'needs_correction', reported_incorrect = true, correction_note = v_reason, updated_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, auth.uid(), 'resident.reported_incorrect', 'resident_records', v_row.id, '{}'::jsonb);

  return app_private.record_json(v_row, false);
end;
$$;
revoke all on function public.resident_report_incorrect(uuid, text) from public, anon;
grant execute on function public.resident_report_incorrect(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Managers
-- ---------------------------------------------------------------------------
create or replace function public.manager_list_resident_records(
  p_society_id    uuid,
  p_status        text default null,
  p_resident_type text default null,
  p_search        text default null,
  p_flat_id       uuid default null,
  p_batch_id      uuid default null,
  p_limit         int default 25,
  p_offset        int default 0
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
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_like   text;
  v_digits text;
begin
  perform app_private.assert_manager(p_society_id);
  if p_status is not null and p_status not in ('pending', 'verified', 'rejected', 'needs_correction') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_resident_type is not null and p_resident_type not in ('owner', 'tenant', 'family_member') then
    raise exception 'INVALID_RESIDENT_TYPE';
  end if;
  v_like := '%' || app_private.like_escape(v_search) || '%';
  v_digits := nullif(regexp_replace(coalesce(v_search, ''), '\D', '', 'g'), '');

  return (
    with f as (
      select r.* from public.resident_records r
       where r.society_id = p_society_id
         and (p_status is null or r.status = p_status)
         and (p_resident_type is null or r.resident_type = p_resident_type)
         and (p_flat_id is null or r.flat_id = p_flat_id)
         and (p_batch_id is null or r.batch_id = p_batch_id)
         and (v_search is null or r.full_name ilike v_like
              or (v_digits is not null and r.phone10 like '%' || v_digits || '%'))
    )
    select jsonb_build_object(
      'items', (
        select coalesce(jsonb_agg(app_private.record_json(p, true) order by p.created_at desc), '[]'::jsonb)
          from (select * from f order by f.created_at desc limit v_limit offset v_offset) p),
      'total', (select count(*) from f),
      'limit', v_limit, 'offset', v_offset,
      'counts', (
        select jsonb_build_object(
          'all', count(*),
          'pending', count(*) filter (where c.status = 'pending'),
          'verified', count(*) filter (where c.status = 'verified'),
          'rejected', count(*) filter (where c.status = 'rejected'),
          'needs_correction', count(*) filter (where c.status = 'needs_correction'))
          from public.resident_records c where c.society_id = p_society_id))
  );
end;
$$;
revoke all on function public.manager_list_resident_records(uuid, text, text, text, uuid, uuid, int, int) from public, anon;
grant execute on function public.manager_list_resident_records(uuid, text, text, text, uuid, uuid, int, int) to authenticated;

-- p_action: apply_changes | reject | reopen.
-- apply_changes uses p_changes when given, otherwise what the resident proposed;
-- p_flat_id moves the record to a flat chosen by the manager. The record returns to
-- pending, because the person must confirm what the record now says.
create or replace function public.manager_review_resident_record(
  p_record_id uuid,
  p_action    text,
  p_changes   jsonb default null,
  p_flat_id   uuid default null,
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_row     public.resident_records;
  v_changes jsonb;
  v_reason  text := trim(coalesce(p_reason, ''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.resident_records where id = p_record_id for update;
  if v_row.id is null or not app_private.is_society_manager(v_row.society_id) then
    raise exception 'RECORD_NOT_FOUND';
  end if;
  if v_row.status = 'verified' then raise exception 'RECORD_ALREADY_VERIFIED'; end if;

  if p_action = 'reject' then
    if char_length(v_reason) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;
    update public.resident_records
       set status = 'rejected', rejection_reason = v_reason, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
     where id = p_record_id
    returning * into v_row;

  elsif p_action = 'reopen' then
    if v_row.status = 'rejected' and exists (
      select 1 from public.resident_records r
       where r.society_id = v_row.society_id and r.phone10 = v_row.phone10
         and r.status <> 'rejected' and r.id <> v_row.id) then
      raise exception 'DUPLICATE_IN_DB';
    end if;
    update public.resident_records
       set status = 'pending', reported_incorrect = false, proposed_changes = null, correction_note = null,
           rejection_reason = null, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
     where id = p_record_id
    returning * into v_row;

  elsif p_action = 'apply_changes' then
    if v_row.status <> 'needs_correction' and p_changes is null and p_flat_id is null then
      raise exception 'NO_CHANGES_TO_APPLY';
    end if;
    v_changes := case when p_changes is not null then app_private.clean_record_changes(p_changes)
                      else coalesce(v_row.proposed_changes, '{}'::jsonb) end;
    if p_flat_id is not null and not exists (
      select 1 from public.flats f where f.id = p_flat_id and f.society_id = v_row.society_id) then
      raise exception 'FLAT_NOT_IN_SOCIETY';
    end if;
    update public.resident_records
       set full_name = coalesce(v_changes ->> 'full_name', full_name),
           email = coalesce(v_changes ->> 'email', email),
           resident_type = coalesce(v_changes ->> 'resident_type', resident_type),
           flat_id = coalesce(p_flat_id, flat_id),
           status = 'pending', proposed_changes = null, correction_note = null, reported_incorrect = false,
           reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
     where id = p_record_id
    returning * into v_row;

  else
    raise exception 'INVALID_ACTION';
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'resident.reviewed', 'resident_records', p_record_id,
          jsonb_build_object('action', p_action));

  return app_private.record_json(v_row, true);
end;
$$;
revoke all on function public.manager_review_resident_record(uuid, text, jsonb, uuid, text) from public, anon;
grant execute on function public.manager_review_resident_record(uuid, text, jsonb, uuid, text) to authenticated;

create or replace function public.manager_add_resident_record(
  p_society_id    uuid,
  p_flat_id       uuid,
  p_full_name     text,
  p_phone         text,
  p_resident_type text,
  p_email         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := app_private.norm_mobile(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_row   public.resident_records;
begin
  perform app_private.assert_manager(p_society_id);
  if not exists (select 1 from public.flats f where f.id = p_flat_id and f.society_id = p_society_id) then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_MOBILE'; end if;
  if p_resident_type not in ('owner', 'tenant', 'family_member') then raise exception 'INVALID_RESIDENT_TYPE'; end if;
  if v_email is not null and not app_private.valid_email(v_email) then raise exception 'INVALID_EMAIL'; end if;

  if exists (select 1 from public.society_memberships m
               join auth.users u on u.id = m.user_id
              where m.society_id = p_society_id and m.status in ('active', 'pending_review')
                and m.flat_id is not null and u.phone in ('91' || v_phone, '+91' || v_phone)) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.resident_records
    (society_id, flat_id, full_name, phone10, email, resident_type, source, created_by)
  values (p_society_id, p_flat_id, trim(p_full_name), v_phone, v_email, p_resident_type, 'manual', auth.uid())
  on conflict (society_id, phone10) where status <> 'rejected' do nothing
  returning * into v_row;
  if v_row.id is null then raise exception 'DUPLICATE_IN_DB'; end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, auth.uid(), 'resident.added', 'resident_records', v_row.id, '{}'::jsonb);

  return app_private.record_json(v_row, true);
end;
$$;
revoke all on function public.manager_add_resident_record(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.manager_add_resident_record(uuid, uuid, text, text, text, text) to authenticated;

-- Records that a manager took the copyable invitation. Nothing is sent, and this
-- returns sent:false so no caller can claim otherwise (Decision 5).
create or replace function public.manager_prepare_resident_invite(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.resident_records;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.resident_records where id = p_record_id for update;
  if v_row.id is null or not app_private.is_society_manager(v_row.society_id) then
    raise exception 'RECORD_NOT_FOUND';
  end if;
  if v_row.status = 'rejected' then raise exception 'RECORD_REJECTED'; end if;
  update public.resident_records set invite_prepared_at = now(), updated_at = now() where id = p_record_id;
  return jsonb_build_object('record_id', v_row.id, 'phone', v_row.phone10, 'full_name', v_row.full_name,
                            'flat_label', app_private.flat_label(v_row.flat_id), 'sent', false);
end;
$$;
revoke all on function public.manager_prepare_resident_invite(uuid) from public, anon;
grant execute on function public.manager_prepare_resident_invite(uuid) to authenticated;
