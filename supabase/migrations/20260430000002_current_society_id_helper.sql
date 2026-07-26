-- Phase 1 — Foundation: current_society_id() helper
-- Per ARCHITECTURE.md lines 178-191. STABLE so the planner caches the result per-statement.

create or replace function public.current_society_id()
returns uuid
language sql
stable
security invoker
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'society_id',
    ''
  )::uuid
$$;

comment on function public.current_society_id() is
  'Returns the society_id from the requesting user''s JWT app_metadata. NULL when no JWT or no claim is present. Used by all RLS policies to enforce tenant isolation.';

-- Make the helper visible to PostgREST and to RLS evaluation contexts
grant execute on function public.current_society_id() to authenticated, anon, service_role;

-- Sister helper: current_membership_role() — used by policies that distinguish board members
-- from regular members (Phase 4+ will use this; declaring now so RLS migrations can reference it)
create or replace function public.current_membership_role()
returns text
language sql
stable
security invoker
as $$
  select current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'role'
$$;

comment on function public.current_membership_role() is
  'Returns the membership role from the requesting user''s JWT app_metadata: member | board_member | co_secretary | secretary. NULL when not authenticated.';

grant execute on function public.current_membership_role() to authenticated, anon, service_role;
