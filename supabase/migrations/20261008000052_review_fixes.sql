-- Migration 052: fixes from the 2026-10-08 code review.
--
--  #1  bootstrap_society_structure accepts co-secretaries too (the web sent a
--      flat-less co-secretary to /setup/structure, which only let secretaries in
--      — an endless redirect).
--  #2  A paused society code no longer locks out the society's own flat-less
--      authority: onboard_flats_for_code / onboard_resident let them finish
--      onboarding. Everyone else still gets CODE_PAUSED; a blocked society
--      still gets SOCIETY_BLOCKED.
--  #3  dev_sms_otp (dev OTPs) was readable/writable by anon + authenticated.
--      Only the auth service and the SECURITY DEFINER helpers need it.
--  #4  admin_set_feature: the price floor only applies when turning a feature
--      ON, so approving a "remove" request with an old negotiated price works.
--  #5  admin_society_history: billing.* / payment.* rows are admin-only (sales
--      were seeing them, contrary to migration 026).
--  #6  my_society_service_status reports the society in the caller's token (the
--      one RLS actually uses), not just their newest membership.
--  #7  Stop/Block now also stops writes made through SECURITY DEFINER functions
--      that check membership directly: a trigger on every activity table refuses
--      writes for a paused/blocked society (staff, service role and SOS exempt;
--      onboarding tables exempt so joining still works while paused).
--  #8  RLS policies call current_society_id() / current_membership_role() via
--      (select …) so Postgres evaluates them once per query, not once per row.
--  #10 get_dashboard_summary(p_view) — an authority's home asks for the
--      resident view ('member') so its resident tiles get real previews.

-- ---------------------------------------------------------------- #3
revoke all on public.dev_sms_otp from anon, authenticated;
alter table public.dev_sms_otp enable row level security;

-- ---------------------------------------------------------------- #10 (signature change)
drop function if exists public.get_dashboard_summary();

-- ---------------------------------------------------------------- #1 #2 #4 #5 #10
CREATE OR REPLACE FUNCTION public.bootstrap_society_structure(p_society_id uuid, p_wings jsonb, p_flats jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id   uuid := auth.uid();
  v_entitled  boolean;
  v_wing_id   uuid;
  v_name      text;
  v_flat      jsonb;
  v_wing_map  jsonb := '{}'::jsonb;
  v_wings_out jsonb := '[]'::jsonb;
  v_flats_out jsonb := '[]'::jsonb;
  v_flat_id   uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Entitled = the audit-log creator (old self-serve flow) OR the society's
  -- current active secretary (admin-created flow).
  select
    exists (select 1 from public.audit_log
             where society_id = p_society_id and actor_id = v_user_id and action = 'society.created')
    or exists (select 1 from public.society_memberships
                where society_id = p_society_id and user_id = v_user_id
                  and role in ('secretary', 'co_secretary') and status = 'active')
  into v_entitled;
  if not v_entitled then raise exception 'NOT_SOCIETY_CREATOR'; end if;

  for v_name in select jsonb_array_elements_text(jsonb_path_query_array(p_wings, '$[*].name'))
  loop
    insert into public.wings (society_id, name) values (p_society_id, v_name)
    returning id into v_wing_id;
    v_wing_map := v_wing_map || jsonb_build_object(v_name, v_wing_id);
    v_wings_out := v_wings_out || jsonb_build_object('id', v_wing_id, 'name', v_name);
  end loop;

  for v_flat in select * from jsonb_array_elements(p_flats)
  loop
    v_wing_id := (v_wing_map ->> (v_flat ->> 'wing_name'))::uuid;
    if v_wing_id is null then raise exception 'UNKNOWN_WING: %', v_flat ->> 'wing_name'; end if;
    insert into public.flats (society_id, wing_id, number)
    values (p_society_id, v_wing_id, v_flat ->> 'number')
    returning id into v_flat_id;
    v_flats_out := v_flats_out || jsonb_build_object('id', v_flat_id, 'number', v_flat ->> 'number');
  end loop;

  return jsonb_build_object('wings', v_wings_out, 'flats', v_flats_out);
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboard_flats_for_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_soc uuid; v_row public.society_codes;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_row from public.society_codes
   where code = upper(p_code) and revoked_at is null;
  if not found then return jsonb_build_object('error', 'INVALID_CODE'); end if;
  if v_row.paused_at is not null and not exists (select 1 from public.society_memberships m
                       where m.society_id = v_row.society_id and m.user_id = auth.uid()
                         and m.status = 'active' and m.flat_id is null
                         and m.role in ('secretary', 'co_secretary')) then return jsonb_build_object('error', 'CODE_PAUSED'); end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select name from public.societies where id = v_soc),
    'wings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name,
        'flats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'number', f.number,
            'taken', exists (select 1 from public.society_memberships m
                              where m.flat_id = f.id and m.status = 'active')
          ) order by f.number), '[]'::jsonb)
          from public.flats f where f.wing_id = w.id
        )
      ) order by w.name), '[]'::jsonb)
      from public.wings w where w.society_id = v_soc
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboard_resident(p_code text, p_flat_id uuid, p_full_name text, p_residency residency_kind, p_alt_phone text, p_family jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_row       public.society_codes;
  v_soc       uuid;
  v_phone     text;
  v_status    text;
  v_taken     boolean;
  v_mem_id    uuid;
  v_fam       jsonb;
  v_fam_phone text;
  v_authority uuid;
  v_role      public.membership_role := 'member';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 then raise exception 'INVALID_NAME'; end if;

  select * into v_row from public.society_codes where code = upper(p_code) and revoked_at is null;
  if not found then return jsonb_build_object('error', 'INVALID_CODE'); end if;
  if v_row.paused_at is not null and not exists (select 1 from public.society_memberships m
                       where m.society_id = v_row.society_id and m.user_id = auth.uid()
                         and m.status = 'active' and m.flat_id is null
                         and m.role in ('secretary', 'co_secretary')) then return jsonb_build_object('error', 'CODE_PAUSED'); end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_soc) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;

  select '+' || phone into v_phone from auth.users where id = v_uid;

  select id into v_authority
  from public.society_authorities
  where society_id = v_soc
    and (user_id = v_uid
         or (user_id is null
             and phone = right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10)))
  limit 1;
  if v_authority is not null then
    v_role := 'secretary';
    update public.society_authorities
       set user_id = v_uid, claimed_at = coalesce(claimed_at, now())
     where id = v_authority;
  end if;

  select exists (select 1 from public.society_memberships
                  where flat_id = p_flat_id and society_id = v_soc and status = 'active'
                    and user_id <> v_uid)
    into v_taken;
  v_status := case when v_taken and v_authority is null then 'pending_review' else 'active' end;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, trim(p_full_name), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  select id into v_mem_id
  from public.society_memberships
  where society_id = v_soc and user_id = v_uid and flat_id is null and status = 'active'
  limit 1;

  if v_mem_id is not null then
    update public.society_memberships
       set flat_id = p_flat_id, residency = p_residency,
           emergency_contact = nullif(trim(coalesce(p_alt_phone,'')), ''),
           role = case when v_role = 'secretary' then 'secretary'::public.membership_role else role end
     where id = v_mem_id;
  else
    insert into public.society_memberships
      (society_id, user_id, flat_id, role, residency, household, emergency_contact, status)
    values (v_soc, v_uid, p_flat_id, v_role, p_residency, 'family',
            nullif(trim(coalesce(p_alt_phone,'')), ''), v_status)
    on conflict (society_id, user_id, flat_id) do update
      set status = excluded.status, residency = excluded.residency,
          emergency_contact = excluded.emergency_contact, joined_at = now(),
          role = case when excluded.role = 'secretary' then excluded.role
                      else public.society_memberships.role end
    returning id into v_mem_id;
  end if;

  for v_fam in select * from jsonb_array_elements(p_family)
  loop
    if coalesce(trim(v_fam->>'name'), '') = '' then continue; end if;
    v_fam_phone := nullif(regexp_replace(coalesce(v_fam->>'phone',''), '\D', '', 'g'), '');
    if v_fam_phone is not null then
      v_fam_phone := '+91' || right(v_fam_phone, 10);
      if exists (select 1 from public.family_members
                  where society_id = v_soc and phone = v_fam_phone and claimed_user_id is null) then
        v_fam_phone := null;
      end if;
    end if;
    insert into public.family_members (society_id, membership_id, full_name, phone, relation, is_resident)
    values (v_soc, v_mem_id, trim(v_fam->>'name'), v_fam_phone,
            nullif(trim(v_fam->>'relation'), ''), coalesce((v_fam->>'is_resident')::boolean, true));
  end loop;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'member.joined', 'society_memberships', v_mem_id,
          jsonb_build_object('flat_id', p_flat_id, 'status', v_status,
            'authority', v_authority is not null,
            'family_count', jsonb_array_length(p_family)));

  return jsonb_build_object('society_id', v_soc, 'status', v_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_feature(p_society_id uuid, p_feature_key text, p_enabled boolean, p_price_override integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_admin uuid := auth.uid(); v_core boolean; v_floor integer;
begin
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;

  select is_core, price_monthly into v_core, v_floor from public.platform_features where key = p_feature_key;
  if v_core is null then raise exception 'UNKNOWN_FEATURE'; end if;
  if v_core and p_enabled is false then raise exception 'CANNOT_DISABLE_CORE_FEATURE'; end if;

  if not v_core and p_price_override is not null then
    if p_price_override < 0 then raise exception 'INVALID_PRICE'; end if;
    -- THE FLOOR: a per-society price may not go below the admin-set list price.
    if p_enabled and p_price_override < v_floor then raise exception 'PRICE_BELOW_FLOOR'; end if;
  end if;
  if v_core and p_price_override is not null and p_price_override <> 0 then
    raise exception 'CORE_FEATURE_IS_FREE';
  end if;

  insert into public.society_features (society_id, feature_key, enabled, price_override, granted_by, granted_at)
  values (p_society_id, p_feature_key, p_enabled, p_price_override, v_admin, now())
  on conflict (society_id, feature_key) do update
    set enabled=excluded.enabled, price_override=excluded.price_override,
        granted_by=excluded.granted_by, granted_at=now();

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (p_society_id, v_admin, 'feature.changed', 'society_features',
          jsonb_build_object('feature', p_feature_key, 'enabled', p_enabled, 'price_override', p_price_override));
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_society_history(p_society_id uuid, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
        and (public.is_platform_admin() or a.action !~ '^(billing|payment)\.')
      order by a.created_at desc
      limit greatest(1, least(coalesce(p_limit, 300), 1000))
    ) t
  );
end; $function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_view text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_caller   uuid := auth.uid();
  v_society  uuid := public.current_society_id();
  v_role     text := public.current_membership_role();
  v_result   jsonb;

  v_complaints_count        int;
  v_complaints_previews     jsonb;
  v_bookings_count          int;
  v_bookings_previews       jsonb;
  v_notifications_count     int;
  v_notifications_previews  jsonb;
  v_flat_actions_count      int;
  v_flat_actions_previews   jsonb;

  v_my_complaints_count     int;
  v_my_complaints_previews  jsonb;
  v_my_bookings_count       int;
  v_my_bookings_previews    jsonb;
  v_community_count         int;
  v_community_previews      jsonb;
begin
  if v_caller is null  then raise exception 'AUTH_REQUIRED'; end if;
  if v_society is null then raise exception 'NO_SOCIETY';    end if;

  if v_role in ('board_member','co_secretary','secretary') and p_view is distinct from 'member' then
    -- ============================================================
    -- SECRETARY / BOARD VIEW (DASH-01)
    -- ============================================================

    -- complaints: last-7d count + last-2 previews (society-scoped).
    select count(*) into v_complaints_count
    from public.complaints
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_complaints_previews
    from (
      select jsonb_build_object(
        'id',    c.id,
        'title', c.description,
        'flat',  coalesce(w.name || '-' || f.number, '')
      ) as p
      from public.complaints c
      left join public.flats f on f.id = c.reporter_flat_id
      left join public.wings w on w.id = f.wing_id
      where c.society_id = v_society
        and c.created_at >= (now() - interval '7 days')
      order by c.created_at desc
      limit 2
    ) sub;

    -- bookings: pending count + last-2 pending previews.
    -- time_range is tstzrange — use lower() for the slot start.
    select count(*) into v_bookings_count
    from public.bookings
    where society_id = v_society
      and status = 'pending';

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_bookings_previews
    from (
      select jsonb_build_object(
        'id',      b.id,
        'amenity', a.name,
        'slot',    to_char(lower(b.time_range) at time zone 'Asia/Kolkata', 'Mon DD HH24:MI'),
        'flat',    coalesce(w.name || '-' || f.number, '')
      ) as p
      from public.bookings b
      left join public.amenities a on a.id = b.amenity_id
      left join public.flats     f on f.id = b.requester_flat_id
      left join public.wings     w on w.id = f.wing_id
      where b.society_id = v_society
        and b.status = 'pending'
      order by b.created_at desc
      limit 2
    ) sub;

    -- notifications: last-7d count + last-2 previews.
    select count(*) into v_notifications_count
    from public.notifications
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_notifications_previews
    from (
      select jsonb_build_object('id', n.id, 'title', n.title) as p
      from public.notifications n
      where n.society_id = v_society
      order by n.created_at desc
      limit 2
    ) sub;

    -- flat actions: last-7d count + last-2 previews.
    select count(*) into v_flat_actions_count
    from public.flat_actions
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_flat_actions_previews
    from (
      select jsonb_build_object(
        'id',   fa.id,
        'kind', fa.kind::text,
        'flat', coalesce(w.name || '-' || f.number, '')
      ) as p
      from public.flat_actions fa
      left join public.flats f on f.id = fa.flat_id
      left join public.wings w on w.id = f.wing_id
      where fa.society_id = v_society
      order by fa.created_at desc
      limit 2
    ) sub;

    v_result := jsonb_build_object(
      'role',          v_role,
      'complaints',    jsonb_build_object('count', v_complaints_count,    'previews', v_complaints_previews),
      'bookings',      jsonb_build_object('count', v_bookings_count,      'previews', v_bookings_previews),
      'notifications', jsonb_build_object('count', v_notifications_count, 'previews', v_notifications_previews),
      'flatActions',   jsonb_build_object('count', v_flat_actions_count,  'previews', v_flat_actions_previews)
    );

  else
    -- ============================================================
    -- MEMBER VIEW (DASH-02)
    -- ============================================================

    -- myComplaints: count + last-2 previews (caller's own complaints only).
    select count(*) into v_my_complaints_count
    from public.complaints
    where society_id = v_society
      and reporter_id = v_caller;

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_my_complaints_previews
    from (
      select jsonb_build_object(
        'id',     c.id,
        'title',  c.description,
        'status', c.status::text
      ) as p
      from public.complaints c
      where c.society_id  = v_society
        and c.reporter_id = v_caller
      order by c.created_at desc
      limit 2
    ) sub;

    -- notifications: society-wide visibility (members see society notices).
    select count(*) into v_notifications_count
    from public.notifications
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_notifications_previews
    from (
      select jsonb_build_object('id', n.id, 'title', n.title) as p
      from public.notifications n
      where n.society_id = v_society
      order by n.created_at desc
      limit 2
    ) sub;

    -- myBookings: caller's own bookings only.
    select count(*) into v_my_bookings_count
    from public.bookings
    where society_id   = v_society
      and requester_id = v_caller;

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_my_bookings_previews
    from (
      select jsonb_build_object(
        'id',      b.id,
        'amenity', a.name,
        'slot',    to_char(lower(b.time_range) at time zone 'Asia/Kolkata', 'Mon DD HH24:MI'),
        'status',  b.status::text
      ) as p
      from public.bookings b
      left join public.amenities a on a.id = b.amenity_id
      where b.society_id   = v_society
        and b.requester_id = v_caller
      order by b.created_at desc
      limit 2
    ) sub;

    -- community posts: society-wide, NOT hidden, last 7 days.
    -- hidden_at filter is the T-07-05 mitigation (member must never see
    -- auto-hidden posts via the dashboard preview).
    select count(*) into v_community_count
    from public.posts
    where society_id = v_society
      and hidden_at is null
      and deleted_at is null
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_community_previews
    from (
      select jsonb_build_object(
        'id',     po.id,
        'author', coalesce(pr.full_name, 'Member'),
        'flat',   coalesce(w.name || '-' || f.number, ''),
        'title',  left(po.body, 60)
      ) as p
      from public.posts po
      left join public.profiles pr on pr.user_id = po.author_id
      left join public.flats    f  on f.id      = po.author_flat_id
      left join public.wings    w  on w.id      = f.wing_id
      where po.society_id = v_society
        and po.hidden_at  is null
        and po.deleted_at is null
      order by po.created_at desc
      limit 2
    ) sub;

    v_result := jsonb_build_object(
      'role',          'member',
      'myComplaints',  jsonb_build_object('count', v_my_complaints_count,  'previews', v_my_complaints_previews),
      'notifications', jsonb_build_object('count', v_notifications_count,  'previews', v_notifications_previews),
      'myBookings',    jsonb_build_object('count', v_my_bookings_count,    'previews', v_my_bookings_previews),
      'community',     jsonb_build_object('count', v_community_count,      'previews', v_community_previews)
    );
  end if;

  return v_result;
end;
$function$;
revoke execute on function public.get_dashboard_summary(text) from public, anon;
grant execute on function public.get_dashboard_summary(text) to authenticated, service_role;

-- ---------------------------------------------------------------- #6
create or replace function public.my_society_service_status()
returns jsonb
language plpgsql stable security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_claim uuid := nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'society_id', '')::uuid;
  v_soc uuid;
begin
  if v_uid is null then return null; end if;

  -- The society in the token is the one RLS scopes to — report that one, as
  -- long as the caller really belongs to it.
  if v_claim is not null and (
       exists (select 1 from public.society_memberships m
                where m.society_id = v_claim and m.user_id = v_uid
                  and m.status in ('active', 'pending_review'))
    or exists (select 1 from public.society_guards g
                where g.society_id = v_claim and g.user_id = v_uid and g.status = 'active')) then
    v_soc := v_claim;
  end if;

  -- No usable claim yet (e.g. right after onboarding): newest membership.
  if v_soc is null then
    select m.society_id into v_soc
    from public.society_memberships m
    where m.user_id = v_uid and m.status in ('active', 'pending_review')
    order by m.joined_at desc limit 1;
  end if;
  if v_soc is null then
    select g.society_id into v_soc
    from public.society_guards g
    where g.user_id = v_uid and g.status = 'active' limit 1;
  end if;
  if v_soc is null then return null; end if;

  return (select jsonb_build_object(
            'society_id', s.id, 'society_name', s.name,
            'status', s.service_status, 'reason', s.service_reason,
            'changed_at', s.service_changed_at)
          from public.societies s where s.id = v_soc);
end; $$;

-- ---------------------------------------------------------------- #7
create or replace function public.guard_society_service_write()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_soc uuid;
begin
  -- Migrations, psql, cron and Edge Functions (service role) are not users.
  if v_claims is null or v_claims ->> 'role' = 'service_role' then
    return coalesce(new, old);
  end if;
  -- Parisar staff keep working on a paused/blocked society.
  if public.is_platform_admin_or_sales() then
    return coalesce(new, old);
  end if;

  v_soc := case when tg_op = 'DELETE' then old.society_id else new.society_id end;
  if v_soc is not null and exists (
       select 1 from public.societies s
        where s.id = v_soc and s.service_status <> 'active') then
    raise exception 'SOCIETY_SERVICE_STOPPED' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end; $$;

do $$
declare t text;
begin
  -- Activity tables. Not here on purpose: societies + audit_log (staff
  -- actions), society_memberships / family_members / code_redemptions
  -- plus society_authorities / society_codes, which login and joining update
  -- (both still work while paused), sos_alerts (emergencies always go
  -- through), staff-only tables (their RPCs already require staff), and
  -- personal settings (notification_preferences, push tables).
  foreach t in array array[
    'amenities', 'attachments', 'bookings', 'complaint_responses', 'complaints',
    'facility_events', 'feature_requests', 'flat_actions', 'flats',
    'moderation_events', 'notifications', 'poll_options', 'poll_votes', 'polls',
    'post_comments', 'posts', 'reports', 'society_guards', 'society_highlights', 'society_staff', 'visitor_requests',
    'wings'
  ] loop
    execute format('drop trigger if exists guard_society_service on public.%I', t);
    execute format(
      'create trigger guard_society_service before insert or update or delete on public.%I
         for each row execute function public.guard_society_service_write()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- #8
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'current_(society_id|membership_role)\(\)'
        or coalesce(with_check, '') ~ 'current_(society_id|membership_role)\(\)')
  loop
    -- Skip calls that are already a sub-select, so re-running is a no-op.
    v_using := regexp_replace(p.qual, '(?<!SELECT )(?<!public\.)current_(society_id|membership_role)\(\)',
                              '(select public.current_\1())', 'g');
    v_check := regexp_replace(p.with_check, '(?<!SELECT )(?<!public\.)current_(society_id|membership_role)\(\)',
                              '(select public.current_\1())', 'g');
    continue when v_using is not distinct from p.qual and v_check is not distinct from p.with_check;
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end $$;

notify pgrst, 'reload schema';
