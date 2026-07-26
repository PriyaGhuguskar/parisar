-- ============================================================================
-- Editable pricing: global list price + per-society negotiated override
-- ----------------------------------------------------------------------------
-- Two prices, deliberately separate:
--
--   platform_features.price_monthly     — the LIST price, shown to everyone
--   society_features.price_override     — what THIS society was actually charged
--
-- Staff edit the list price on the catalogue tab, and a per-society rate in the
-- society drawer. The society always pays the override when one is set, else the
-- list price. Keeping them separate means a discount to one society never
-- silently rewrites the price for all the others — which is exactly what would
-- happen if there were only one editable number.
-- ============================================================================

alter table public.society_features
  add column if not exists price_override integer;

alter table public.society_features
  drop constraint if exists society_features_override_non_negative;
alter table public.society_features
  add constraint society_features_override_non_negative
  check (price_override is null or price_override >= 0);

comment on column public.society_features.price_override is
  'Negotiated monthly price for THIS society. NULL means charge the catalogue list price.';

-- ---------------------------------------------------------------------------
-- Edit the global list price of a feature. Core features stay free — their
-- price is not a lever, they are the product working at all.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_feature_price(
  p_feature_key text, p_price integer
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_core boolean; v_admin uuid := auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if p_price is null or p_price < 0 then raise exception 'INVALID_PRICE'; end if;

  select is_core into v_core from public.platform_features where key = p_feature_key;
  if v_core is null then raise exception 'UNKNOWN_FEATURE'; end if;
  if v_core and p_price <> 0 then raise exception 'CORE_FEATURE_IS_FREE'; end if;

  update public.platform_features set price_monthly = p_price where key = p_feature_key;

  -- Global price change: no single society_id, so this audit row is unscoped.
  insert into public.audit_log (actor_id, action, target_table, payload)
  values (v_admin, 'feature.price_changed', 'platform_features',
          jsonb_build_object('feature', p_feature_key, 'price', p_price));
end;
$$;

grant execute on function public.admin_set_feature_price(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_feature, extended: an optional per-society price override.
-- Passing NULL for p_price clears the override (back to list price). The old
-- 3-argument signature is dropped so a caller cannot bypass the new parameter.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_set_feature(uuid, text, boolean);

create or replace function public.admin_set_feature(
  p_society_id uuid,
  p_feature_key text,
  p_enabled boolean,
  p_price_override integer default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_admin uuid := auth.uid(); v_core boolean;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  select is_core into v_core from public.platform_features where key = p_feature_key;
  if v_core is null then raise exception 'UNKNOWN_FEATURE'; end if;
  if v_core and p_enabled is false then raise exception 'CANNOT_DISABLE_CORE_FEATURE'; end if;
  if p_price_override is not null and p_price_override < 0 then raise exception 'INVALID_PRICE'; end if;
  -- Core features are free; a per-society override on them is meaningless.
  if v_core and p_price_override is not null and p_price_override <> 0 then
    raise exception 'CORE_FEATURE_IS_FREE';
  end if;

  insert into public.society_features
    (society_id, feature_key, enabled, price_override, granted_by, granted_at)
  values (p_society_id, p_feature_key, p_enabled, p_price_override, v_admin, now())
  on conflict (society_id, feature_key) do update
    set enabled = excluded.enabled,
        price_override = excluded.price_override,
        granted_by = excluded.granted_by,
        granted_at = now();

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (p_society_id, v_admin, 'feature.changed', 'society_features',
          jsonb_build_object('feature', p_feature_key, 'enabled', p_enabled,
                             'price_override', p_price_override));
end;
$$;

grant execute on function public.admin_set_feature(uuid, text, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Surface the effective price in the society detail: override when set, else
-- the list price. `list_price` is returned too so the UI can show "₹199 (list
-- ₹299)" and make a discount visible.
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_detail(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  select jsonb_build_object(
    'society', (
      select jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address,
        'address_line', s.address_line, 'city', s.city, 'landmark', s.landmark,
        'state', s.state, 'pincode', s.pincode,
        'secretary_phone', s.secretary_phone, 'created_at', s.created_at,
        'code', (select c.code from public.society_codes c
                  where c.society_id = s.id and c.revoked_at is null limit 1),
        'member_count', (select count(*) from public.society_memberships m
                          where m.society_id = s.id and m.status = 'active'),
        'pending_count', (select count(*) from public.society_memberships m
                           where m.society_id = s.id and m.status = 'pending_review')
      )
      from public.societies s where s.id = p_society_id
    ),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', f.key, 'name', f.name, 'description', f.description,
        'list_price', f.price_monthly,
        'price_override', sf.price_override,
        'price', case when f.is_core then 0
                      else coalesce(sf.price_override, f.price_monthly) end,
        'is_core', f.is_core,
        'enabled', coalesce(sf.enabled, f.is_core)
      ) order by f.sort_order), '[]'::jsonb)
      from public.platform_features f
      left join public.society_features sf
        on sf.feature_key = f.key and sf.society_id = p_society_id
    ),
    'billing', (select to_jsonb(b) from public.society_billing b where b.society_id = p_society_id),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_at', n.created_at
      ) order by n.created_at desc), '[]'::jsonb)
      from public.society_notes n where n.society_id = p_society_id
    )
  ) into v;

  if v->'society' is null or v->'society' = 'null'::jsonb then
    raise exception 'SOCIETY_NOT_FOUND';
  end if;
  return v;
end;
$$;

grant execute on function public.admin_society_detail(uuid) to authenticated;
