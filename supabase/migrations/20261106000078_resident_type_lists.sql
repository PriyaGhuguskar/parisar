-- ============================================================================
-- Migration 078: society-wide resident lists by resident type (staff-dashboards).
--
-- The Owners, Tenants and Family Members pages need one list per type across the
-- whole society. The existing RPCs are per flat (list_flat_owners) or cover only
-- the new tenant chain (manager_list_tenants), so people who joined through older
-- flows would be missing. This RPC unions both sources:
--
--   owner          flat_owners rows (app users and recorded co-owners), plus active
--                  owner memberships with no flat_owners row for that flat
--   tenant         flat_tenants rows (every chain status), plus active tenant
--                  memberships with no flat_tenants row for that user and flat
--   family_member  family_members rows (listed by a resident, claimed or not), plus
--                  active family_member memberships not linked to such a row
--
-- Manager only (assert_manager): resident names are not shown to platform staff.
-- No phone numbers are returned; the directory's audited reveal_phone stays the
-- only way to see one.
-- ============================================================================

create or replace function public.manager_list_society_residents(
  p_society_id    uuid,
  p_resident_type text,
  p_search        text default null,
  p_status        text default null,
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
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_like   text;
begin
  perform app_private.assert_manager(p_society_id);
  if p_resident_type is null or p_resident_type not in ('owner', 'tenant', 'family_member') then
    raise exception 'INVALID_RESIDENT_TYPE';
  end if;
  if v_status is not null and v_status not in
     ('active', 'not_on_app', 'registered', 'owner_approved', 'admin_approved', 'rejected') then
    raise exception 'INVALID_STATUS';
  end if;
  v_like := '%' || app_private.like_escape(v_search) || '%';

  return (
    with
    live as (
      select m.id, m.user_id, m.flat_id, m.joined_at, m.society_title, m.role, m.resident_type,
             p.full_name
        from public.society_memberships m
        left join public.profiles p on p.user_id = m.user_id
       where m.society_id = p_society_id and m.status = 'active' and m.flat_id is not null
    ),
    owners(id, source, full_name, flat_id, status, on_app, is_primary, verified, membership_number, since,
              relationship, added_by_name, agreement_end, police_status, society_title, created_at) as (
      select o.id, 'owner_record'::text as source, o.full_name, o.flat_id,
             case when l.id is not null then 'active' else 'not_on_app' end as status,
             (l.id is not null) as on_app, o.is_primary, (o.verified_at is not null) as verified,
             o.membership_number, o.ownership_start_date as since, null::text as relationship,
             null::text as added_by_name, null::date as agreement_end, null::text as police_status,
             app_private.effective_title(l.society_title, l.role) as society_title, o.created_at
        from public.flat_owners o
        left join live l on l.user_id = o.user_id and l.flat_id = o.flat_id
       where o.society_id = p_society_id
      union all
      select l.id, 'membership', coalesce(l.full_name, ''), l.flat_id, 'active', true, false, null,
             null, l.joined_at::date, null, null, null, null,
             app_private.effective_title(l.society_title, l.role), l.joined_at
        from live l
       where l.resident_type = 'owner'
         and not exists (select 1 from public.flat_owners o
                          where o.flat_id = l.flat_id and o.user_id = l.user_id)
    ),
    tenants(id, source, full_name, flat_id, status, on_app, is_primary, verified, membership_number, since,
              relationship, added_by_name, agreement_end, police_status, society_title, created_at) as (
      select t.id, 'tenant_record'::text, t.full_name, t.flat_id, t.status,
             true, false, null::boolean, null::text, t.agreement_start,
             null::text, null::text, t.agreement_end, t.police_status,
             app_private.effective_title(l.society_title, l.role), t.created_at
        from public.flat_tenants t
        left join live l on l.user_id = t.user_id and l.flat_id = t.flat_id and t.status = 'active'
       where t.society_id = p_society_id
      union all
      select l.id, 'membership', coalesce(l.full_name, ''), l.flat_id, 'active', true, false, null,
             null, l.joined_at::date, null, null, null, null,
             app_private.effective_title(l.society_title, l.role), l.joined_at
        from live l
       where l.resident_type = 'tenant'
         and not exists (select 1 from public.flat_tenants t
                          where t.flat_id = l.flat_id and t.user_id = l.user_id and t.status = 'active')
    ),
    family(id, source, full_name, flat_id, status, on_app, is_primary, verified, membership_number, since,
              relationship, added_by_name, agreement_end, police_status, society_title, created_at) as (
      select fm.id, 'family_record'::text, fm.full_name, head.flat_id,
             case when claimed.id is not null then 'active' else 'not_on_app' end,
             (claimed.id is not null), false, null::boolean, null::text, null::date,
             fm.relation, head_p.full_name, null::date, null::text,
             app_private.effective_title(claimed.society_title, claimed.role), head.joined_at
        from public.family_members fm
        join public.society_memberships head on head.id = fm.membership_id
        left join public.profiles head_p on head_p.user_id = head.user_id
        left join live claimed on claimed.user_id = fm.claimed_user_id
       where fm.society_id = p_society_id and head.flat_id is not null
      union all
      select l.id, 'membership', coalesce(l.full_name, ''), l.flat_id, 'active', true, false, null,
             null, l.joined_at::date, null, null, null, null,
             app_private.effective_title(l.society_title, l.role), l.joined_at
        from live l
       where l.resident_type = 'family_member'
         and not exists (select 1 from public.family_members fm
                          where fm.society_id = p_society_id and fm.claimed_user_id = l.user_id)
    ),
    picked as (
      select * from owners where p_resident_type = 'owner'
      union all select * from tenants where p_resident_type = 'tenant'
      union all select * from family where p_resident_type = 'family_member'
    ),
    f as (
      select x.*, app_private.flat_label(x.flat_id) as flat_label
        from picked x
    ),
    filtered as (
      select * from f
       where (v_status is null or f.status = v_status)
         and (v_search is null or f.full_name ilike v_like or coalesce(f.flat_label, '') ilike v_like
              or coalesce(f.membership_number, '') ilike v_like)
    )
    select jsonb_build_object(
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', p.id, 'source', p.source, 'resident_type', p_resident_type,
                  'full_name', p.full_name, 'flat_id', p.flat_id, 'flat_label', p.flat_label,
                  'status', p.status, 'on_app', p.on_app, 'is_primary', p.is_primary,
                  'verified', p.verified, 'membership_number', p.membership_number,
                  'since', p.since, 'relationship', p.relationship,
                  'added_by_name', p.added_by_name, 'agreement_end', p.agreement_end,
                  'police_status', p.police_status, 'society_title', p.society_title)
                  order by p.flat_label nulls last, p.full_name), '[]'::jsonb)
                  from (select * from filtered
                         order by flat_label nulls last, full_name, id
                         limit v_limit offset v_offset) p),
      'total', (select count(*) from filtered),
      'limit', v_limit, 'offset', v_offset)
  );
end;
$$;
revoke all on function public.manager_list_society_residents(uuid, text, text, text, int, int) from public, anon;
grant execute on function public.manager_list_society_residents(uuid, text, text, text, int, int) to authenticated;

-- Counts for the three tabs in one call, on the same rules as the list above.
create or replace function public.manager_resident_type_counts(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.assert_manager(p_society_id);
  return jsonb_build_object(
    'owner', (public.manager_list_society_residents(p_society_id, 'owner', null, null, 1, 0) ->> 'total')::int,
    'tenant', (public.manager_list_society_residents(p_society_id, 'tenant', null, null, 1, 0) ->> 'total')::int,
    'family_member', (public.manager_list_society_residents(p_society_id, 'family_member', null, null, 1, 0) ->> 'total')::int
  );
end;
$$;
revoke all on function public.manager_resident_type_counts(uuid) from public, anon;
grant execute on function public.manager_resident_type_counts(uuid) to authenticated;
