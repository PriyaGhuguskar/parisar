-- ============================================================================
-- Two staff roles: admin (full) and sales, with a price FLOOR
-- ----------------------------------------------------------------------------
-- Until now platform_admins was one undifferentiated staff role. This splits it:
--
--   admin  — sets the floor price of each feature, manages billing & payments,
--            edits the catalogue. The finance + policy role.
--   sales  — creates societies and turns features on for them, and sets each
--            society's price. May price AT or ABOVE the admin's floor, never
--            below. Cannot see billing or payments at all.
--
-- THE FLOOR is platform_features.price_monthly. An admin sets it (say ₹100); a
-- salesperson enabling that feature for a society may charge ₹100, ₹150, ₹200 —
-- but the database rejects anything under ₹100. Enforced in admin_set_feature,
-- so it holds no matter which client calls it.
--
-- NOTE: this reverses the earlier "per-society discount" idea. The list price is
-- now a MINIMUM, not a suggested retail price a society could be discounted
-- below. Sales upsell above the floor; only an admin lowering the floor itself
-- can take a feature cheaper.
-- ============================================================================

do $$ begin
  create type public.platform_role as enum ('admin','sales');
exception when duplicate_object then null; end $$;

alter table public.platform_admins
  add column if not exists role public.platform_role not null default 'admin';

comment on column public.platform_admins.role is
  'admin = finance + policy + everything sales can do. sales = create societies, enable & price features (>= floor), no billing/payments visibility.';

-- ---------------------------------------------------------------------------
-- is_platform_staff() — ANY staff member (admin or sales).
-- is_platform_admin() — narrowed to role = admin.
-- Both re-check the table live, so revoking or demoting is immediate.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_staff()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
grant execute on function public.is_platform_staff() to authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.is_platform_staff() is 'True for any Parisar staff (admin or sales).';
comment on function public.is_platform_admin() is 'True only for admin-role staff — finance, catalogue floor, policy.';

-- ---------------------------------------------------------------------------
-- Widen the SHARED capabilities from admin-only to any-staff. These are the
-- things a salesperson legitimately does. Admin-only RPCs (set_feature_price,
-- set_billing, record/delete payment) keep their is_platform_admin() check and
-- are NOT touched here.
-- ---------------------------------------------------------------------------

-- Enrollment queue: sales works leads too.
drop policy if exists enrollment_admin_read on public.society_enrollment_requests;
create policy enrollment_staff_read on public.society_enrollment_requests
  for select to authenticated using (public.is_platform_staff());
drop policy if exists enrollment_admin_update on public.society_enrollment_requests;
create policy enrollment_staff_update on public.society_enrollment_requests
  for update to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

-- admin_create_society: staff. (Recreated verbatim except the gate.)
create or replace function public.admin_create_society(
  p_name text, p_address_line text, p_city text, p_state text, p_pincode text,
  p_landmark text, p_secretary_name text, p_secretary_phone text, p_request_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_admin_id uuid := auth.uid(); v_society_id uuid; v_code text; v_full text;
begin
  if v_admin_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;

  if p_name is null or length(trim(p_name)) < 3 or length(p_name) > 100 then raise exception 'INVALID_NAME'; end if;
  if p_address_line is null or length(trim(p_address_line)) < 5 then raise exception 'INVALID_ADDRESS'; end if;
  if p_city is null or length(trim(p_city)) < 2 then raise exception 'INVALID_CITY'; end if;
  if p_state is null or length(trim(p_state)) < 2 then raise exception 'INVALID_STATE'; end if;
  if p_pincode is null or p_pincode !~ '^[1-9][0-9]{5}$' then raise exception 'INVALID_PINCODE'; end if;
  if p_secretary_name is null or length(trim(p_secretary_name)) < 2 then raise exception 'INVALID_SECRETARY_NAME'; end if;
  if p_secretary_phone is null or p_secretary_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_SECRETARY_PHONE'; end if;

  v_full := concat_ws(', ', trim(p_address_line),
    nullif(trim(coalesce(p_landmark,'')),''), trim(p_city), trim(p_state), p_pincode);

  insert into public.societies (name, address, address_line, city, landmark, state, pincode, secretary_phone)
  values (trim(p_name), v_full, trim(p_address_line), trim(p_city),
          nullif(trim(coalesce(p_landmark,'')),''), trim(p_state), p_pincode, p_secretary_phone)
  returning id into v_society_id;

  v_code := public.generate_society_code();
  insert into public.society_codes (code, society_id) values (v_code, v_society_id);

  if p_request_id is not null then
    update public.society_enrollment_requests
       set status='approved', society_id=v_society_id, handled_by=v_admin_id, updated_at=now()
     where id = p_request_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_admin_id, 'society.created_by_admin', 'societies', v_society_id,
          jsonb_build_object('name', trim(p_name), 'city', trim(p_city), 'state', trim(p_state),
            'pincode', p_pincode, 'secretary_name', trim(p_secretary_name),
            'secretary_phone', p_secretary_phone, 'request_id', p_request_id));

  return jsonb_build_object('society_id', v_society_id, 'code', v_code);
end; $$;
grant execute on function public.admin_create_society(text,text,text,text,text,text,text,text,uuid) to authenticated;

-- admin_add_note: staff.
create or replace function public.admin_add_note(p_society_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  if p_body is null or char_length(trim(p_body)) = 0 then raise exception 'EMPTY_NOTE'; end if;
  insert into public.society_notes (society_id, author_id, body)
  values (p_society_id, auth.uid(), trim(p_body)) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.admin_add_note(uuid, text) to authenticated;

-- admin_list_societies: staff.
create or replace function public.admin_list_societies()
returns table (id uuid, name text, address text, city text, state text, pincode text,
  code text, secretary_phone text, member_count bigint, pending_count bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return query
  select s.id, s.name, s.address, s.city, s.state, s.pincode, c.code, s.secretary_phone,
    (select count(*) from public.society_memberships m where m.society_id=s.id and m.status='active'),
    (select count(*) from public.society_memberships m where m.society_id=s.id and m.status='pending_review'),
    s.created_at
  from public.societies s
  left join public.society_codes c on c.society_id=s.id and c.revoked_at is null
  order by s.created_at desc;
end; $$;
grant execute on function public.admin_list_societies() to authenticated;

-- admin_stats: staff. Finance figures (mrr, past_due) blanked for non-admins.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_admin boolean := public.is_platform_admin();
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  return jsonb_build_object(
    'societies',       (select count(*) from public.societies),
    'residents',       (select count(*) from public.society_memberships where status='active'),
    'open_requests',   (select count(*) from public.society_enrollment_requests where status in ('new','contacted')),
    'urgent_requests', (select count(*) from public.society_enrollment_requests where status in ('new','contacted') and call_now is true),
    'is_admin',        v_admin,
    'mrr',      case when v_admin then (select coalesce(sum(monthly_amount),0) from public.society_billing where status='active') else null end,
    'past_due', case when v_admin then (select count(*) from public.society_billing where status='past_due') else null end
  );
end; $$;
grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_feature: staff, WITH the price floor. Recreated with the new check.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_feature(
  p_society_id uuid, p_feature_key text, p_enabled boolean, p_price_override integer default null
)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_admin uuid := auth.uid(); v_core boolean; v_floor integer;
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;

  select is_core, price_monthly into v_core, v_floor from public.platform_features where key = p_feature_key;
  if v_core is null then raise exception 'UNKNOWN_FEATURE'; end if;
  if v_core and p_enabled is false then raise exception 'CANNOT_DISABLE_CORE_FEATURE'; end if;

  if not v_core and p_price_override is not null then
    if p_price_override < 0 then raise exception 'INVALID_PRICE'; end if;
    -- THE FLOOR: a per-society price may not go below the admin-set list price.
    if p_price_override < v_floor then raise exception 'PRICE_BELOW_FLOOR'; end if;
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
end; $$;
grant execute on function public.admin_set_feature(uuid, text, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_society_detail: staff. Billing + payments are ADMIN-ONLY, so they are
-- omitted from the payload for sales — the UI hiding a tab is not enough, the
-- data must not cross the wire. `is_admin` tells the client which panes to show
-- and `floor` is added per feature so sales sees the minimum price.
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_detail(p_society_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb; v_admin boolean := public.is_platform_admin();
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;

  select jsonb_build_object(
    'is_admin', v_admin,
    'society', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'address', s.address,
        'address_line', s.address_line, 'city', s.city, 'landmark', s.landmark,
        'state', s.state, 'pincode', s.pincode, 'secretary_phone', s.secretary_phone,
        'created_at', s.created_at,
        'code', (select c.code from public.society_codes c where c.society_id=s.id and c.revoked_at is null limit 1),
        'member_count', (select count(*) from public.society_memberships m where m.society_id=s.id and m.status='active'),
        'pending_count', (select count(*) from public.society_memberships m where m.society_id=s.id and m.status='pending_review'))
      from public.societies s where s.id = p_society_id
    ),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', f.key, 'name', f.name, 'description', f.description,
        'floor', f.price_monthly, 'list_price', f.price_monthly, 'price_override', sf.price_override,
        'price', case when f.is_core then 0 else coalesce(sf.price_override, f.price_monthly) end,
        'is_core', f.is_core, 'enabled', coalesce(sf.enabled, f.is_core)
      ) order by f.sort_order), '[]'::jsonb)
      from public.platform_features f
      left join public.society_features sf on sf.feature_key=f.key and sf.society_id=p_society_id
    ),
    -- ADMIN-ONLY finance below.
    'billing', case when v_admin then (select to_jsonb(b) from public.society_billing b where b.society_id=p_society_id) else null end,
    'payments', case when v_admin then (
        select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paid_on',p.paid_on,
          'method',p.method,'reference',p.reference,'note',p.note) order by p.paid_on desc, p.created_at desc), '[]'::jsonb)
        from public.society_payments p where p.society_id=p_society_id) else null end,
    'total_collected', case when v_admin then (select coalesce(sum(amount),0) from public.society_payments where society_id=p_society_id) else null end,
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'created_at',n.created_at) order by n.created_at desc), '[]'::jsonb)
      from public.society_notes n where n.society_id=p_society_id
    )
  ) into v;

  if v->'society' is null or v->'society' = 'null'::jsonb then raise exception 'SOCIETY_NOT_FOUND'; end if;
  return v;
end; $$;
grant execute on function public.admin_society_detail(uuid) to authenticated;
