-- ============================================================================
-- Staff console: society detail, feature toggles, billing, notes
-- ----------------------------------------------------------------------------
-- Same rule as everywhere else in this console: reads go through SECURITY
-- DEFINER functions rather than by widening RLS on the underlying tables. Each
-- function returns exactly what the screen renders, and each re-checks
-- is_platform_admin() on every call so revoking a staff member is immediate.
--
-- Note what these still do NOT expose: resident names, resident phone numbers,
-- or individual poll votes. Staff get the operational picture of a society —
-- what it can use, what it owes, who to ring, what was said last time — not its
-- residents' personal data. That stays behind the audited "view society"
-- session added in 20260721000020.
-- ============================================================================

create or replace function public.admin_society_detail(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v jsonb;
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
    -- Left join the catalogue so features a society has never been granted still
    -- appear, shown as off. Otherwise staff could not switch on something new.
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', f.key, 'name', f.name, 'description', f.description,
        'price_monthly', f.price_monthly, 'is_core', f.is_core,
        'enabled', coalesce(sf.enabled, f.is_core)
      ) order by f.sort_order), '[]'::jsonb)
      from public.platform_features f
      left join public.society_features sf
        on sf.feature_key = f.key and sf.society_id = p_society_id
    ),
    'billing', (
      select to_jsonb(b) from public.society_billing b where b.society_id = p_society_id
    ),
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

-- ---------------------------------------------------------------------------
-- Toggle one feature for one society. Core features are refused: they are what
-- makes the product work at all, and a society with notices switched off is a
-- support ticket rather than a saving.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_feature(
  p_society_id uuid, p_feature_key text, p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_core  boolean;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  select is_core into v_core from public.platform_features where key = p_feature_key;
  if v_core is null then raise exception 'UNKNOWN_FEATURE'; end if;
  if v_core and p_enabled is false then raise exception 'CANNOT_DISABLE_CORE_FEATURE'; end if;

  insert into public.society_features (society_id, feature_key, enabled, granted_by, granted_at)
  values (p_society_id, p_feature_key, p_enabled, v_admin, now())
  on conflict (society_id, feature_key) do update
    set enabled = excluded.enabled, granted_by = excluded.granted_by, granted_at = now();

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (p_society_id, v_admin, 'feature.changed', 'society_features',
          jsonb_build_object('feature', p_feature_key, 'enabled', p_enabled));
end;
$$;

grant execute on function public.admin_set_feature(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Billing. Ledger only — records what was agreed and whether it was paid.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_billing(
  p_society_id uuid,
  p_plan       text,
  p_status     public.billing_status,
  p_amount     integer,
  p_next_due   date default null,
  p_last_paid  date default null,
  p_notes      text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;

  insert into public.society_billing (
    society_id, plan, status, monthly_amount, next_due_on, last_paid_on, notes, updated_at)
  values (p_society_id, p_plan, p_status, p_amount, p_next_due, p_last_paid, p_notes, now())
  on conflict (society_id) do update
    set plan = excluded.plan, status = excluded.status,
        monthly_amount = excluded.monthly_amount, next_due_on = excluded.next_due_on,
        last_paid_on = excluded.last_paid_on, notes = excluded.notes, updated_at = now();

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (p_society_id, v_admin, 'billing.updated', 'society_billing',
          jsonb_build_object('plan', p_plan, 'status', p_status, 'amount', p_amount));
end;
$$;

grant execute on function public.admin_set_billing(
  uuid, text, public.billing_status, integer, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-up note. Not audit_log: audit_log is the society's own record and this
-- is an internal remark the society must not read.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_note(p_society_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if p_body is null or char_length(trim(p_body)) = 0 then raise exception 'EMPTY_NOTE'; end if;

  insert into public.society_notes (society_id, author_id, body)
  values (p_society_id, auth.uid(), trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.admin_add_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Stats, now including revenue and anything overdue.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  return jsonb_build_object(
    'societies',       (select count(*) from public.societies),
    'residents',       (select count(*) from public.society_memberships where status = 'active'),
    'open_requests',   (select count(*) from public.society_enrollment_requests
                          where status in ('new','contacted')),
    'urgent_requests', (select count(*) from public.society_enrollment_requests
                          where status in ('new','contacted') and call_now is true),
    'mrr',             (select coalesce(sum(monthly_amount),0) from public.society_billing
                          where status = 'active'),
    'past_due',        (select count(*) from public.society_billing where status = 'past_due')
  );
end;
$$;

grant execute on function public.admin_stats() to authenticated;
