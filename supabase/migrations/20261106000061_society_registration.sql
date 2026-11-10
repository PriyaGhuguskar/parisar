-- ============================================================================
-- Migration 061: society registration fields + honest feature catalogue.
--
-- platform_features stays the catalogue of things that actually work:
-- has_module is true on every row in it. Things the brief lists that have no
-- module (parking, accounting, vendors, events) are recorded in
-- platform_feature_gaps so they can never be toggled on, billed or shown as a
-- working feature. admin_feature_catalogue() returns both with the flag.
-- ============================================================================

alter table public.societies
  add column if not exists registration_number text,
  add column if not exists society_type        text,
  add column if not exists registration_date   date,
  add column if not exists official_email      text,
  add column if not exists official_phone      text,
  add column if not exists country             text not null default 'India',
  add column if not exists setup_completed_at  timestamptz,
  add column if not exists setup_completed_by  uuid references auth.users(id) on delete set null;

alter table public.societies
  drop constraint if exists societies_society_type_check,
  drop constraint if exists societies_registration_number_len,
  drop constraint if exists societies_official_phone_shape,
  drop constraint if exists societies_official_email_len;
alter table public.societies
  add constraint societies_society_type_check check (
    society_type is null or society_type in
      ('cooperative_housing', 'apartment_association', 'gated_community', 'condominium',
       'rwa', 'mixed_use', 'commercial', 'other')),
  add constraint societies_registration_number_len check (
    registration_number is null or char_length(registration_number) between 1 and 60),
  add constraint societies_official_phone_shape check (
    official_phone is null or official_phone ~ '^[0-9+() -]{6,20}$'),
  add constraint societies_official_email_len check (
    official_email is null or char_length(official_email) <= 254);

-- The same number can legitimately recur across states, not within one.
create unique index if not exists societies_registration_number_key
  on public.societies (lower(trim(registration_number)), lower(trim(coalesce(state, ''))))
  where registration_number is not null;

-- Societies that already have flats finished setup under the old wizard; they must
-- not be pulled back into a setup screen.
update public.societies s
   set setup_completed_at = coalesce(s.setup_completed_at, now())
 where exists (select 1 from public.flats f where f.society_id = s.id);

-- ---------------------------------------------------------------------------
-- Feature catalogue
-- ---------------------------------------------------------------------------
alter table public.platform_features
  add column if not exists has_module boolean not null default true;

comment on column public.platform_features.has_module is
  'True when a real module backs this key. Keys with no module live in platform_feature_gaps.';

-- Prices are placeholders, like the seed in 022. These modules exist today and
-- are not gated in their RPCs, so 0 is the honest price until someone decides.
insert into public.platform_features (key, name, description, price_monthly, is_core, sort_order, has_module) values
  ('visitors', 'Visitor Management', 'Gate guards log visitors and residents approve them.', 0, false, 90, true),
  ('sos', 'SOS Alerts', 'Raise an emergency alert to residents, committee or guards.', 0, true, 100, true),
  ('staff_directory', 'Staff Directory', 'Society staff and local-help contacts.', 0, false, 110, true),
  ('facility_calendar', 'Facility Calendar', 'Water shutdowns, lift maintenance and other society schedules.', 0, false, 120, true)
on conflict (key) do nothing;

-- Existing societies already use these modules; do not switch them off.
insert into public.society_features (society_id, feature_key, enabled)
select s.id, f.key, true
  from public.societies s
 cross join public.platform_features f
 where f.key in ('visitors', 'sos', 'staff_directory', 'facility_calendar')
on conflict (society_id, feature_key) do nothing;

create table if not exists public.platform_feature_gaps (
  key        text primary key,
  name       text not null,
  reason     text not null,
  sort_order integer not null default 100
);
alter table public.platform_feature_gaps enable row level security;
revoke all on public.platform_feature_gaps from anon, authenticated;

insert into public.platform_feature_gaps (key, name, reason, sort_order) values
  ('parking', 'Parking', 'No parking module. flats.parking_slot is a label only.', 10),
  ('accounting', 'Accounting & Finance', 'No accounting module. society_billing is the Parisar invoice ledger, not society finance.', 20),
  ('vendors', 'Vendor Management', 'No vendor module. society_staff_details.vendor_name is a text field only.', 30),
  ('events', 'Events', 'No events module. facility_events is a schedule, with no RSVP or attendance.', 40)
on conflict (key) do nothing;

create or replace function public.admin_feature_catalogue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.assert_platform_staff();
  return jsonb_build_object(
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', f.key, 'name', f.name, 'description', f.description,
               'price_monthly', f.price_monthly, 'is_core', f.is_core,
               'has_module', f.has_module) order by f.sort_order), '[]'::jsonb)
        from public.platform_features f where f.has_module),
    'unavailable', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', g.key, 'name', g.name, 'reason', g.reason,
               'has_module', false) order by g.sort_order), '[]'::jsonb)
        from public.platform_feature_gaps g)
  );
end;
$$;
revoke all on function public.admin_feature_catalogue() from public, anon;
grant execute on function public.admin_feature_catalogue() to authenticated;

-- Navigation gating. Member, guard or staff of that society only.
create or replace function public.my_society_features(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (
    public.is_platform_admin_or_sales()
    or exists (select 1 from public.society_memberships m
                where m.society_id = p_society_id and m.user_id = v_uid and m.status = 'active')
    or exists (select 1 from public.society_guards g
                where g.society_id = p_society_id and g.user_id = v_uid and g.status = 'active')
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', f.key, 'name', f.name, 'is_core', f.is_core,
             'enabled', public._feature_enabled(p_society_id, f.key)
           ) order by f.sort_order), '[]'::jsonb)
      from public.platform_features f
     where f.has_module
  );
end;
$$;
revoke all on function public.my_society_features(uuid) from public, anon;
grant execute on function public.my_society_features(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared field validation for the registration fields.
-- ---------------------------------------------------------------------------
create or replace function app_private.assert_registration_fields(
  p_registration_number text,
  p_society_type        text,
  p_registration_date   date,
  p_official_email      text,
  p_official_phone      text,
  p_country             text
)
returns void
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_registration_number is not null
     and char_length(trim(p_registration_number)) not between 1 and 60 then
    raise exception 'INVALID_REGISTRATION_NUMBER';
  end if;
  if p_society_type is not null and p_society_type not in
     ('cooperative_housing', 'apartment_association', 'gated_community', 'condominium',
      'rwa', 'mixed_use', 'commercial', 'other') then
    raise exception 'INVALID_SOCIETY_TYPE';
  end if;
  if p_official_email is not null and not app_private.valid_email(lower(trim(p_official_email))) then
    raise exception 'INVALID_OFFICIAL_EMAIL';
  end if;
  if p_official_phone is not null and trim(p_official_phone) !~ '^[0-9+() -]{6,20}$' then
    raise exception 'INVALID_OFFICIAL_PHONE';
  end if;
  if p_country is not null and char_length(trim(p_country)) not between 2 and 60 then
    raise exception 'INVALID_COUNTRY';
  end if;
end;
$$;
revoke all on function app_private.assert_registration_fields(text, text, date, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_register_society: admin_create_society plus the registration fields,
-- feature grants, and (optionally) closing a connect request. Authorities are
-- p_authorities merged with the numbers on the request; p_authorities wins on
-- the name for a phone in both. A request number with no name uses the contact's
-- name for the primary and "Authority" otherwise; staff can edit it later.
-- ---------------------------------------------------------------------------
create or replace function public.admin_register_society(
  p_name                text,
  p_address_line        text,
  p_city                text,
  p_state               text,
  p_pincode             text,
  p_landmark            text default null,
  p_authorities         jsonb default '[]'::jsonb,
  p_request_id          uuid default null,
  p_registration_number text default null,
  p_society_type        text default null,
  p_registration_date   date default null,
  p_official_email      text default null,
  p_official_phone      text default null,
  p_country             text default 'India',
  p_features            text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_req     public.society_enrollment_requests;
  v_auth    jsonb := coalesce(p_authorities, '[]'::jsonb);
  v_seen    text[] := '{}';
  v_item    jsonb;
  v_phone   text;
  v_result  jsonb;
  v_society uuid;
  v_key     text;
  v_number  text := nullif(trim(coalesce(p_registration_number, '')), '');
begin
  perform app_private.assert_platform_staff();
  perform app_private.assert_registration_fields(
    v_number, p_society_type, p_registration_date, nullif(trim(coalesce(p_official_email, '')), ''),
    nullif(trim(coalesce(p_official_phone, '')), ''), p_country);
  if p_registration_date is not null and p_registration_date > current_date then
    raise exception 'INVALID_REGISTRATION_DATE';
  end if;
  if jsonb_typeof(v_auth) <> 'array' then raise exception 'INVALID_AUTHORITY_NAME'; end if;

  if v_number is not null and exists (
    select 1 from public.societies s
     where lower(trim(s.registration_number)) = lower(v_number)
       and lower(trim(coalesce(s.state, ''))) = lower(trim(coalesce(p_state, '')))
  ) then
    raise exception 'DUPLICATE_REGISTRATION_NUMBER';
  end if;

  foreach v_key in array coalesce(p_features, '{}') loop
    if not exists (select 1 from public.platform_features f where f.key = v_key and f.has_module) then
      raise exception 'UNKNOWN_FEATURE';
    end if;
  end loop;

  if p_request_id is not null then
    select * into v_req from public.society_enrollment_requests
     where id = p_request_id for update;
    if v_req.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
    if v_req.society_id is not null or v_req.status in ('registered', 'approved') then
      raise exception 'REQUEST_ALREADY_REGISTERED';
    end if;
    if v_req.status = 'rejected' then raise exception 'REQUEST_REJECTED'; end if;

    for v_item in select * from jsonb_array_elements(v_auth) loop
      v_phone := right(regexp_replace(coalesce(v_item ->> 'phone', ''), '\D', '', 'g'), 10);
      v_seen := v_seen || v_phone;
    end loop;
    for v_item in select * from jsonb_array_elements(v_req.authority_numbers) loop
      if (v_item ->> 'phone') = any (v_seen) then continue; end if;
      v_seen := v_seen || (v_item ->> 'phone');
      v_auth := v_auth || jsonb_build_object(
        'name', coalesce(v_item ->> 'name', 'Authority'), 'phone', v_item ->> 'phone');
    end loop;
    -- Requests from the older form hold only the contact phone.
    v_phone := right(regexp_replace(v_req.phone, '\D', '', 'g'), 10);
    if not v_phone = any (v_seen) then
      v_auth := v_auth || jsonb_build_object('name', v_req.contact_name, 'phone', v_phone);
    end if;
  end if;

  -- Validates address and authorities, creates the society, authorities and code.
  v_result := public.admin_create_society(
    p_name, p_address_line, p_city, p_state, p_pincode, p_landmark, v_auth, null);
  v_society := (v_result ->> 'society_id')::uuid;

  update public.societies
     set registration_number = v_number,
         society_type = p_society_type,
         registration_date = p_registration_date,
         official_email = nullif(lower(trim(coalesce(p_official_email, ''))), ''),
         official_phone = nullif(trim(coalesce(p_official_phone, '')), ''),
         country = coalesce(nullif(trim(coalesce(p_country, '')), ''), 'India')
   where id = v_society;

  foreach v_key in array coalesce(p_features, '{}') loop
    insert into public.society_features (society_id, feature_key, enabled, granted_by)
    values (v_society, v_key, true, v_uid)
    on conflict (society_id, feature_key) do update set enabled = true, granted_by = v_uid, granted_at = now();
  end loop;

  if p_request_id is not null then
    update public.society_enrollment_requests
       set status = 'registered', society_id = v_society, registered_at = now(),
           handled_by = v_uid, updated_at = now()
     where id = p_request_id;
    insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
    values (v_society, v_uid, 'connect.registered', 'society_enrollment_requests', p_request_id,
            jsonb_build_object('society_id', v_society));
  end if;

  return v_result || jsonb_build_object('request_id', p_request_id, 'features', to_jsonb(coalesce(p_features, '{}')));
end;
$$;
revoke all on function public.admin_register_society(text, text, text, text, text, text, jsonb, uuid, text, text, date, text, text, text, text[])
  from public, anon;
grant execute on function public.admin_register_society(text, text, text, text, text, text, jsonb, uuid, text, text, date, text, text, text, text[])
  to authenticated;

-- Fill in or correct registration fields on an existing society. NULL = unchanged.
create or replace function public.admin_update_society_registration(
  p_society_id          uuid,
  p_registration_number text default null,
  p_society_type        text default null,
  p_registration_date   date default null,
  p_official_email      text default null,
  p_official_phone      text default null,
  p_country             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    public.societies;
  v_number text := nullif(trim(coalesce(p_registration_number, '')), '');
begin
  perform app_private.assert_platform_staff();
  select * into v_row from public.societies where id = p_society_id for update;
  if v_row.id is null then raise exception 'SOCIETY_NOT_FOUND'; end if;

  perform app_private.assert_registration_fields(
    v_number, p_society_type, p_registration_date, nullif(trim(coalesce(p_official_email, '')), ''),
    nullif(trim(coalesce(p_official_phone, '')), ''), p_country);
  if p_registration_date is not null and p_registration_date > current_date then
    raise exception 'INVALID_REGISTRATION_DATE';
  end if;
  if v_number is not null and exists (
    select 1 from public.societies s
     where s.id <> p_society_id
       and lower(trim(s.registration_number)) = lower(v_number)
       and lower(trim(coalesce(s.state, ''))) = lower(trim(coalesce(v_row.state, '')))
  ) then
    raise exception 'DUPLICATE_REGISTRATION_NUMBER';
  end if;

  update public.societies
     set registration_number = coalesce(v_number, registration_number),
         society_type = coalesce(p_society_type, society_type),
         registration_date = coalesce(p_registration_date, registration_date),
         official_email = coalesce(nullif(lower(trim(coalesce(p_official_email, ''))), ''), official_email),
         official_phone = coalesce(nullif(trim(coalesce(p_official_phone, '')), ''), official_phone),
         country = coalesce(nullif(trim(coalesce(p_country, '')), ''), country)
   where id = p_society_id
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, auth.uid(), 'society.registration_updated', 'societies', p_society_id, '{}'::jsonb);

  return public.get_society_registration(p_society_id);
end;
$$;

-- Read the registration block. Society members and staff only.
create or replace function public.get_society_registration(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (
    public.is_platform_admin_or_sales()
    or exists (select 1 from public.society_memberships m
                where m.society_id = p_society_id and m.user_id = v_uid and m.status = 'active')
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;
  return (
    select jsonb_build_object(
      'id', s.id, 'name', s.name, 'registration_number', s.registration_number,
      'society_type', s.society_type, 'registration_date', s.registration_date,
      'official_email', s.official_email, 'official_phone', s.official_phone,
      'address_line', s.address_line, 'landmark', s.landmark, 'city', s.city,
      'state', s.state, 'pincode', s.pincode, 'country', s.country,
      'service_status', s.service_status, 'setup_completed_at', s.setup_completed_at,
      'code', (select c.code from public.society_codes c
                where c.society_id = s.id and c.revoked_at is null limit 1)
    )
    from public.societies s where s.id = p_society_id
  );
end;
$$;
revoke all on function public.get_society_registration(uuid) from public, anon;
grant execute on function public.get_society_registration(uuid) to authenticated;
revoke all on function public.admin_update_society_registration(uuid, text, text, date, text, text, text) from public, anon;
grant execute on function public.admin_update_society_registration(uuid, text, text, date, text, text, text) to authenticated;
