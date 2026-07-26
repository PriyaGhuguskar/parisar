-- ============================================================================
-- Staff can correct a society's chairman name / phone
-- ----------------------------------------------------------------------------
-- The chairman's NAME was only ever stored in the society.created audit payload,
-- never as an editable field, so the console could show the phone but not the
-- name and neither could be fixed. This adds societies.secretary_name and an
-- update RPC.
--
-- THE IMPORTANT CASE is the safe one: a society whose chairman has NOT signed in
-- yet (secretary_phone is just a pending claim target). Editing it there simply
-- changes who will become chairman — the everyday "I typed the wrong number" fix.
--
-- Once the chairman HAS claimed, they have a real auth account tied to their
-- number. Changing societies.secretary_phone cannot move that account, so the
-- phone is locked at that point — the RPC refuses it and says why. The name can
-- still be corrected (it updates their profile). Silently changing a column that
-- does nothing would be worse than a clear "no".
-- ============================================================================

alter table public.societies add column if not exists secretary_name text;

-- Backfill the name from the creation audit payload where we have it.
update public.societies s
   set secretary_name = a.payload->>'secretary_name'
  from public.audit_log a
 where a.society_id = s.id
   and a.action = 'society.created_by_admin'
   and s.secretary_name is null
   and a.payload ? 'secretary_name';

comment on column public.societies.secretary_name is
  'The chairman''s name as entered by staff. Editable until the chairman claims; after that, name edits also update their profile.';

create or replace function public.admin_update_chairman(
  p_society_id uuid, p_name text, p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_cur   text;
  v_sec   uuid;   -- claimed secretary's user_id, if any
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME'; end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;

  select secretary_phone into v_cur from public.societies where id = p_society_id;
  if v_cur is null then raise exception 'SOCIETY_NOT_FOUND'; end if;

  -- Has a chairman already signed in?
  select user_id into v_sec
  from public.society_memberships
  where society_id = p_society_id and role = 'secretary' and status = 'active'
  limit 1;

  if v_sec is not null then
    -- Locked phone: the account is tied to the existing number.
    if right(regexp_replace(v_cur,'\D','','g'),10) <> right(p_phone,10) then
      raise exception 'CHAIRMAN_ALREADY_CLAIMED';
    end if;
    -- Name still fixable — keep the society record and their profile in step.
    update public.societies set secretary_name = trim(p_name) where id = p_society_id;
    update public.profiles set full_name = trim(p_name) where user_id = v_sec;
  else
    -- Not claimed yet: both are free to change.
    update public.societies
       set secretary_name = trim(p_name), secretary_phone = p_phone
     where id = p_society_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_admin, 'chairman.updated', 'societies', p_society_id,
          jsonb_build_object('name', trim(p_name), 'phone', p_phone, 'was_claimed', v_sec is not null));

  return jsonb_build_object('claimed', v_sec is not null);
end;
$$;

grant execute on function public.admin_update_chairman(uuid, text, text) to authenticated;

-- Surface secretary_name + a "claimed" flag in the society detail so the UI can
-- show the name and know whether to lock the phone field.
create or replace function public.admin_society_detail(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v jsonb; v_admin boolean := public.is_platform_admin();
begin
  if not public.is_platform_staff() then raise exception 'NOT_PLATFORM_STAFF'; end if;

  select jsonb_build_object(
    'is_admin', v_admin,
    'society', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'address', s.address,
        'address_line', s.address_line, 'city', s.city, 'landmark', s.landmark,
        'state', s.state, 'pincode', s.pincode,
        'secretary_phone', s.secretary_phone, 'secretary_name', s.secretary_name,
        'chairman_claimed', exists (select 1 from public.society_memberships m
          where m.society_id = s.id and m.role = 'secretary' and m.status = 'active'),
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
end;
$$;

grant execute on function public.admin_society_detail(uuid) to authenticated;
