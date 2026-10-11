-- ============================================================================
-- Migration 055: logic + infra fixes from the 2026-10-11 code review
-- (CODE-REVIEW.md). Owned objects only — tenant lockdown (054) and auth (056)
-- are separate migrations; nothing here redefines their functions.
--
--   §1  C3   dev OTP objects (dev_send_sms / dev_peek_otp / dev_sms_otp) are
--            INERT unless app_private.dev_flags says otherwise. Only seed.sql
--            (local `supabase db reset`) sets that flag and re-grants
--            dev_peek_otp to anon. A deployed database never runs seed.sql.
--   §2  H1   push fan-out: random shared secret (x-webhook-secret) instead of
--            the constant x-push-trigger header; a push_outbox row per event
--            (proof of enqueue + idempotency claim for the Edge Functions);
--            the webhook body carries ids only.
--   §3  H9   svc_rate_limit_hit — generic service-role rate limiter (used by
--            moderate-image).
--   §4  M    svc_otp_request_try — atomic per-phone OTP limiter for send-sms.
--   §5  M    request_booking: NULL times rejected; ≤5 future pending per
--            user per amenity.
--   §6  M    add_facility_event: empty note no longer violates
--            notifications.body NOT NULL.
--   §7  M    visitors: resident_decide_visit race + 30-min expiry;
--            guard_create_visit throttle (30 / 10 min / guard) + live guard
--            status + lazy expiry sweep.
--   §8  M    report_content: one report per (target, reporter); auto-hide at
--            3 distinct reporters (board/secretary hide at once); 20/hour.
--   §9  M    raise_sos: 3 per 10 min per user.
--   §10 M    claim_guard(p_society_id default null): keeps existing profile
--            names; explicit society when one phone guards several.
--   §11 M    public lead forms (enrollment / sales): insert throttle.
--   §12 H    register_push_token / unregister_push_token (token moves to the
--            signed-in account).
--   §13 L    family_members.phone10 generated column + index.
--
-- Error codes are raised as plain `raise exception '<CODE>'` (P0001), the
-- convention every client wrapper already matches with message.includes().
-- ============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ============================================================================
-- §1  Dev OTP: inert outside local development
-- ============================================================================
create table if not exists app_private.dev_flags (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on app_private.dev_flags from public, anon, authenticated;

comment on table app_private.dev_flags is
  'LOCAL DEV ONLY switches. Rows are inserted ONLY by supabase/seed.sql (runs on local db reset). A deployed database must have no rows here.';

create or replace function app_private.dev_otp_enabled()
returns boolean
language sql
stable
security definer
set search_path = app_private, pg_temp
as $$
  select coalesce(
    (select enabled from app_private.dev_flags where key = 'dev_otp'),
    false
  );
$$;
revoke all on function app_private.dev_otp_enabled() from public, anon, authenticated;

-- The send_sms hook (local config.toml only). Outside local dev it refuses —
-- GoTrue surfaces the hook error, so a misconfigured deploy fails LOUDLY
-- instead of silently capturing OTPs into a table.
create or replace function public.dev_send_sms(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := event->'user'->>'phone';
  v_otp   text := event->'sms'->>'otp';
begin
  if not app_private.dev_otp_enabled() then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 500,
      'message', 'dev_send_sms is disabled: point [auth.hook.send_sms] at the send-sms Edge Function (see supabase/DEPLOY.md)'
    ));
  end if;
  if v_phone is not null and v_otp is not null then
    insert into public.dev_sms_otp (phone, otp, created_at)
    values ('+' || ltrim(v_phone, '+'), v_otp, now())
    on conflict (phone) do update set otp = excluded.otp, created_at = now();
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.dev_send_sms(jsonb) from public, anon, authenticated;
grant execute on function public.dev_send_sms(jsonb) to supabase_auth_admin;

-- Peek returns NULL unless the local flag is set. EXECUTE is revoked from
-- every client role here; seed.sql grants it back to anon/authenticated on a
-- local stack only (the login screen calls it before a session exists).
create or replace function public.dev_peek_otp(p_phone text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.otp
    from public.dev_sms_otp o
   where app_private.dev_otp_enabled()
     and o.phone = p_phone
     and o.created_at > now() - interval '10 minutes'
   limit 1;
$$;
revoke all on function public.dev_peek_otp(text) from public, anon, authenticated;

-- Anything captured before this migration is a credential; drop it.
delete from public.dev_sms_otp;

-- ============================================================================
-- §2  Push fan-out: shared secret + outbox + id-only webhook body
-- ============================================================================

-- Random per-database secret. Production copies THIS value into the Edge
-- Function secret FANOUT_WEBHOOK_SECRET (or sets both to a value of its own) —
-- see supabase/DEPLOY.md. seed.sql overrides it with the local dev value.
insert into app_private.runtime_config (key, value)
values ('fanout_webhook_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function app_private.fanout_webhook_secret()
returns text
language sql
stable
security definer
set search_path = app_private, pg_temp
as $$
  select nullif(value, '')
    from app_private.runtime_config
   where key = 'fanout_webhook_secret';
$$;
revoke all on function app_private.fanout_webhook_secret() from public, anon, authenticated;

-- One row per push event the database enqueued. The Edge Function claims the
-- row (processed_at null → now()) before sending: a forged, unknown or
-- replayed event finds nothing to claim and is skipped.
create table if not exists public.push_outbox (
  id           uuid primary key default gen_random_uuid(),
  event_kind   text not null check (event_kind in
                 ('complaint_response', 'notification', 'booking_decision', 'flat_action')),
  event_id     uuid not null,
  society_id   uuid references public.societies(id) on delete cascade,
  request_id   bigint,                 -- net.http_post request id
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  result       jsonb,
  unique (event_kind, event_id)
);
create index if not exists idx_push_outbox_created on public.push_outbox (created_at);

alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;
grant select, insert, update, delete on public.push_outbox to service_role;

comment on table public.push_outbox is
  'Push events enqueued by the notify_push_* triggers. Service role only. The fan-out Edge Functions claim a row before sending (idempotency + proof the event came from the DB).';

create or replace function app_private.enqueue_fanout(
  p_function   text,
  p_event_kind text,
  p_event_id   uuid,
  p_society_id uuid,
  p_table      text,
  p_op         text
)
returns void
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_outbox uuid;
  v_secret text := app_private.fanout_webhook_secret();
  v_req    bigint;
begin
  insert into public.push_outbox (event_kind, event_id, society_id)
  values (p_event_kind, p_event_id, p_society_id)
  on conflict (event_kind, event_id) do nothing
  returning id into v_outbox;

  if v_outbox is null then
    return;  -- this event was already enqueued once
  end if;

  if v_secret is null then
    -- Fail closed: never call the functions without the secret.
    update public.push_outbox
       set processed_at = now(),
           result = jsonb_build_object('skipped', 'no_webhook_secret')
     where id = v_outbox;
    raise warning 'push fan-out skipped: app_private.runtime_config fanout_webhook_secret is not set';
    return;
  end if;

  -- Body carries ids only; the function re-reads the row with the service role.
  select net.http_post(
    url     := app_private.functions_base_url() || '/' || p_function,
    body    := jsonb_build_object(
                 'type', p_op,
                 'table', p_table,
                 'event_kind', p_event_kind,
                 'record', jsonb_build_object('id', p_event_id)
               ),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', v_secret
               )
  ) into v_req;

  update public.push_outbox set request_id = v_req where id = v_outbox;
end;
$$;
revoke all on function app_private.enqueue_fanout(text, text, uuid, uuid, text, text)
  from public, anon, authenticated;

-- The four trigger functions (latest bodies: 20260701000011). Triggers
-- themselves are unchanged.
create or replace function public.notify_push_on_response()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.enqueue_fanout('push-fanout', 'complaint_response',
                                     NEW.id, NEW.society_id, TG_TABLE_NAME, TG_OP);
  return NEW;
end;
$$;

create or replace function public.notify_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.enqueue_fanout('notification-fanout', 'notification',
                                     NEW.id, NEW.society_id, TG_TABLE_NAME, TG_OP);
  return NEW;
end;
$$;

create or replace function public.notify_push_on_booking_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.enqueue_fanout('booking-ack-fanout', 'booking_decision',
                                     NEW.id, NEW.society_id, TG_TABLE_NAME, TG_OP);
  return NEW;
end;
$$;

create or replace function public.notify_push_on_flat_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.enqueue_fanout('flat-action-fanout', 'flat_action',
                                     NEW.id, NEW.society_id, TG_TABLE_NAME, TG_OP);
  return NEW;
end;
$$;

revoke execute on function public.notify_push_on_response()         from public, anon, authenticated;
revoke execute on function public.notify_push_on_notification()     from public, anon, authenticated;
revoke execute on function public.notify_push_on_booking_decision() from public, anon, authenticated;
revoke execute on function public.notify_push_on_flat_action()      from public, anon, authenticated;

-- ============================================================================
-- §3  Generic service-role rate limiter (Edge Functions)
-- ============================================================================
create table if not exists public.edge_rate_events (
  id         bigserial primary key,
  bucket     text not null,
  subject    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_edge_rate_events_lookup
  on public.edge_rate_events (bucket, subject, created_at desc);

alter table public.edge_rate_events enable row level security;
revoke all on public.edge_rate_events from anon, authenticated;
revoke all on sequence public.edge_rate_events_id_seq from anon, authenticated;

-- true = allowed (and counted); false = over the limit.
create or replace function public.svc_rate_limit_hit(
  p_bucket         text,
  p_subject        text,
  p_max            integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_bucket is null or p_subject is null or p_max is null or p_window_seconds is null
     or p_max < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;

  perform pg_advisory_xact_lock(hashtext('edge_rl:' || p_bucket || ':' || p_subject));

  delete from public.edge_rate_events
   where bucket = p_bucket and subject = p_subject
     and created_at < now() - interval '1 day';

  select count(*) into v_count
    from public.edge_rate_events
   where bucket = p_bucket and subject = p_subject
     and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.edge_rate_events (bucket, subject) values (p_bucket, p_subject);
  return true;
end;
$$;
revoke all on function public.svc_rate_limit_hit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.svc_rate_limit_hit(text, text, integer, integer) to service_role;

-- ============================================================================
-- §4  Atomic per-phone OTP limiter (send-sms hook)
-- ============================================================================
-- Replaces the count-then-insert in the Edge Function (racy, insert error
-- ignored). true = allowed and recorded; false = over the limit.
create or replace function public.svc_otp_request_try(
  p_phone          text,
  p_max            integer default 5,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_count integer;
begin
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if p_max is null or p_max < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;

  perform pg_advisory_xact_lock(hashtext('otp_rl:' || v_phone));

  select count(*) into v_count
    from public.otp_requests
   where phone = v_phone
     and requested_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.otp_requests (phone) values (v_phone);
  return true;
end;
$$;
revoke all on function public.svc_otp_request_try(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.svc_otp_request_try(text, integer, integer) to service_role;

-- ============================================================================
-- §5  request_booking — NULL guard + pending cap (latest body: 20260528000008)
-- ============================================================================
create or replace function public.request_booking(
  p_amenity_id uuid,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_purpose    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_caller_flat uuid;
  v_amenity     public.amenities%rowtype;
  v_booking_id  uuid;
  v_start_ist   time;
  v_end_ist     time;
  v_pending     integer;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- NULL bounds would build an unbounded tstzrange that blocks the amenity.
  if p_amenity_id is null or p_starts_at is null or p_ends_at is null then
    raise exception 'INVALID_TIME';
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;
  if v_caller_flat is null then raise exception 'NOT_ACTIVE_MEMBER'; end if;

  select * into v_amenity
  from public.amenities
  where id = p_amenity_id and society_id = v_society_id;
  if v_amenity.id is null then raise exception 'INVALID_AMENITY'; end if;

  if p_ends_at <= p_starts_at then raise exception 'TIME_ORDER'; end if;
  if p_starts_at < now() + interval '1 hour' then raise exception 'LEAD_TIME'; end if;
  if p_starts_at > now() + interval '30 days' then raise exception 'TOO_FAR'; end if;
  if p_ends_at - p_starts_at > interval '4 hours' then raise exception 'DURATION'; end if;

  v_start_ist := (p_starts_at at time zone 'Asia/Kolkata')::time;
  v_end_ist   := (p_ends_at   at time zone 'Asia/Kolkata')::time;
  if v_start_ist < v_amenity.open_time
     or v_end_ist > v_amenity.close_time
     or v_end_ist <= v_start_ist then
    raise exception 'OUTSIDE_HOURS';
  end if;

  -- At most 5 future pending requests per user per amenity (serialised so two
  -- concurrent requests cannot both slip under the cap).
  perform pg_advisory_xact_lock(hashtext('booking_pending:' || v_caller_id::text || ':' || p_amenity_id::text));
  select count(*) into v_pending
    from public.bookings b
   where b.requester_id = v_caller_id
     and b.amenity_id   = p_amenity_id
     and b.status       = 'pending'
     and upper(b.time_range) > now();
  if v_pending >= 5 then raise exception 'TOO_MANY_PENDING'; end if;

  insert into public.bookings (
    society_id, amenity_id, requester_id, requester_flat_id, time_range, purpose, status
  )
  values (
    v_society_id, p_amenity_id, v_caller_id, v_caller_flat,
    tstzrange(p_starts_at, p_ends_at, '[)'), p_purpose, 'pending'
  )
  returning id into v_booking_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'booking.requested', 'bookings', v_booking_id);

  return jsonb_build_object('booking_id', v_booking_id, 'society_id', v_society_id);
end;
$$;
revoke all on function public.request_booking(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.request_booking(uuid, timestamptz, timestamptz, text) to authenticated;

-- ============================================================================
-- §6  add_facility_event — empty note (latest body: 20260721000040)
-- ============================================================================
create or replace function public.add_facility_event(
  p_society_id uuid, p_category text, p_title text, p_note text, p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_title text := nullif(trim(p_title), '');
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_cat   public.facility_category;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_title is null then raise exception 'INVALID_TITLE'; end if;
  if p_starts_at is null then raise exception 'INVALID_TIME'; end if;
  begin v_cat := coalesce(p_category, 'other')::public.facility_category;
  exception when others then v_cat := 'other'; end;

  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid
      and role in ('secretary', 'co_secretary') and status = 'active'
  ) then raise exception 'NOT_SECRETARY'; end if;

  insert into public.facility_events (society_id, category, title, note, starts_at, created_by)
  values (p_society_id, v_cat, v_title, v_note, p_starts_at, v_uid)
  returning id into v_id;

  -- notifications.body is NOT NULL: fall back to the title when no note.
  insert into public.notifications (society_id, author_id, kind, category, title, body)
  values (p_society_id, v_uid, 'general', 'general', v_title, coalesce(v_note, v_title));

  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.add_facility_event(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.add_facility_event(uuid, text, text, text, timestamptz) to authenticated;

-- ============================================================================
-- §7  Visitors — decision race, expiry, guard throttle (latest: 20260721000037)
-- ============================================================================
-- New enum value; only used inside function bodies (run after commit).
alter type public.visitor_status add value if not exists 'expired';

create index if not exists idx_visitor_requests_guard_created
  on public.visitor_requests (guard_id, created_at desc);

create or replace function public.guard_create_visit(
  p_flat_id uuid, p_visitor_name text, p_visitor_phone text default null, p_purpose text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_soc    uuid := public.current_guard_society_id();
  v_name   text := nullif(trim(p_visitor_name), '');
  v_guard  uuid;
  v_recent integer;
  v_id     uuid;
begin
  if v_uid is null or v_soc is null then raise exception 'NOT_GUARD'; end if;

  -- Live check: a deactivated guard keeps the JWT claim for up to an hour.
  select id into v_guard
    from public.society_guards
   where user_id = v_uid and society_id = v_soc and status = 'active'
   limit 1;
  if v_guard is null then raise exception 'NOT_GUARD'; end if;

  if v_name is null then raise exception 'INVALID_VISITOR'; end if;
  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_soc) then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;

  -- Throttle: 30 requests per 10 minutes per guard.
  perform pg_advisory_xact_lock(hashtext('visit_rl:' || v_guard::text));
  select count(*) into v_recent
    from public.visitor_requests
   where guard_id = v_guard and created_at > now() - interval '10 minutes';
  if v_recent >= 30 then raise exception 'VISIT_RATE_LIMITED'; end if;

  -- Lazy expiry of stale pending requests for this society (30 minutes).
  update public.visitor_requests
     set status = 'expired'
   where society_id = v_soc
     and status = 'pending'
     and created_at < now() - interval '30 minutes';

  insert into public.visitor_requests (society_id, flat_id, guard_id, visitor_name, visitor_phone, purpose)
  values (v_soc, p_flat_id, v_guard, v_name,
          nullif(trim(coalesce(p_visitor_phone, '')), ''),
          nullif(trim(coalesce(p_purpose, '')), ''))
  returning id into v_id;

  return jsonb_build_object('request_id', v_id, 'status', 'pending');
end;
$$;
revoke all on function public.guard_create_visit(uuid, text, text, text) from public, anon;
grant execute on function public.guard_create_visit(uuid, text, text, text) to authenticated;

create or replace function public.resident_decide_visit(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_req  public.visitor_requests;
  v_new  public.visitor_status;
  v_rows integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_approve is null then raise exception 'INVALID_DECISION'; end if;

  select * into v_req from public.visitor_requests where id = p_request_id;
  if v_req.id is null then raise exception 'NOT_FOUND'; end if;

  if not exists (
    select 1 from public.society_memberships sm
     where sm.user_id = v_uid and sm.status = 'active'
       and sm.flat_id = v_req.flat_id and sm.society_id = v_req.society_id
  ) then raise exception 'NOT_YOUR_FLAT'; end if;

  if v_req.status <> 'pending' then raise exception 'ALREADY_DECIDED'; end if;
  if v_req.created_at < now() - interval '30 minutes' then
    raise exception 'VISIT_EXPIRED';
  end if;

  v_new := case when p_approve then 'approved'::public.visitor_status
                else 'denied'::public.visitor_status end;

  -- Compare-and-set: only the first decision wins.
  update public.visitor_requests
     set status = v_new, decided_at = now(), decided_by = v_uid
   where id = p_request_id and status = 'pending';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'ALREADY_DECIDED'; end if;

  return jsonb_build_object('request_id', p_request_id, 'status', v_new::text);
end;
$$;
revoke all on function public.resident_decide_visit(uuid, boolean) from public, anon;
grant execute on function public.resident_decide_visit(uuid, boolean) to authenticated;

-- ============================================================================
-- §8  report_content — dedupe, threshold, rate limit (latest: 20260529000009)
-- ============================================================================
-- Keep the earliest report per (target, reporter) before adding the constraint.
delete from public.reports r
 using public.reports r2
 where r.target_kind = r2.target_kind
   and r.target_id   = r2.target_id
   and r.reporter_id = r2.reporter_id
   and (r.created_at, r.id) > (r2.created_at, r2.id);

create unique index if not exists reports_one_per_reporter
  on public.reports (target_kind, target_id, reporter_id);
create index if not exists idx_reports_reporter_created
  on public.reports (reporter_id, created_at desc);

create or replace function public.report_content(
  p_target_kind public.report_target_kind,
  p_target_id   uuid,
  p_reason      text,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_reason     text := nullif(trim(coalesce(p_reason, '')), '');
  v_is_admin   boolean;
  v_report_id  uuid;
  v_recent     integer;
  v_reporters  integer;
  v_hidden     boolean;
  c_hide_threshold constant integer := 3;
  c_max_per_hour   constant integer := 20;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  select bool_or(sm.role in ('board_member', 'co_secretary', 'secretary'))
    into v_is_admin
    from public.society_memberships sm
   where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active';
  if v_is_admin is null then raise exception 'NOT_ACTIVE_MEMBER'; end if;

  if v_reason is null then raise exception 'INVALID_REASON'; end if;
  if p_target_kind is null or p_target_id is null then raise exception 'TARGET_NOT_FOUND'; end if;

  if p_target_kind = 'post' then
    if not exists (select 1 from public.posts where id = p_target_id and society_id = v_society_id) then
      raise exception 'TARGET_NOT_FOUND';
    end if;
  else
    if not exists (select 1 from public.post_comments where id = p_target_id and society_id = v_society_id) then
      raise exception 'TARGET_NOT_FOUND';
    end if;
  end if;

  -- Serialise this reporter (rate limit) and this target (threshold count).
  perform pg_advisory_xact_lock(hashtext('report_rl:' || v_caller_id::text));
  perform pg_advisory_xact_lock(hashtext('report_target:' || p_target_kind::text || ':' || p_target_id::text));

  select r.id into v_report_id
    from public.reports r
   where r.target_kind = p_target_kind and r.target_id = p_target_id
     and r.reporter_id = v_caller_id;

  if v_report_id is null then
    select count(*) into v_recent
      from public.reports
     where reporter_id = v_caller_id and created_at > now() - interval '1 hour';
    if v_recent >= c_max_per_hour then raise exception 'REPORT_RATE_LIMITED'; end if;

    insert into public.reports (society_id, target_kind, target_id, reporter_id, reason, note)
    values (v_society_id, p_target_kind, p_target_id, v_caller_id, v_reason, p_note)
    returning id into v_report_id;

    insert into public.moderation_events (society_id, event_kind, actor_id, target_kind, target_id, reason)
    values (v_society_id, 'report', v_caller_id, p_target_kind, p_target_id, v_reason);
  else
    -- Same reporter again: idempotent, no new row, no new hide vote.
    return jsonb_build_object(
      'report_id', v_report_id,
      'already_reported', true,
      'hidden', case when p_target_kind = 'post'
                  then (select hidden_at is not null from public.posts where id = p_target_id)
                  else (select hidden_at is not null from public.post_comments where id = p_target_id)
                end
    );
  end if;

  select count(distinct reporter_id) into v_reporters
    from public.reports
   where target_kind = p_target_kind and target_id = p_target_id;

  -- Board/secretary reports hide at once; members need 3 distinct reporters.
  if v_is_admin or v_reporters >= c_hide_threshold then
    if p_target_kind = 'post' then
      update public.posts set hidden_at = coalesce(hidden_at, now())
       where id = p_target_id and society_id = v_society_id;
    else
      update public.post_comments set hidden_at = coalesce(hidden_at, now())
       where id = p_target_id and society_id = v_society_id;
    end if;
  end if;

  if p_target_kind = 'post' then
    select hidden_at is not null into v_hidden from public.posts where id = p_target_id;
  else
    select hidden_at is not null into v_hidden from public.post_comments where id = p_target_id;
  end if;

  return jsonb_build_object(
    'report_id', v_report_id,
    'already_reported', false,
    'hidden', coalesce(v_hidden, false),
    'report_count', v_reporters
  );
end;
$$;
revoke all on function public.report_content(public.report_target_kind, uuid, text, text) from public, anon;
grant execute on function public.report_content(public.report_target_kind, uuid, text, text) to authenticated;

-- ============================================================================
-- §9  raise_sos — throttle (latest body: 20260721000043)
-- ============================================================================
create index if not exists idx_sos_alerts_raised_by_created
  on public.sos_alerts (raised_by, created_at desc);

create or replace function public.raise_sos(
  p_society_id uuid, p_description text, p_audience text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_desc   text := nullif(trim(p_description), '');
  v_aud    public.sos_audience;
  v_who    text;
  v_flat   text;
  v_recent integer;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_desc is null then raise exception 'INVALID_DESC'; end if;
  begin v_aud := coalesce(p_audience, 'all')::public.sos_audience;
  exception when others then v_aud := 'all'; end;

  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid and status = 'active'
  ) then raise exception 'NOT_A_MEMBER'; end if;

  -- Throttle: 3 alerts per 10 minutes per user.
  perform pg_advisory_xact_lock(hashtext('sos_rl:' || v_uid::text));
  select count(*) into v_recent
    from public.sos_alerts
   where raised_by = v_uid and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then raise exception 'SOS_RATE_LIMITED'; end if;

  select p.full_name into v_who from public.profiles p where p.user_id = v_uid;
  select nullif(concat_ws('-', w.name, f.number), '') into v_flat
    from public.society_memberships sm
    left join public.flats f on f.id = sm.flat_id
    left join public.wings w on w.id = f.wing_id
    where sm.user_id = v_uid and sm.society_id = p_society_id and sm.status = 'active'
    limit 1;

  insert into public.sos_alerts (society_id, raised_by, raised_by_name, raised_by_flat, description, audience)
  values (p_society_id, v_uid, v_who, v_flat, v_desc, v_aud)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.raise_sos(uuid, text, text) from public, anon;
grant execute on function public.raise_sos(uuid, text, text) to authenticated;

-- ============================================================================
-- §10 claim_guard(p_society_id) (latest body: 20260721000037)
-- ============================================================================
-- The zero-arg version is replaced by one with a defaulted parameter, so
-- `rpc('claim_guard')` with no args still resolves (and is not ambiguous).
drop function if exists public.claim_guard();

create or replace function public.claim_guard(p_society_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_guard public.society_guards;
  v_other integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '') into v_phone
    from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  -- Explicit society when given; otherwise the most recently added guard row.
  select * into v_guard
    from public.society_guards
   where phone = v_phone and status = 'active'
     and (user_id is null or user_id = v_uid)
     and (p_society_id is null or society_id = p_society_id)
   order by created_at desc
   limit 1;
  if v_guard.id is null then raise exception 'NOT_A_GUARD'; end if;

  update public.society_guards set user_id = v_uid where id = v_guard.id;

  -- Never overwrite a name the person already has.
  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, v_guard.name, '+91' || v_phone)
  on conflict (user_id) do update
    set full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name);

  select count(*) into v_other
    from public.society_guards
   where phone = v_phone and status = 'active' and id <> v_guard.id
     and (user_id is null or user_id = v_uid);

  return jsonb_build_object(
    'society_id', v_guard.society_id,
    'guard_id', v_guard.id,
    'other_societies', v_other
  );
end;
$$;
revoke all on function public.claim_guard(uuid) from public, anon;
grant execute on function public.claim_guard(uuid) to authenticated;

-- ============================================================================
-- §11 Public lead forms — insert throttle
-- ============================================================================
-- society_enrollment_requests (…014) and sales_applications (…047) accept anon
-- INSERTs. The open-per-phone unique index stops exact repeats; this caps the
-- volume: 60 per hour per table overall, 5 per hour per phone prefix
-- (+91 + first 5 digits). Service role / migrations are exempt.
create index if not exists idx_enrollment_created on public.society_enrollment_requests (created_at desc);
create index if not exists idx_sales_app_created  on public.sales_applications (created_at desc);

create or replace function app_private.throttle_public_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_total  integer;
  v_prefix integer;
begin
  if v_claims is null or v_claims ->> 'role' = 'service_role' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('lead_rl:' || tg_table_name));

  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''1 hour''',
    tg_table_name
  ) into v_total;
  if v_total >= 60 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''1 hour'' and left(phone, 8) = left($1, 8)',
    tg_table_name
  ) into v_prefix using new.phone;
  if v_prefix >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function app_private.throttle_public_lead() from public, anon, authenticated;

drop trigger if exists throttle_public_lead on public.society_enrollment_requests;
create trigger throttle_public_lead
  before insert on public.society_enrollment_requests
  for each row execute function app_private.throttle_public_lead();

drop trigger if exists throttle_public_lead on public.sales_applications;
create trigger throttle_public_lead
  before insert on public.sales_applications
  for each row execute function app_private.throttle_public_lead();

-- ============================================================================
-- §12 Push token registration that survives account switches
-- ============================================================================
-- push_tokens.expo_token is unique per device. A direct upsert by account B of
-- a token row owned by account A fails RLS (USING user_id = auth.uid()), so the
-- device kept pushing A's notifications after B signed in. This moves the token.
create or replace function public.register_push_token(
  p_token        text,
  p_platform     text,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_plat  text := lower(nullif(trim(coalesce(p_platform, '')), ''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_token is null or char_length(v_token) > 256 then raise exception 'INVALID_TOKEN'; end if;
  if v_plat is null or v_plat not in ('ios', 'android', 'web') then
    raise exception 'INVALID_PLATFORM';
  end if;

  insert into public.push_tokens (user_id, expo_token, platform, device_label, last_seen_at, notifications_enabled)
  values (v_uid, v_token, v_plat, nullif(trim(coalesce(p_device_label, '')), ''), now(), true)
  on conflict (expo_token) do update
    set user_id               = excluded.user_id,
        platform              = excluded.platform,
        device_label          = coalesce(excluded.device_label, public.push_tokens.device_label),
        last_seen_at          = now(),
        notifications_enabled = true;

  return jsonb_build_object('expo_token', v_token, 'user_id', v_uid);
end;
$$;
revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

create or replace function public.unregister_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.push_tokens
   where expo_token = nullif(trim(coalesce(p_token, '')), '')
     and user_id = v_uid;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ============================================================================
-- §13 Normalised phone column for suffix matching
-- ============================================================================
-- my_login_state (053) and claim_family_membership (028) match family phones by
-- suffix (`like '%' || v_phone`, right(regexp_replace(...))) — a seq scan.
-- 054/056 own those functions; they should switch to `fm.phone10 = v_phone`.
alter table public.family_members
  add column if not exists phone10 text
  generated always as (
    nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '')
  ) stored;

create index if not exists idx_family_members_phone10_unclaimed
  on public.family_members (phone10)
  where claimed_user_id is null;
