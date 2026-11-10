-- ============================================================================
-- Migration 074: phone search only when the search text is a phone number.
--
-- Both list RPCs stripped non-digits from ANY search text and matched the result
-- against phones, so searching "PR-8K9M-6K43" also matched every phone containing
-- "8964". Digits now count only when the whole text is phone-shaped.
-- ============================================================================

create or replace function app_private.search_digits(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when coalesce(p, '') ~ '^[+0-9 ()-]+$'
         and length(regexp_replace(p, '\D', '', 'g')) >= 3
      then regexp_replace(p, '\D', '', 'g')
  end
$$;
revoke all on function app_private.search_digits(text) from public, anon, authenticated;

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
  v_digits := app_private.search_digits(v_search);

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
  v_digits := app_private.search_digits(v_search);

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
