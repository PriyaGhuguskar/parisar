-- ============================================================================
-- Platform admin: the team that fields enrollment requests and creates societies
-- ----------------------------------------------------------------------------
-- Societies are no longer self-service. The flow is:
--
--   1. chairman submits society_enrollment_requests (public form)
--   2. admin calls them back in the chosen slot
--   3. admin creates the society, naming the first person as secretary
--   4. a join code is generated and handed over on that call
--
-- Nothing in the schema could express "admin" until now. This adds the smallest
-- honest version of it.
--
-- WHY A TABLE AND NOT A JWT CLAIM: a claim would have to be minted by the auth
-- hook, which means privilege lives in a token that is refreshed on a timer —
-- revoking an admin would leave them privileged until their token rolled over.
-- A table is checked on every call, so removing a row removes access instantly.
--
-- WHY NOT REUSE membership_role: those roles are scoped to ONE society and are
-- granted by that society's chairman. A platform admin is orthogonal — they
-- belong to no society and are appointed by us. Overloading the enum would have
-- let a chairman accidentally mint a platform admin.
-- ============================================================================

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- No policy at all: this table is readable and writable ONLY by the service
-- role. An admin cannot see the admin list, and crucially cannot add another
-- admin — that stays a deliberate act performed out of band. Self-service
-- privilege escalation is the failure mode this prevents.
revoke all on public.platform_admins from anon, authenticated;

comment on table public.platform_admins is
  'Parisar staff who triage enrollment requests and create societies. Service-role only: admins cannot enumerate or appoint other admins.';

-- ---------------------------------------------------------------------------
-- is_platform_admin() — stable helper used by RLS and the RPC below.
-- SECURITY DEFINER so it can read platform_admins, which authenticated cannot.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

grant execute on function public.is_platform_admin() to authenticated;

comment on function public.is_platform_admin() is
  'True when the caller is Parisar staff. Checked live on every call, so revoking access is immediate.';

-- ---------------------------------------------------------------------------
-- Admins can now read and triage the enrollment queue. This was deliberately
-- left out of the enrollment migration because no admin role existed yet;
-- inventing one there would have been a security decision in the wrong file.
-- ---------------------------------------------------------------------------
create policy enrollment_admin_read
  on public.society_enrollment_requests
  for select to authenticated
  using (public.is_platform_admin());

create policy enrollment_admin_update
  on public.society_enrollment_requests
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant select on public.society_enrollment_requests to authenticated;
grant update (status, notes, handled_by, society_id, updated_at)
  on public.society_enrollment_requests to authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_society — step 3 of the flow.
--
-- Mirrors create_society_with_secretary, with one crucial difference: the
-- secretary is named by PARAMETER rather than taken from auth.uid(), because
-- the admin is not the secretary. The phone is stored on societies.secretary_phone,
-- which the existing auto-elevation path already reads when that person first
-- signs in — so this deliberately does NOT create an auth user out of band.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_society(
  p_name            text,
  p_address         text,
  p_secretary_name  text,
  p_secretary_phone text,
  p_request_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id   uuid := auth.uid();
  v_society_id uuid;
  v_code       text;
begin
  if v_admin_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  if p_name is null or length(trim(p_name)) < 3 or length(p_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if p_address is null or length(trim(p_address)) < 10 or length(p_address) > 500 then
    raise exception 'INVALID_ADDRESS';
  end if;
  if p_secretary_name is null or length(trim(p_secretary_name)) < 2 then
    raise exception 'INVALID_SECRETARY_NAME';
  end if;
  -- Bare 10-digit Indian mobile, matching the existing convention on societies.
  if p_secretary_phone is null or p_secretary_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_SECRETARY_PHONE';
  end if;

  insert into public.societies (name, address, secretary_phone)
  values (trim(p_name), trim(p_address), p_secretary_phone)
  returning id into v_society_id;

  v_code := public.generate_society_code();
  insert into public.society_codes (code, society_id) values (v_code, v_society_id);

  -- Close the loop on the lead, if this came from one.
  if p_request_id is not null then
    update public.society_enrollment_requests
       set status = 'approved',
           society_id = v_society_id,
           handled_by = v_admin_id,
           updated_at = now()
     where id = p_request_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_admin_id, 'society.created_by_admin', 'societies', v_society_id,
          jsonb_build_object(
            'name', trim(p_name),
            'secretary_name', trim(p_secretary_name),
            'secretary_phone', p_secretary_phone,
            'request_id', p_request_id
          ));

  return jsonb_build_object('society_id', v_society_id, 'code', v_code);
end;
$$;

grant execute on function public.admin_create_society(text, text, text, text, uuid) to authenticated;

comment on function public.admin_create_society(text, text, text, text, uuid) is
  'Platform-admin only. Creates a society, generates its join code, and records the named secretary by phone for auto-elevation on first sign-in.';
