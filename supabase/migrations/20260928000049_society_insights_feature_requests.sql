-- ============================================================================
-- Staff society insights + feature requests
-- ----------------------------------------------------------------------------
-- 1. feature_requests — a society's authorities ask to ADD or REMOVE a paid
--    feature from their Society Dashboard; platform staff approve or decline
--    from the admin console. Approving applies the change through the same
--    admin_set_feature path (so it is logged and priced like any staff change).
-- 2. admin_society_history — one dated timeline of everything that happened to
--    a society (creation, authorities, features, requests, billing, payments,
--    residents joining), built from audit_log.
-- 3. admin_society_monthly — month by month since creation: which paid
--    features were on at the end of that month (or today, for the current
--    month), what each cost, the month's fee, and what changed that month.
--    Reconstructed from the 'feature.changed' audit trail; a feature with a
--    grant but no audit trail counts from its granted_at.
-- ============================================================================

create table if not exists public.feature_requests (
  id                uuid primary key default gen_random_uuid(),
  society_id        uuid not null references public.societies(id) on delete cascade,
  feature_key       text not null references public.platform_features(key) on delete cascade,
  action            text not null check (action in ('add', 'remove')),
  note              text check (note is null or char_length(note) <= 300),
  requested_by      uuid references auth.users(id) on delete set null,
  requested_by_name text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by        uuid references auth.users(id) on delete set null,
  decided_at        timestamptz,
  decision_note     text check (decision_note is null or char_length(decision_note) <= 300),
  created_at        timestamptz not null default now()
);
-- At most one open request per society + feature.
create unique index if not exists feature_requests_one_pending
  on public.feature_requests (society_id, feature_key) where status = 'pending';
create index if not exists feature_requests_society_idx
  on public.feature_requests (society_id, created_at desc);

alter table public.feature_requests enable row level security;

-- The society's authorities see their own requests; writes only via RPCs.
drop policy if exists feature_requests_authority_read on public.feature_requests;
create policy feature_requests_authority_read on public.feature_requests
  for select to authenticated
  using (
    society_id = public.current_society_id()
    and public.current_membership_role() in ('secretary', 'co_secretary')
  );
revoke insert, update, delete on public.feature_requests from anon, authenticated;
grant select on public.feature_requests to authenticated;

-- Is a feature currently on for a society? (core = always on)
create or replace function public._feature_enabled(p_society_id uuid, p_feature_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sf.enabled from public.society_features sf
      where sf.society_id = p_society_id and sf.feature_key = p_feature_key),
    (select f.is_core from public.platform_features f where f.key = p_feature_key),
    false);
$$;
revoke all on function public._feature_enabled(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- An authority asks to add or remove a paid feature.
-- ---------------------------------------------------------------------------
create or replace function public.request_feature_change(
  p_society_id uuid, p_feature_key text, p_action text, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid  uuid := auth.uid();
  v_core boolean;
  v_on   boolean;
  v_id   uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid and status = 'active'
      and role in ('secretary', 'co_secretary')
  ) then
    raise exception 'NOT_AUTHORITY';
  end if;
  if p_action not in ('add', 'remove') then raise exception 'INVALID_ACTION'; end if;

  select is_core into v_core from public.platform_features where key = p_feature_key;
  if v_core is null then raise exception 'UNKNOWN_FEATURE'; end if;
  if v_core then raise exception 'CORE_FEATURE'; end if;

  v_on := public._feature_enabled(p_society_id, p_feature_key);
  if p_action = 'add' and v_on then raise exception 'ALREADY_ENABLED'; end if;
  if p_action = 'remove' and not v_on then raise exception 'NOT_ENABLED'; end if;

  if exists (select 1 from public.feature_requests
              where society_id = p_society_id and feature_key = p_feature_key and status = 'pending') then
    raise exception 'ALREADY_REQUESTED';
  end if;

  select full_name into v_name from public.profiles where user_id = v_uid;

  insert into public.feature_requests
    (society_id, feature_key, action, note, requested_by, requested_by_name)
  values (p_society_id, p_feature_key, p_action,
          nullif(trim(coalesce(p_note, '')), ''), v_uid, v_name)
  returning id into v_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'feature.requested', 'feature_requests', v_id,
          jsonb_build_object('feature', p_feature_key, 'request', p_action,
                             'note', nullif(trim(coalesce(p_note, '')), '')));

  return jsonb_build_object('id', v_id);
end; $$;
grant execute on function public.request_feature_change(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff: list a society's requests (newest first).
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_feature_requests(p_society_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'feature_key', r.feature_key, 'feature_name', f.name,
      'list_price', f.price_monthly, 'action', r.action, 'note', r.note,
      'requested_by_name', r.requested_by_name, 'status', r.status,
      'decided_at', r.decided_at, 'decision_note', r.decision_note,
      'decided_by_name', (select p.full_name from public.profiles p where p.user_id = r.decided_by),
      'created_at', r.created_at
    ) order by (r.status = 'pending') desc, r.created_at desc), '[]'::jsonb)
    from public.feature_requests r
    join public.platform_features f on f.key = r.feature_key
    where r.society_id = p_society_id
  );
end; $$;
grant execute on function public.admin_society_feature_requests(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff: approve (applies the change) or decline a request.
-- ---------------------------------------------------------------------------
create or replace function public.admin_decide_feature_request(
  p_request_id uuid, p_approve boolean, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_req   public.feature_requests;
  v_price integer;
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  select * into v_req from public.feature_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_DECIDED'; end if;

  if p_approve then
    -- Keep any negotiated per-society price when switching.
    select price_override into v_price from public.society_features
     where society_id = v_req.society_id and feature_key = v_req.feature_key;
    perform public.admin_set_feature(v_req.society_id, v_req.feature_key,
                                     v_req.action = 'add', v_price);
  end if;

  update public.feature_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_req.society_id, auth.uid(),
          case when p_approve then 'feature.request_approved' else 'feature.request_declined' end,
          'feature_requests', p_request_id,
          jsonb_build_object('feature', v_req.feature_key, 'request', v_req.action,
                             'note', nullif(trim(coalesce(p_note, '')), '')));

  return jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end);
end; $$;
grant execute on function public.admin_decide_feature_request(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff: the society's full dated history (from audit_log).
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_history(p_society_id uuid, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return (
    select coalesce(jsonb_agg(e order by (e->>'at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', a.id, 'at', a.created_at, 'action', a.action, 'payload', a.payload,
        'actor_name', coalesce(p.full_name,
                        case when pa.user_id is not null then 'Parisar staff' end),
        'actor_is_staff', pa.user_id is not null,
        'feature_name', (select f.name from public.platform_features f
                          where f.key = a.payload->>'feature')
      ) as e
      from public.audit_log a
      left join public.profiles p on p.user_id = a.actor_id
      left join public.platform_admins pa on pa.user_id = a.actor_id
      where a.society_id = p_society_id
      order by a.created_at desc
      limit greatest(1, least(coalesce(p_limit, 300), 1000))
    ) t
  );
end; $$;
grant execute on function public.admin_society_history(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff: month-by-month features and fee since the society was created.
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_monthly(p_society_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_created timestamptz;
  v_month   date;
  v_cutoff  timestamptz;
  v_out     jsonb := '[]'::jsonb;
  v_items   jsonb;
  v_changes jsonb;
  v_fee     integer;
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  select created_at into v_created from public.societies where id = p_society_id;
  if v_created is null then raise exception 'SOCIETY_NOT_FOUND'; end if;

  for v_month in
    select generate_series(date_trunc('month', v_created)::date,
                           date_trunc('month', now())::date, interval '1 month')::date
  loop
    -- State at the end of the month; the current month uses "now".
    v_cutoff := least((v_month + interval '1 month') - interval '1 microsecond', now());

    with events as (
      select a.payload->>'feature' as feature_key,
             (a.payload->>'enabled')::boolean as enabled,
             nullif(a.payload->>'price_override', '')::integer as price_override,
             a.created_at,
             row_number() over (partition by a.payload->>'feature' order by a.created_at desc) as rn
      from public.audit_log a
      where a.society_id = p_society_id and a.action = 'feature.changed'
        and a.created_at <= v_cutoff
    ),
    latest as (select * from events where rn = 1),
    state as (
      select f.key, f.name, f.price_monthly,
             coalesce(
               l.enabled,
               -- no audit trail: fall back to the grant itself if it predates the cutoff
               (select sf.enabled from public.society_features sf
                 where sf.society_id = p_society_id and sf.feature_key = f.key
                   and sf.granted_at <= v_cutoff
                   and not exists (select 1 from public.audit_log a2
                                    where a2.society_id = p_society_id
                                      and a2.action = 'feature.changed'
                                      and a2.payload->>'feature' = f.key)),
               false) as enabled,
             coalesce(l.price_override,
               (select sf.price_override from public.society_features sf
                 where sf.society_id = p_society_id and sf.feature_key = f.key
                   and l.feature_key is null)) as price_override
      from public.platform_features f
      left join latest l on l.feature_key = f.key
      where not f.is_core
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', key, 'name', name,
             'price', coalesce(price_override, price_monthly)) order by name), '[]'::jsonb),
           coalesce(sum(coalesce(price_override, price_monthly)), 0)::integer
      into v_items, v_fee
      from state where enabled;

    select coalesce(jsonb_agg(jsonb_build_object(
             'key', a.payload->>'feature',
             'name', (select f.name from public.platform_features f where f.key = a.payload->>'feature'),
             'enabled', (a.payload->>'enabled')::boolean,
             'at', a.created_at) order by a.created_at), '[]'::jsonb)
      into v_changes
      from public.audit_log a
      where a.society_id = p_society_id and a.action = 'feature.changed'
        and a.created_at >= v_month and a.created_at < v_month + interval '1 month';

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'month', to_char(v_month, 'YYYY-MM'),
      'features', v_items, 'fee', v_fee, 'changes', v_changes,
      'is_current', v_month = date_trunc('month', now())::date));
  end loop;

  return v_out;
end; $$;
grant execute on function public.admin_society_monthly(uuid) to authenticated;
