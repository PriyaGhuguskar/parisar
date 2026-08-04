-- ============================================================================
-- Guest / visitor management — dedicated Guard login + resident approve/deny.
-- ----------------------------------------------------------------------------
-- A guard at the gate raises a visit request against a flat; the flat's
-- residents get it live and Approve or Deny; the decision + timestamp are logged.
--
-- ISOLATION (the crux): a guard must NEVER see resident data (complaints,
-- directory, notices…). We do NOT give guards a society_membership. Instead the
-- Auth Hook gives them a SEPARATE claim `guard_society_id` (not `society_id`),
-- so current_society_id() stays NULL for a guard and every existing resident RLS
-- policy denies them by construction — no policy needs patching. Visitor tables
-- use current_guard_society_id() for guard access.
-- ============================================================================

-- ---- Tables ---------------------------------------------------------------

create table if not exists public.society_guards (
  id         uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  phone      text not null,                    -- bare 10-digit, matched on login
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  unique (society_id, phone)
);
create index if not exists idx_society_guards_user on public.society_guards(user_id);
create index if not exists idx_society_guards_society on public.society_guards(society_id);

comment on table public.society_guards is
  'Gate guards for a society. A guard is NOT a society member — they get a separate JWT claim and only ever touch visitor_requests.';

do $$ begin
  create type public.visitor_status as enum ('pending', 'approved', 'denied', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.visitor_requests (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references public.societies(id) on delete cascade,
  flat_id       uuid not null references public.flats(id) on delete cascade,
  guard_id      uuid references public.society_guards(id) on delete set null,
  visitor_name  text not null,
  visitor_phone text,
  purpose       text,
  status        public.visitor_status not null default 'pending',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null
);
create index if not exists idx_visitor_requests_flat on public.visitor_requests(flat_id, status);
create index if not exists idx_visitor_requests_society on public.visitor_requests(society_id, created_at desc);

comment on table public.visitor_requests is
  'A guard-raised gate request for a flat. Residents of the flat approve/deny; the decision is logged with attribution.';

-- ---- JWT helpers ----------------------------------------------------------

create or replace function public.current_guard_society_id()
returns uuid
language sql
stable
security invoker
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'guard_society_id',
    ''
  )::uuid
$$;
comment on function public.current_guard_society_id() is
  'Society a gate guard belongs to, from JWT app_metadata.guard_society_id. NULL for residents. Used only by visitor RLS + guard RPCs.';

grant execute on function public.current_guard_society_id() to authenticated, anon, service_role;

-- ---- Auth Hook: also inject guard claims ----------------------------------
-- Residents keep society_id + role from their membership. A user with NO active
-- membership who IS an active guard gets guard_society_id + role='guard' — and
-- crucially NOT society_id, so resident RLS stays closed to them.

create or replace function public.inject_society_claims(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  active_membership record;
  v_guard_society uuid;
  claims jsonb;
begin
  v_user_id := (event->>'user_id')::uuid;
  claims := coalesce(event->'claims', '{}'::jsonb);

  select sm.society_id, sm.role::text
    into active_membership
    from public.society_memberships sm
    where sm.user_id = v_user_id
      and sm.status = 'active'
    order by sm.joined_at desc
    limit 1;

  if active_membership.society_id is not null then
    claims := jsonb_set(
      claims, '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
             'society_id', active_membership.society_id::text,
             'role', active_membership.role
           ),
      true
    );
  else
    -- No membership — are they a guard?
    select sg.society_id into v_guard_society
      from public.society_guards sg
      where sg.user_id = v_user_id and sg.status = 'active'
      limit 1;

    if v_guard_society is not null then
      claims := jsonb_set(
        claims, '{app_metadata}',
        coalesce(claims->'app_metadata', '{}'::jsonb)
          || jsonb_build_object(
               'society_id', null,               -- deliberately null: resident RLS stays closed
               'role', 'guard',
               'guard_society_id', v_guard_society::text
             ),
        true
      );
    else
      claims := jsonb_set(
        claims, '{app_metadata}',
        coalesce(claims->'app_metadata', '{}'::jsonb)
          || jsonb_build_object('society_id', null, 'role', null),
        true
      );
    end if;
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

grant execute on function public.inject_society_claims(jsonb) to supabase_auth_admin;
revoke execute on function public.inject_society_claims(jsonb) from authenticated, anon, public;
-- The hook now also reads society_guards.
grant select on public.society_guards to supabase_auth_admin;

-- ---- RLS ------------------------------------------------------------------

alter table public.society_guards enable row level security;
alter table public.visitor_requests enable row level security;

-- society_guards: the society's secretary/co-sec manage; a guard reads their own row.
create policy society_guards_secretary on public.society_guards
  for all to authenticated
  using (
    exists (select 1 from public.society_memberships m
             where m.society_id = society_guards.society_id and m.user_id = auth.uid()
               and m.role in ('secretary', 'co_secretary') and m.status = 'active')
  )
  with check (
    exists (select 1 from public.society_memberships m
             where m.society_id = society_guards.society_id and m.user_id = auth.uid()
               and m.role in ('secretary', 'co_secretary') and m.status = 'active')
  );

create policy society_guards_self on public.society_guards
  for select to authenticated
  using (user_id = auth.uid());

-- visitor_requests: guard sees their society's requests (for realtime); residents
-- see requests for their own flat. All writes go through SECURITY DEFINER RPCs.
create policy visitor_requests_guard_read on public.visitor_requests
  for select to authenticated
  using (society_id = public.current_guard_society_id());

create policy visitor_requests_resident_read on public.visitor_requests
  for select to authenticated
  using (
    flat_id in (select sm.flat_id from public.society_memberships sm
                 where sm.user_id = auth.uid() and sm.status = 'active')
  );

-- Secretary/co-sec can also see their society's gate activity (oversight).
create policy visitor_requests_secretary_read on public.visitor_requests
  for select to authenticated
  using (society_id = public.current_society_id());

-- ---- Realtime -------------------------------------------------------------
alter publication supabase_realtime add table public.visitor_requests;
