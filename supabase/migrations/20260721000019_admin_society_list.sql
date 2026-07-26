-- ============================================================================
-- Staff console read models
-- ----------------------------------------------------------------------------
-- The console needs to see EVERY society. Every policy on societies,
-- society_codes and society_memberships is tenant-scoped (tenant_select_*),
-- which is correct and must stay that way — it is the wall that stops one
-- society reading another's data.
--
-- WHY RPCs INSTEAD OF "ADMIN CAN SELECT" POLICIES:
-- adding an admin exception to those policies would put the entire tenant
-- boundary behind a single is_platform_admin() check. If that check were ever
-- wrong, or an admin account were compromised, the leak would be every society's
-- residents and phone numbers through ordinary PostgREST queries.
--
-- A SECURITY DEFINER function is a narrow door instead of a wider wall: it
-- returns exactly the columns the console renders, nothing selectable, nothing
-- joinable. Note what is deliberately ABSENT — no resident names, no resident
-- phone numbers. Staff can see that a society has 42 members; they cannot
-- enumerate who those people are.
-- ============================================================================

create or replace function public.admin_list_societies()
returns table (
  id              uuid,
  name            text,
  address         text,
  code            text,
  secretary_phone text,
  member_count    bigint,
  pending_count   bigint,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_PLATFORM_ADMIN';
  end if;

  return query
  select
    s.id,
    s.name,
    s.address,
    c.code,
    s.secretary_phone,
    (select count(*) from public.society_memberships m
      where m.society_id = s.id and m.status = 'active'),
    (select count(*) from public.society_memberships m
      where m.society_id = s.id and m.status = 'pending_review'),
    s.created_at
  from public.societies s
  left join public.society_codes c
    on c.society_id = s.id and c.revoked_at is null
  order by s.created_at desc;
end;
$$;

grant execute on function public.admin_list_societies() to authenticated;

comment on function public.admin_list_societies() is
  'Staff console: every society with its live code and member counts. Deliberately excludes resident names and phone numbers — staff can see a society has members, not who they are.';

-- ---------------------------------------------------------------------------
-- Headline numbers for the console. Cheap counts, one round trip.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_PLATFORM_ADMIN';
  end if;

  return jsonb_build_object(
    'societies',      (select count(*) from public.societies),
    'residents',      (select count(*) from public.society_memberships where status = 'active'),
    'open_requests',  (select count(*) from public.society_enrollment_requests
                        where status in ('new','contacted')),
    'urgent_requests',(select count(*) from public.society_enrollment_requests
                        where status in ('new','contacted') and call_now is true)
  );
end;
$$;

grant execute on function public.admin_stats() to authenticated;

comment on function public.admin_stats() is
  'Staff console headline counts. Aggregates only — no per-society or per-resident detail.';
