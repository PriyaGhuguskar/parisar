-- ============================================================================
-- Migration 060: "Connect With Us" requests.
--
-- Extends society_enrollment_requests with several authority numbers, email,
-- alternative slot, message, a human-readable request code and a status
-- lifecycle. Public submission goes through a rate-limited RPC that returns only
-- the code, slot and status; nothing a visitor submits can be read back without
-- the code AND the phone that submitted it.
--
-- The direct anon INSERT grant (014/017) is kept while apps/web/EnrollForm still
-- uses it. Those rows get a request code from the trigger below and status 'new'.
-- Once the form moves to submit_connect_request the grant should be revoked.
-- ============================================================================

alter table public.society_enrollment_requests
  add column if not exists request_code      text,
  add column if not exists email             text,
  add column if not exists authority_numbers jsonb not null default '[]'::jsonb,
  add column if not exists alternate_at      timestamptz,
  add column if not exists message           text,
  add column if not exists scheduled_at      timestamptz,
  add column if not exists called_at         timestamptz,
  add column if not exists called_by         uuid references auth.users(id) on delete set null,
  add column if not exists rejected_reason   text,
  add column if not exists rejected_at       timestamptz,
  add column if not exists registered_at     timestamptz,
  add column if not exists reschedule_count  int not null default 0;

alter table public.society_enrollment_requests
  drop constraint if exists enrollment_email_len,
  drop constraint if exists enrollment_message_len,
  drop constraint if exists enrollment_rejected_reason_len,
  drop constraint if exists enrollment_authority_numbers_array;
alter table public.society_enrollment_requests
  add constraint enrollment_email_len check (email is null or char_length(email) <= 254),
  add constraint enrollment_message_len check (message is null or char_length(message) <= 1000),
  add constraint enrollment_rejected_reason_len check (rejected_reason is null or char_length(rejected_reason) <= 500),
  add constraint enrollment_authority_numbers_array check (jsonb_typeof(authority_numbers) = 'array');

-- ---------------------------------------------------------------------------
-- Request code: PR-XXXX-XXXX, same unambiguous alphabet as society codes.
-- ---------------------------------------------------------------------------
create or replace function app_private.generate_request_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  charset  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_chars  text;
  v_bytes  bytea;
  v_pos    int;
  v_b      int;
  attempts int := 0;
begin
  loop
    v_chars := '';
    v_bytes := extensions.gen_random_bytes(32);
    v_pos := 0;
    while char_length(v_chars) < 8 loop
      if v_pos >= 32 then
        v_bytes := extensions.gen_random_bytes(32);
        v_pos := 0;
      end if;
      v_b := get_byte(v_bytes, v_pos);
      v_pos := v_pos + 1;
      if v_b < 248 then   -- 31 * 8: no modulo bias
        v_chars := v_chars || substr(charset, (v_b % 31) + 1, 1);
      end if;
    end loop;
    v_chars := 'PR-' || substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);
    if not exists (select 1 from public.society_enrollment_requests where request_code = v_chars) then
      return v_chars;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then raise exception 'REQUEST_CODE_UNAVAILABLE'; end if;
  end loop;
end;
$$;
revoke all on function app_private.generate_request_code() from public, anon, authenticated;

create or replace function app_private.enrollment_set_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.request_code := app_private.generate_request_code();
  return new;
end;
$$;
revoke all on function app_private.enrollment_set_code() from public, anon, authenticated;

drop trigger if exists enrollment_set_code_trg on public.society_enrollment_requests;
create trigger enrollment_set_code_trg
  before insert on public.society_enrollment_requests
  for each row execute function app_private.enrollment_set_code();

update public.society_enrollment_requests
   set request_code = app_private.generate_request_code()
 where request_code is null;

alter table public.society_enrollment_requests alter column request_code set not null;
create unique index if not exists society_enrollment_request_code_key
  on public.society_enrollment_requests (request_code);

-- Legacy 'approved' rows are registered; the society link already says so.
update public.society_enrollment_requests
   set registered_at = coalesce(registered_at, updated_at)
 where status = 'approved';

-- ---------------------------------------------------------------------------
-- One open request per phone now spans the new open statuses.
-- ---------------------------------------------------------------------------
drop index if exists public.society_enrollment_open_per_phone;
create unique index society_enrollment_open_per_phone
  on public.society_enrollment_requests (phone)
  where status in ('new', 'contacted', 'call_scheduled', 'rescheduled');

drop index if exists public.society_enrollment_queue_order;
create index society_enrollment_queue_order
  on public.society_enrollment_requests (call_now desc, preferred_at asc)
  where status in ('new', 'contacted', 'call_scheduled', 'rescheduled');

-- ---------------------------------------------------------------------------
-- JSON shapes
-- ---------------------------------------------------------------------------
create or replace function app_private.connect_status(p public.enrollment_status)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p = 'approved' then 'registered' else p::text end
$$;
revoke all on function app_private.connect_status(public.enrollment_status) from public, anon, authenticated;

create or replace function app_private.connect_request_json(r public.society_enrollment_requests)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id,
    'request_code', r.request_code,
    'society_name', r.society_name,
    'contact_name', r.contact_name,
    'phone', r.phone,
    'email', r.email,
    'authority_numbers', r.authority_numbers,
    'status', app_private.connect_status(r.status),
    'call_now', r.call_now,
    'preferred_at', r.preferred_at,
    'preferred_slot', r.preferred_slot,
    'alternate_at', r.alternate_at,
    'scheduled_at', r.scheduled_at,
    'message', r.message,
    'called_at', r.called_at,
    'rejected_reason', r.rejected_reason,
    'rejected_at', r.rejected_at,
    'registered_at', r.registered_at,
    'reschedule_count', r.reschedule_count,
    'society_id', r.society_id,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )
$$;
revoke all on function app_private.connect_request_json(public.society_enrollment_requests) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC: submit. Rate limited per phone (3/hour) and per address (10/hour), on
-- top of throttle_public_lead (60/hour overall, 5/hour per phone prefix).
-- A phone with an open request gets {error: REQUEST_ALREADY_OPEN} and no code, so
-- knowing a number never reveals an existing request.
-- ---------------------------------------------------------------------------
create or replace function public.submit_connect_request(
  p_society_name      text,
  p_contact_name      text,
  p_phone             text,
  p_email             text default null,
  p_authority_numbers jsonb default '[]'::jsonb,
  p_preferred_at      timestamptz default null,
  p_call_now          boolean default false,
  p_alternate_at      timestamptz default null,
  p_message           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_society text := trim(coalesce(p_society_name, ''));
  v_contact text := trim(coalesce(p_contact_name, ''));
  v_phone   text := app_private.norm_mobile(p_phone);
  v_email   text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_now     boolean := coalesce(p_call_now, false);
  v_list    jsonb;
  v_item    jsonb;
  v_num     text;
  v_seen    text[];
  v_slot    text;
  v_row     public.society_enrollment_requests;
begin
  if char_length(v_society) not between 2 and 120 then raise exception 'INVALID_SOCIETY_NAME'; end if;
  if char_length(v_contact) not between 2 and 80 then raise exception 'INVALID_CONTACT_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if v_email is not null and not app_private.valid_email(v_email) then raise exception 'INVALID_EMAIL'; end if;
  if v_message is not null and char_length(v_message) > 1000 then raise exception 'INVALID_MESSAGE'; end if;

  -- Primary contact is always the first authority number.
  v_list := jsonb_build_array(jsonb_build_object('name', v_contact, 'phone', v_phone));
  v_seen := array[v_phone];
  if p_authority_numbers is not null then
    if jsonb_typeof(p_authority_numbers) <> 'array' or jsonb_array_length(p_authority_numbers) > 5 then
      raise exception 'INVALID_AUTHORITY_NUMBERS';
    end if;
    for v_item in select * from jsonb_array_elements(p_authority_numbers) loop
      if jsonb_typeof(v_item) <> 'object' then raise exception 'INVALID_AUTHORITY_NUMBERS'; end if;
      v_num := app_private.norm_mobile(v_item ->> 'phone');
      if v_num is null then raise exception 'INVALID_AUTHORITY_NUMBER'; end if;
      if v_num = any (v_seen) then continue; end if;
      if char_length(trim(coalesce(v_item ->> 'name', ''))) > 80 then
        raise exception 'INVALID_AUTHORITY_NUMBERS';
      end if;
      v_seen := v_seen || v_num;
      v_list := v_list || jsonb_build_object(
        'name', nullif(trim(coalesce(v_item ->> 'name', '')), ''), 'phone', v_num);
    end loop;
  end if;

  if v_now then
    v_slot := 'Call me now';
  else
    if p_preferred_at is null then raise exception 'SLOT_REQUIRED'; end if;
    v_slot := to_char(p_preferred_at at time zone 'Asia/Kolkata', 'Dy, DD Mon YYYY, HH12:MI AM');
    if p_alternate_at is not null and (
         p_alternate_at < now() - interval '2 minutes'
         or p_alternate_at > now() + interval '90 days'
         or p_alternate_at = p_preferred_at) then
      raise exception 'INVALID_ALTERNATE_SLOT';
    end if;
  end if;

  perform app_private.assert_rate('rpc:connect:ip', app_private.caller_ip(), 10, 3600);
  perform app_private.assert_rate('rpc:connect:phone', v_phone, 3, 3600);

  if exists (select 1 from public.society_enrollment_requests r
              where r.phone = '+91' || v_phone
                and r.status in ('new', 'contacted', 'call_scheduled', 'rescheduled')) then
    return jsonb_build_object('error', 'REQUEST_ALREADY_OPEN');
  end if;

  begin
    insert into public.society_enrollment_requests (
      society_name, contact_name, phone, preferred_slot, preferred_at, call_now, status,
      email, authority_numbers, alternate_at, message, scheduled_at
    )
    values (
      v_society, v_contact, '+91' || v_phone, v_slot,
      case when v_now then null else p_preferred_at end, v_now,
      case when v_now then 'new' else 'call_scheduled' end::public.enrollment_status,
      v_email, v_list, case when v_now then null else p_alternate_at end, v_message,
      case when v_now then null else p_preferred_at end
    )
    returning * into v_row;
  exception when unique_violation then
    return jsonb_build_object('error', 'REQUEST_ALREADY_OPEN');
  end;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (null, auth.uid(), 'connect.submitted', 'society_enrollment_requests', v_row.id,
          jsonb_build_object('to', v_row.status));

  return jsonb_build_object(
    'request_code', v_row.request_code,
    'status', app_private.connect_status(v_row.status),
    'call_now', v_row.call_now,
    'preferred_at', v_row.preferred_at,
    'preferred_slot', v_row.preferred_slot,
    'alternate_at', v_row.alternate_at,
    'scheduled_at', v_row.scheduled_at,
    'created_at', v_row.created_at
  );
end;
$$;
revoke all on function public.submit_connect_request(text, text, text, text, jsonb, timestamptz, boolean, timestamptz, text)
  from public;
grant execute on function public.submit_connect_request(text, text, text, text, jsonb, timestamptz, boolean, timestamptz, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PUBLIC: status lookup. Needs the code AND the phone; a wrong pair is
-- indistinguishable from no request. Returns no society or contact details.
-- ---------------------------------------------------------------------------
create or replace function public.get_connect_request_status(p_request_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text := upper(trim(coalesce(p_request_code, '')));
  v_phone text := app_private.norm_mobile(p_phone);
  v_row   public.society_enrollment_requests;
begin
  perform app_private.assert_rate('rpc:connect_status:ip', app_private.caller_ip(), 30, 600);
  perform app_private.assert_rate('rpc:connect_status:code', v_code, 10, 600);

  select * into v_row from public.society_enrollment_requests r
   where r.request_code = v_code and r.phone = '+91' || coalesce(v_phone, '');
  if v_row.id is null then
    return jsonb_build_object('error', 'REQUEST_NOT_FOUND');
  end if;

  return jsonb_build_object(
    'request_code', v_row.request_code,
    'status', app_private.connect_status(v_row.status),
    'call_now', v_row.call_now,
    'preferred_at', v_row.preferred_at,
    'preferred_slot', v_row.preferred_slot,
    'alternate_at', v_row.alternate_at,
    'scheduled_at', v_row.scheduled_at,
    'created_at', v_row.created_at
  );
end;
$$;
revoke all on function public.get_connect_request_status(text, text) from public;
grant execute on function public.get_connect_request_status(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- STAFF: list with search, filter, pagination.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_connect_requests(
  p_search text default null,
  p_status text default null,
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_limit  int default 25,
  p_offset int default 0
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
  v_status text[];
  v_items  jsonb;
  v_total  bigint;
begin
  perform app_private.assert_platform_staff();

  if p_status is not null then
    if p_status not in ('new', 'call_scheduled', 'rescheduled', 'contacted', 'rejected', 'registered', 'open') then
      raise exception 'INVALID_STATUS';
    end if;
    v_status := case p_status
      when 'registered' then array['registered', 'approved']
      when 'open' then array['new', 'contacted', 'call_scheduled', 'rescheduled']
      else array[p_status] end;
  end if;

  v_like := '%' || app_private.like_escape(v_search) || '%';
  v_digits := nullif(regexp_replace(coalesce(v_search, ''), '\D', '', 'g'), '');

  with f as (
    select r.* from public.society_enrollment_requests r
     where (v_status is null or r.status::text = any (v_status))
       and (p_from is null or r.created_at >= p_from)
       and (p_to is null or r.created_at <= p_to)
       and (v_search is null
            or r.request_code ilike v_like
            or r.society_name ilike v_like
            or r.contact_name ilike v_like
            or coalesce(r.email, '') ilike v_like
            or (v_digits is not null and r.phone like '%' || v_digits || '%'))
  )
  select
    (select count(*) from f),
    coalesce((
      select jsonb_agg(app_private.connect_request_json(p) order by
               p.status in ('new', 'contacted', 'call_scheduled', 'rescheduled') desc,
               p.call_now desc,
               coalesce(p.scheduled_at, p.preferred_at) asc nulls last,
               p.created_at desc)
        from (
          select * from f
           order by f.status in ('new', 'contacted', 'call_scheduled', 'rescheduled') desc,
                    f.call_now desc,
                    coalesce(f.scheduled_at, f.preferred_at) asc nulls last,
                    f.created_at desc
           limit v_limit offset v_offset
        ) p
    ), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$$;
revoke all on function public.admin_list_connect_requests(text, text, timestamptz, timestamptz, int, int) from public, anon;
grant execute on function public.admin_list_connect_requests(text, text, timestamptz, timestamptz, int, int) to authenticated;

create or replace function public.admin_get_connect_request(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.society_enrollment_requests;
begin
  perform app_private.assert_platform_staff();
  select * into v_row from public.society_enrollment_requests where id = p_request_id;
  if v_row.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;

  return app_private.connect_request_json(v_row) || jsonb_build_object(
    'notes', v_row.notes,
    'society', (
      select jsonb_build_object('id', s.id, 'name', s.name,
               'code', (select c.code from public.society_codes c
                         where c.society_id = s.id and c.revoked_at is null limit 1))
        from public.societies s where s.id = v_row.society_id),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'action', a.action,
               'actor_name', p.full_name,
               'payload', a.payload,
               'at', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
        from public.audit_log a
        left join public.profiles p on p.user_id = a.actor_id
       where a.target_table = 'society_enrollment_requests' and a.target_id = v_row.id)
  );
end;
$$;
revoke all on function public.admin_get_connect_request(uuid) from public, anon;
grant execute on function public.admin_get_connect_request(uuid) to authenticated;

-- Lock an open request or raise.
create or replace function app_private.lock_open_connect_request(p_request_id uuid)
returns public.society_enrollment_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.society_enrollment_requests;
begin
  select * into v_row from public.society_enrollment_requests where id = p_request_id for update;
  if v_row.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_row.status not in ('new', 'contacted', 'call_scheduled', 'rescheduled') then
    raise exception 'REQUEST_CLOSED';
  end if;
  return v_row;
end;
$$;
revoke all on function app_private.lock_open_connect_request(uuid) from public, anon, authenticated;

create or replace function public.admin_reschedule_connect_request(
  p_request_id   uuid,
  p_scheduled_at timestamptz,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  public.society_enrollment_requests;
  v_next public.enrollment_status;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform app_private.assert_platform_staff();
  v_row := app_private.lock_open_connect_request(p_request_id);

  if p_scheduled_at is null then raise exception 'SLOT_REQUIRED'; end if;
  if p_scheduled_at < now() - interval '2 minutes' then raise exception 'SLOT_IN_PAST'; end if;
  if p_scheduled_at > now() + interval '90 days' then raise exception 'SLOT_TOO_FAR'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;

  -- First slot on a "call me now" request is a schedule, not a reschedule.
  v_next := case when v_row.status = 'new' and v_row.scheduled_at is null
                 then 'call_scheduled' else 'rescheduled' end::public.enrollment_status;

  update public.society_enrollment_requests
     set status = v_next,
         scheduled_at = p_scheduled_at,
         reschedule_count = reschedule_count + (case when v_next = 'rescheduled' then 1 else 0 end),
         handled_by = auth.uid(),
         updated_at = now()
   where id = p_request_id
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (null, auth.uid(), 'connect.rescheduled', 'society_enrollment_requests', p_request_id,
          jsonb_build_object('scheduled_at', p_scheduled_at, 'note', v_note, 'to', v_next));

  return app_private.connect_request_json(v_row);
end;
$$;
revoke all on function public.admin_reschedule_connect_request(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_reschedule_connect_request(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_reject_connect_request(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    public.society_enrollment_requests;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  perform app_private.assert_platform_staff();
  v_row := app_private.lock_open_connect_request(p_request_id);
  if char_length(v_reason) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;

  update public.society_enrollment_requests
     set status = 'rejected', rejected_reason = v_reason, rejected_at = now(),
         handled_by = auth.uid(), updated_at = now()
   where id = p_request_id
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (null, auth.uid(), 'connect.rejected', 'society_enrollment_requests', p_request_id,
          jsonb_build_object('reason', v_reason));

  return app_private.connect_request_json(v_row);
end;
$$;
revoke all on function public.admin_reject_connect_request(uuid, text) from public, anon;
grant execute on function public.admin_reject_connect_request(uuid, text) to authenticated;

create or replace function public.admin_mark_connect_called(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  public.society_enrollment_requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform app_private.assert_platform_staff();
  v_row := app_private.lock_open_connect_request(p_request_id);
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;

  update public.society_enrollment_requests
     set status = 'contacted', called_at = now(), called_by = auth.uid(),
         handled_by = auth.uid(), updated_at = now()
   where id = p_request_id
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (null, auth.uid(), 'connect.called', 'society_enrollment_requests', p_request_id,
          jsonb_build_object('note', v_note));

  return app_private.connect_request_json(v_row);
end;
$$;
revoke all on function public.admin_mark_connect_called(uuid, text) from public, anon;
grant execute on function public.admin_mark_connect_called(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- STAFF: dashboard metrics.
-- ---------------------------------------------------------------------------
create or replace function public.admin_onboarding_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.assert_platform_staff();
  return jsonb_build_object(
    'total_societies', (select count(*) from public.societies),
    'active_societies', (select count(*) from public.societies where service_status = 'active'),
    'pending_requests', (select count(*) from public.society_enrollment_requests
                          where status in ('new', 'contacted', 'call_scheduled', 'rescheduled')),
    'pending_calls', (select count(*) from public.society_enrollment_requests
                       where status in ('new', 'call_scheduled', 'rescheduled')),
    'total_residents', (select count(distinct m.user_id) from public.society_memberships m
                         where m.status = 'active')
  );
end;
$$;
revoke all on function public.admin_onboarding_metrics() from public, anon;
grant execute on function public.admin_onboarding_metrics() to authenticated;

-- admin_stats (026): open/urgent counts now span the new open statuses. Everything
-- else is unchanged.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_admin boolean := public.is_platform_admin();
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return jsonb_build_object(
    'societies',       (select count(*) from public.societies),
    'residents',       (select count(*) from public.society_memberships where status='active'),
    'open_requests',   (select count(*) from public.society_enrollment_requests
                         where status in ('new','contacted','call_scheduled','rescheduled')),
    'urgent_requests', (select count(*) from public.society_enrollment_requests
                         where status in ('new','contacted','call_scheduled','rescheduled') and call_now is true),
    'is_admin',        v_admin,
    'mrr',      case when v_admin then (select coalesce(sum(monthly_amount),0) from public.society_billing where status='active') else null end,
    'past_due', case when v_admin then (select count(*) from public.society_billing where status='past_due') else null end
  );
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
