-- Phase 1 — Foundation: Enable RLS + tenant isolation policies on every tenant-scoped table.
-- Per ARCHITECTURE.md Pattern 1 + PITFALLS.md Pitfall 1.
-- Uses public.current_society_id() from migration 20260430000002.

-- ============== Enable RLS ==============
alter table public.societies            enable row level security;
alter table public.society_codes        enable row level security;
alter table public.wings                enable row level security;
alter table public.flats                enable row level security;
alter table public.profiles             enable row level security;
alter table public.society_memberships  enable row level security;
alter table public.family_members       enable row level security;
alter table public.push_tokens          enable row level security;

-- ============== Tenant isolation policies ==============
-- For every table that has society_id, the policy is identical:
-- a row is visible to / writable by a user iff society_id = current_society_id().

-- societies — slightly special: the society's own row is keyed on id, not society_id.
create policy "tenant_select_societies"
  on public.societies for select to authenticated
  using (id = public.current_society_id());

create policy "tenant_insert_societies"
  on public.societies for insert to authenticated
  with check (id = public.current_society_id());

create policy "tenant_update_societies"
  on public.societies for update to authenticated
  using (id = public.current_society_id())
  with check (id = public.current_society_id());

-- society_codes
create policy "tenant_all_society_codes"
  on public.society_codes for all to authenticated
  using (society_id = public.current_society_id())
  with check (society_id = public.current_society_id());

-- wings
create policy "tenant_all_wings"
  on public.wings for all to authenticated
  using (society_id = public.current_society_id())
  with check (society_id = public.current_society_id());

-- flats
create policy "tenant_all_flats"
  on public.flats for all to authenticated
  using (society_id = public.current_society_id())
  with check (society_id = public.current_society_id());

-- profiles — keyed on user_id (a profile is the user's own).
-- A user can read their own profile + profiles of members in their current society.
create policy "self_select_profile"
  on public.profiles for select to authenticated
  using (user_id = auth.uid());

create policy "society_select_profile"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.society_memberships sm
      where sm.user_id = public.profiles.user_id
        and sm.society_id = public.current_society_id()
        and sm.status = 'active'
    )
  );

create policy "self_insert_profile"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "self_update_profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- society_memberships
create policy "tenant_all_memberships"
  on public.society_memberships for all to authenticated
  using (society_id = public.current_society_id())
  with check (society_id = public.current_society_id());

-- family_members
create policy "tenant_all_family_members"
  on public.family_members for all to authenticated
  using (society_id = public.current_society_id())
  with check (society_id = public.current_society_id());

-- push_tokens — keyed on user_id (NOT society_id; tokens are per-device-per-user).
create policy "self_all_push_tokens"
  on public.push_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============== Custom Access Token Hook (Postgres function) ==============
-- This Postgres function is referenced by supabase/config.toml [auth.hook.custom_access_token].
-- Runs on EVERY token issue and refresh (per ARCHITECTURE.md line 754).
-- Inputs the auth event JSON, outputs the modified claims.
-- Per Supabase docs: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
--
-- B-02 fix: local variable named v_user_id (not user_id) to avoid the
-- inject_society_claims.user_id self-reference ambiguity.
create or replace function public.inject_society_claims(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  active_membership record;
  claims jsonb;
begin
  v_user_id := (event->>'user_id')::uuid;
  claims := coalesce(event->'claims', '{}'::jsonb);

  -- Look up the user's active membership.
  -- v1 model: a user has at most one ACTIVE membership at a time.
  -- (Multi-society support is v2; the schema supports it but the hook picks the most recent.)
  select sm.society_id, sm.role::text
    into active_membership
    from public.society_memberships sm
    where sm.user_id = v_user_id
      and sm.status = 'active'
    order by sm.joined_at desc
    limit 1;

  if active_membership.society_id is null then
    -- No active membership yet (e.g. user just signed up but hasn't joined a society).
    -- Set explicit nulls so the claim is well-formed; RLS will deny everything (fail-closed).
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb)
        || jsonb_build_object('society_id', null, 'role', null),
      true
    );
  else
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
             'society_id', active_membership.society_id::text,
             'role', active_membership.role
           ),
      true
    );
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

comment on function public.inject_society_claims(jsonb) is
  'Custom Access Token Auth Hook. Injects society_id and role into JWT app_metadata on EVERY sign-in and refresh. Per ARCHITECTURE.md Anti-Pattern 7 — fires on refresh too.';

-- Required Supabase Auth Hooks grants (per Supabase docs):
grant execute on function public.inject_society_claims(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.inject_society_claims(jsonb) from authenticated, anon, public;

-- The function reads society_memberships; grant SELECT on the relevant columns.
grant select on public.society_memberships to supabase_auth_admin;
