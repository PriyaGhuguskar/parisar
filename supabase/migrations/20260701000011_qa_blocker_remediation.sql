-- QA-AUDIT-REPORT.md remediation — batch 2 (security + integrity blockers).
-- Covers PAR-004, PAR-005, PAR-007, PAR-010, PAR-011.
--
-- All statements are idempotent (create or replace / drop-if-exists) so this
-- migration is safe to re-run against the local stack.

-- =====================================================================
-- PAR-005 — Configurable Edge Functions base URL (was hardcoded
--           http://host.docker.internal:54321 → dead in any deployed env).
-- A private key/value config table holds the base URL; the 4 push-trigger
-- functions read it. Local dev keeps the docker host as the seeded default;
-- production overrides the row (or the GUC fallback) once deployed.
-- =====================================================================
create schema if not exists app_private;

create table if not exists app_private.runtime_config (
  key   text primary key,
  value text not null
);
revoke all on app_private.runtime_config from anon, authenticated;

insert into app_private.runtime_config (key, value)
values ('functions_base_url', 'http://host.docker.internal:54321/functions/v1')
on conflict (key) do nothing;

create or replace function app_private.functions_base_url()
returns text
language sql
stable
security definer
set search_path = app_private, pg_temp
as $$
  select coalesce(
    (select value from app_private.runtime_config where key = 'functions_base_url'),
    current_setting('app.functions_base_url', true),
    'http://host.docker.internal:54321/functions/v1'
  );
$$;

-- Recreate the 4 push-trigger functions to read the base URL instead of a literal.
create or replace function public.notify_push_on_response()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := app_private.functions_base_url() || '/push-fanout';
begin
  v_payload := jsonb_build_object(
    'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW),
    'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
  );
  perform net.http_post(
    url := v_url, body := v_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-trigger', 'true')
  );
  return NEW;
end;
$$;

create or replace function public.notify_push_on_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := app_private.functions_base_url() || '/notification-fanout';
begin
  v_payload := jsonb_build_object(
    'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW),
    'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
  );
  perform net.http_post(
    url := v_url, body := v_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-trigger', 'true')
  );
  return NEW;
end;
$$;

create or replace function public.notify_push_on_booking_decision()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := app_private.functions_base_url() || '/booking-ack-fanout';
begin
  v_payload := jsonb_build_object(
    'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW), 'old_record', to_jsonb(OLD)
  );
  perform net.http_post(
    url := v_url, body := v_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-trigger', 'true')
  );
  return NEW;
end;
$$;

create or replace function public.notify_push_on_flat_action()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := app_private.functions_base_url() || '/flat-action-fanout';
begin
  v_payload := jsonb_build_object(
    'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW),
    'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
  );
  perform net.http_post(
    url := v_url, body := v_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-trigger', 'true')
  );
  return NEW;
end;
$$;

-- =====================================================================
-- PAR-004 — Phone number leaked in plaintext to every same-society member.
-- Column-level REVOKE so raw `phone` can NEVER be selected by a client
-- (crafted query or PostgREST embed). All phone access now flows through the
-- audited reveal_phone() SECURITY DEFINER RPC. Own-phone (join pre-fill) comes
-- from the session (auth.users.phone), not profiles.phone.
-- SECURITY DEFINER functions (reveal_phone, remove_member) still read phone.
-- =====================================================================
revoke select (phone) on public.profiles from authenticated;
revoke select (phone) on public.profiles from anon;

-- =====================================================================
-- PAR-007 — Poll-vote secrecy was UI-only: poll_votes SELECT exposed
-- (user_id, option_id) to every member. Restrict SELECT to the caller's OWN
-- vote; expose the aggregate tally via a SECURITY DEFINER RPC.
-- =====================================================================
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select"
  on public.poll_votes for select to authenticated
  using (society_id = public.current_society_id() and user_id = auth.uid());

create or replace function public.get_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_tally      jsonb;
  v_total      int;
  v_my_option  uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if not exists (
    select 1 from public.polls where id = p_poll_id and society_id = v_society_id
  ) then
    raise exception 'POLL_NOT_FOUND';
  end if;

  select coalesce(jsonb_object_agg(t.option_id, t.cnt), '{}'::jsonb),
         coalesce(sum(t.cnt), 0)
    into v_tally, v_total
  from (
    select option_id, count(*) as cnt
    from public.poll_votes
    where poll_id = p_poll_id
    group by option_id
  ) t;

  select option_id into v_my_option
  from public.poll_votes
  where poll_id = p_poll_id and user_id = v_caller_id;

  return jsonb_build_object(
    'poll_id',   p_poll_id,
    'my_option', v_my_option,
    'tally',     v_tally,
    'total',     v_total
  );
end;
$$;
grant execute on function public.get_poll_results(uuid) to authenticated;

-- =====================================================================
-- PAR-010 — remove_member could strand a society with no admin. Block
-- removing the LAST active secretary (self-removal or otherwise).
-- Recreated with the guard; body otherwise identical to Phase 3.
-- =====================================================================
create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_membership  record;
  v_user_id     uuid;
  v_phone_hash  text;
  v_caller_role text := public.current_membership_role();
  v_active_secretaries int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_caller_role not in ('secretary', 'co_secretary') then
    raise exception 'INSUFFICIENT_PRIVILEGES';
  end if;

  select * into v_membership
  from public.society_memberships
  where id = p_membership_id and society_id = public.current_society_id();
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  -- PAR-010 guard: do not allow removing the last active admin (secretary or
  -- co-secretary) — that would orphan the society (no one can rotate the code,
  -- transfer the role, or work the review queue).
  if v_membership.role in ('secretary', 'co_secretary')
     and v_membership.status = 'active' then
    select count(*) into v_active_secretaries
    from public.society_memberships
    where society_id = public.current_society_id()
      and role in ('secretary', 'co_secretary')
      and status = 'active'
      and id <> p_membership_id;
    if v_active_secretaries = 0 then
      raise exception 'LAST_SECRETARY';
    end if;
  end if;

  v_user_id := v_membership.user_id;

  update public.society_memberships set status = 'deleted' where id = p_membership_id;
  delete from public.family_members where membership_id = p_membership_id;

  if not exists (
    select 1 from public.society_memberships
    where user_id = v_user_id and status = 'active' and id <> p_membership_id
  ) then
    v_phone_hash := 'REDACTED-' || encode(extensions.digest(
      coalesce((select phone from public.profiles where user_id = v_user_id), '')::bytea,
      'sha256'::text
    ), 'hex');
    update public.profiles
      set full_name = '[REDACTED]', phone = v_phone_hash
      where user_id = v_user_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (public.current_society_id(), auth.uid(), 'member.removed',
          'society_memberships', p_membership_id,
          jsonb_build_object('user_id', v_user_id, 'redacted', not exists (
            select 1 from public.society_memberships
            where user_id = v_user_id and status = 'active' and id <> p_membership_id
          )));
end;
$$;

-- =====================================================================
-- PAR-011 — Complaint status had no state machine: 'open' was a legal
-- response kind and resolved_at was never cleared when a resolved complaint
-- transitioned back out of resolved. Recreated claim_complaint +
-- add_complaint_response with: (a) reject 'open' as a response kind,
-- (b) resolved_at reflects the CURRENT status (set on resolve, cleared otherwise).
-- =====================================================================
create or replace function public.claim_complaint(
  p_complaint_id  uuid,
  p_response_kind public.complaint_status,
  p_free_text     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_role        text := public.current_membership_role();
  v_updated     public.complaints%rowtype;
  v_response_id uuid;
  v_caller_flat uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  -- PAR-011: 'open' is the initial state, never a response kind.
  if p_response_kind = 'open' then raise exception 'INVALID_RESPONSE_KIND'; end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
  limit 1;

  update public.complaints
     set owner_id    = v_caller_id,
         status      = p_response_kind,
         claimed_at  = now(),
         resolved_at = case when p_response_kind = 'resolved' then now() else null end
   where id = p_complaint_id and society_id = v_society_id and owner_id is null
  returning * into v_updated;

  if v_updated.id is null then return null; end if;

  insert into public.complaint_responses (
    society_id, complaint_id, responder_id, responder_flat_id, response_kind, free_text
  )
  values (v_society_id, p_complaint_id, v_caller_id, v_caller_flat, p_response_kind, p_free_text)
  returning id into v_response_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_caller_id, 'complaint.claimed', 'complaints', p_complaint_id,
          jsonb_build_object('response_kind', p_response_kind, 'response_id', v_response_id));

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.add_complaint_response(
  p_complaint_id  uuid,
  p_response_kind public.complaint_status,
  p_free_text     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_response_id uuid;
  v_caller_flat uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  -- PAR-011: 'open' is the initial state, never a response kind.
  if p_response_kind = 'open' then raise exception 'INVALID_RESPONSE_KIND'; end if;

  if not exists (
    select 1 from public.complaints
    where id = p_complaint_id and society_id = v_society_id and owner_id = v_caller_id
  ) then
    raise exception 'NOT_OWNER';
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
  limit 1;

  update public.complaints
     set status      = p_response_kind,
         -- PAR-011: resolved_at tracks the CURRENT status — set on resolve,
         -- cleared when the status moves back out of resolved (no stale timestamp).
         resolved_at = case when p_response_kind = 'resolved' then now() else null end
   where id = p_complaint_id and society_id = v_society_id;

  insert into public.complaint_responses (
    society_id, complaint_id, responder_id, responder_flat_id, response_kind, free_text
  )
  values (v_society_id, p_complaint_id, v_caller_id, v_caller_flat, p_response_kind, p_free_text)
  returning id into v_response_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_caller_id, 'complaint.responded', 'complaints', p_complaint_id,
          jsonb_build_object('response_kind', p_response_kind, 'response_id', v_response_id));

  return v_response_id;
end;
$$;
