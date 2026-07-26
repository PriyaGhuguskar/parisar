-- ============================================================================
-- Split society address into real fields
-- ----------------------------------------------------------------------------
-- societies.address was one free-text blob. That cannot be searched by city,
-- grouped by state, or validated — and a pincode buried in prose is a pincode
-- nobody can use.
--
-- The existing `address` column is KEPT and now holds the composed one-line
-- version, written by the RPC. Nothing that already reads `address` breaks
-- (admin_list_societies renders it, and older rows keep the text they had),
-- while new rows also carry the parts separately.
--
-- landmark is nullable on purpose: plenty of addresses genuinely have none, and
-- forcing a required field would just get "NA" typed into it.
-- ============================================================================

alter table public.societies
  add column if not exists address_line text,
  add column if not exists city         text,
  add column if not exists landmark     text,
  add column if not exists state        text,
  add column if not exists pincode      text;

-- Indian PIN codes are 6 digits and never start with 0.
alter table public.societies
  drop constraint if exists societies_pincode_shape;
alter table public.societies
  add constraint societies_pincode_shape
  check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');

create index if not exists societies_city_idx    on public.societies (city);
create index if not exists societies_pincode_idx on public.societies (pincode);

comment on column public.societies.address is
  'Composed one-line address, derived from the parts below. Kept so existing readers do not break.';
comment on column public.societies.landmark is
  'Optional — many addresses have none, and a required field would just collect "NA".';

-- ---------------------------------------------------------------------------
-- admin_create_society, now taking the parts.
--
-- The old 5-argument signature is dropped: leaving both would let a caller
-- create a society with no city or pincode by picking the older overload, and
-- the data quality problem this migration exists to fix would quietly persist.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_society(text, text, text, text, uuid);

create or replace function public.admin_create_society(
  p_name            text,
  p_address_line    text,
  p_city            text,
  p_state           text,
  p_pincode         text,
  p_landmark        text,
  p_secretary_name  text,
  p_secretary_phone text,
  p_request_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id   uuid := auth.uid();
  v_society_id uuid;
  v_code       text;
  v_full       text;
begin
  if v_admin_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  if p_name is null or length(trim(p_name)) < 3 or length(p_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if p_address_line is null or length(trim(p_address_line)) < 5 then
    raise exception 'INVALID_ADDRESS';
  end if;
  if p_city is null or length(trim(p_city)) < 2 then
    raise exception 'INVALID_CITY';
  end if;
  if p_state is null or length(trim(p_state)) < 2 then
    raise exception 'INVALID_STATE';
  end if;
  if p_pincode is null or p_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'INVALID_PINCODE';
  end if;
  if p_secretary_name is null or length(trim(p_secretary_name)) < 2 then
    raise exception 'INVALID_SECRETARY_NAME';
  end if;
  if p_secretary_phone is null or p_secretary_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_SECRETARY_PHONE';
  end if;

  -- Compose the one-liner, skipping the landmark when it is absent so we never
  -- render "12 MG Road, , Pune".
  v_full := concat_ws(', ',
    trim(p_address_line),
    nullif(trim(coalesce(p_landmark, '')), ''),
    trim(p_city),
    trim(p_state),
    p_pincode
  );

  insert into public.societies (
    name, address, address_line, city, landmark, state, pincode, secretary_phone
  )
  values (
    trim(p_name), v_full, trim(p_address_line), trim(p_city),
    nullif(trim(coalesce(p_landmark, '')), ''), trim(p_state), p_pincode,
    p_secretary_phone
  )
  returning id into v_society_id;

  v_code := public.generate_society_code();
  insert into public.society_codes (code, society_id) values (v_code, v_society_id);

  if p_request_id is not null then
    update public.society_enrollment_requests
       set status = 'approved', society_id = v_society_id,
           handled_by = v_admin_id, updated_at = now()
     where id = p_request_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_admin_id, 'society.created_by_admin', 'societies', v_society_id,
          jsonb_build_object(
            'name', trim(p_name),
            'city', trim(p_city),
            'state', trim(p_state),
            'pincode', p_pincode,
            'secretary_name', trim(p_secretary_name),
            'secretary_phone', p_secretary_phone,
            'request_id', p_request_id
          ));

  return jsonb_build_object('society_id', v_society_id, 'code', v_code);
end;
$$;

grant execute on function public.admin_create_society(
  text, text, text, text, text, text, text, text, uuid) to authenticated;

-- Surface the parts to the staff console.
-- DROP first: `create or replace` cannot change a function's return type, and
-- this adds city/state/pincode to the returned table.
drop function if exists public.admin_list_societies();

create function public.admin_list_societies()
returns table (
  id              uuid,
  name            text,
  address         text,
  city            text,
  state           text,
  pincode         text,
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
    s.id, s.name, s.address, s.city, s.state, s.pincode,
    c.code, s.secretary_phone,
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
