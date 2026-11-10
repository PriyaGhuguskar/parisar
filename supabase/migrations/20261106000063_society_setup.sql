-- ============================================================================
-- Migration 063: society setup. Floors as records, flat attributes, wing code,
-- duplicate prevention. Progress and completion are in 064.
--
-- bootstrap_society_structure and secretary_add_wing keep working. Flats from
-- them simply have floor_id NULL.
-- ============================================================================

alter table public.wings
  add column if not exists code text,
  add column if not exists sort_order int not null default 0;

alter table public.wings drop constraint if exists wings_code_shape;
alter table public.wings
  add constraint wings_code_shape check (code is null or code ~ '^[A-Z0-9-]{1,10}$');

create unique index if not exists wings_society_code_key
  on public.wings (society_id, code) where code is not null;

-- Needed so floors can carry a composite FK and never point across societies.
alter table public.wings drop constraint if exists wings_id_society_key;
alter table public.wings add constraint wings_id_society_key unique (id, society_id);

create table if not exists public.floors (
  id         uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  wing_id    uuid not null,
  number     int not null,
  name       text,
  flat_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint floors_wing_fk foreign key (wing_id, society_id)
    references public.wings (id, society_id) on delete cascade,
  constraint floors_wing_number_key unique (wing_id, number),
  constraint floors_id_society_key unique (id, society_id),
  constraint floors_number_range check (number between -10 and 300),
  constraint floors_name_len check (name is null or char_length(name) between 1 and 40),
  constraint floors_flat_count_range check (flat_count between 0 and 500)
);
create index if not exists idx_floors_society on public.floors (society_id);

alter table public.floors enable row level security;
revoke all on public.floors from anon, authenticated;
grant select on public.floors to authenticated;

drop policy if exists floors_tenant_select on public.floors;
create policy floors_tenant_select on public.floors
  for select to authenticated
  using (society_id = (select public.current_society_id()));
drop policy if exists admin_view_select on public.floors;
create policy admin_view_select on public.floors
  for select to authenticated
  using (society_id = public.admin_viewing_society());

drop trigger if exists guard_society_service on public.floors;
create trigger guard_society_service
  before insert or update or delete on public.floors
  for each row execute function public.guard_society_service_write();

alter table public.flats
  add column if not exists floor_id     uuid references public.floors(id) on delete set null,
  add column if not exists flat_type    text,
  add column if not exists area_sqft    numeric(9, 2),
  add column if not exists bedrooms     smallint,
  add column if not exists parking_slot text,
  add column if not exists status       text not null default 'vacant';

alter table public.flats
  drop constraint if exists flats_flat_type_check,
  drop constraint if exists flats_area_sqft_check,
  drop constraint if exists flats_bedrooms_check,
  drop constraint if exists flats_parking_slot_len,
  drop constraint if exists flats_status_check;
alter table public.flats
  add constraint flats_flat_type_check check (flat_type is null or flat_type in
    ('1rk', '1bhk', '2bhk', '3bhk', '4bhk', '5bhk_plus', 'studio', 'duplex', 'penthouse', 'shop', 'office', 'other')),
  add constraint flats_area_sqft_check check (area_sqft is null or area_sqft between 1 and 1000000),
  add constraint flats_bedrooms_check check (bedrooms is null or bedrooms between 0 and 20),
  add constraint flats_parking_slot_len check (parking_slot is null or char_length(parking_slot) <= 40),
  add constraint flats_status_check check (status in ('occupied', 'vacant', 'under_construction', 'maintenance'));

create index if not exists idx_flats_floor on public.flats (floor_id);

-- Flats that have someone living in them are occupied.
update public.flats f
   set status = 'occupied'
 where f.status = 'vacant'
   and exists (select 1 from public.society_memberships m
                where m.flat_id = f.id and m.status = 'active');

-- Case-insensitive flat uniqueness per wing, only if existing data allows it.
-- The RPCs below check it either way.
do $$
begin
  if not exists (
    select 1 from public.flats
     group by wing_id, lower(trim(number)) having count(*) > 1
  ) then
    create unique index if not exists flats_wing_number_ci_key
      on public.flats (wing_id, lower(trim(number)));
  else
    raise notice '063: skipped flats_wing_number_ci_key; existing case-variant flat numbers';
  end if;
end
$$;

-- Occupancy shown on dashboards. A flat with an active resident counts as occupied
-- even when nobody updated its stored status.
create or replace function app_private.flat_effective_status(p_flat uuid, p_status text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_status in ('under_construction', 'maintenance') then p_status
    when p_status = 'occupied' then 'occupied'
    when exists (select 1 from public.society_memberships m
                  where m.flat_id = p_flat and m.status = 'active') then 'occupied'
    else 'vacant'
  end
$$;
revoke all on function app_private.flat_effective_status(uuid, text) from public, anon, authenticated;

create or replace function app_private.flat_json(f public.flats)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', f.id, 'wing_id', f.wing_id, 'floor_id', f.floor_id, 'number', f.number,
    'flat_type', f.flat_type, 'area_sqft', f.area_sqft, 'bedrooms', f.bedrooms,
    'parking_slot', f.parking_slot, 'status', f.status,
    'effective_status', app_private.flat_effective_status(f.id, f.status))
$$;
revoke all on function app_private.flat_json(public.flats) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wings
-- ---------------------------------------------------------------------------
create or replace function public.setup_upsert_wing(
  p_society_id uuid,
  p_name       text,
  p_code       text default null,
  p_wing_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_code text := nullif(upper(trim(coalesce(p_code, ''))), '');
  v_row  public.wings;
begin
  perform app_private.assert_can_manage(p_society_id);
  if char_length(v_name) not between 1 and 40 then raise exception 'INVALID_WING_NAME'; end if;
  if v_code is not null and v_code !~ '^[A-Z0-9-]{1,10}$' then raise exception 'INVALID_WING_CODE'; end if;

  perform pg_advisory_xact_lock(hashtext('setup:' || p_society_id::text));

  if exists (select 1 from public.wings w
              where w.society_id = p_society_id and lower(w.name) = lower(v_name)
                and w.id is distinct from p_wing_id) then
    raise exception 'WING_NAME_EXISTS';
  end if;
  if v_code is not null and exists (
    select 1 from public.wings w
     where w.society_id = p_society_id and w.code = v_code and w.id is distinct from p_wing_id) then
    raise exception 'WING_CODE_EXISTS';
  end if;

  if p_wing_id is null then
    insert into public.wings (society_id, name, code)
    values (p_society_id, v_name, v_code)
    returning * into v_row;
  else
    update public.wings set name = v_name, code = v_code
     where id = p_wing_id and society_id = p_society_id
    returning * into v_row;
    if v_row.id is null then raise exception 'WING_NOT_FOUND'; end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'society_id', v_row.society_id, 'name', v_row.name, 'code', v_row.code);
end;
$$;
revoke all on function public.setup_upsert_wing(uuid, text, text, uuid) from public, anon;
grant execute on function public.setup_upsert_wing(uuid, text, text, uuid) to authenticated;

create or replace function public.setup_delete_wing(p_wing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.wings;
begin
  select * into v_row from public.wings where id = p_wing_id;
  if v_row.id is null then raise exception 'WING_NOT_FOUND'; end if;
  perform app_private.assert_can_manage(v_row.society_id);
  begin
    delete from public.wings where id = p_wing_id;
  exception when foreign_key_violation then
    raise exception 'WING_IN_USE';
  end;
  return jsonb_build_object('deleted', p_wing_id);
end;
$$;
revoke all on function public.setup_delete_wing(uuid) from public, anon;
grant execute on function public.setup_delete_wing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Floors
-- ---------------------------------------------------------------------------
create or replace function public.setup_upsert_floor(
  p_society_id uuid,
  p_wing_id    uuid,
  p_number     int,
  p_name       text default null,
  p_flat_count int default 0,
  p_floor_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_row  public.floors;
begin
  perform app_private.assert_can_manage(p_society_id);
  if not exists (select 1 from public.wings w where w.id = p_wing_id and w.society_id = p_society_id) then
    raise exception 'WING_NOT_FOUND';
  end if;
  if p_number is null or p_number not between -10 and 300 then raise exception 'INVALID_FLOOR_NUMBER'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'INVALID_FLOOR_NAME'; end if;
  if coalesce(p_flat_count, 0) not between 0 and 500 then raise exception 'INVALID_FLAT_COUNT'; end if;

  perform pg_advisory_xact_lock(hashtext('setup:' || p_society_id::text));

  if exists (select 1 from public.floors f
              where f.wing_id = p_wing_id and f.number = p_number
                and f.id is distinct from p_floor_id) then
    raise exception 'FLOOR_EXISTS';
  end if;

  if p_floor_id is null then
    insert into public.floors (society_id, wing_id, number, name, flat_count, created_by)
    values (p_society_id, p_wing_id, p_number, v_name, coalesce(p_flat_count, 0), auth.uid())
    returning * into v_row;
  else
    -- A floor holding flats cannot move wings: the flats would silently move too.
    if exists (select 1 from public.flats f where f.floor_id = p_floor_id and f.wing_id <> p_wing_id) then
      raise exception 'FLOOR_HAS_FLATS';
    end if;
    update public.floors
       set wing_id = p_wing_id, number = p_number, name = v_name, flat_count = coalesce(p_flat_count, 0)
     where id = p_floor_id and society_id = p_society_id
    returning * into v_row;
    if v_row.id is null then raise exception 'FLOOR_NOT_FOUND'; end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'society_id', v_row.society_id, 'wing_id', v_row.wing_id,
                            'number', v_row.number, 'name', v_row.name, 'flat_count', v_row.flat_count);
end;
$$;
revoke all on function public.setup_upsert_floor(uuid, uuid, int, text, int, uuid) from public, anon;
grant execute on function public.setup_upsert_floor(uuid, uuid, int, text, int, uuid) to authenticated;

create or replace function public.setup_delete_floor(p_floor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.floors;
begin
  select * into v_row from public.floors where id = p_floor_id;
  if v_row.id is null then raise exception 'FLOOR_NOT_FOUND'; end if;
  perform app_private.assert_can_manage(v_row.society_id);
  if exists (select 1 from public.flats f where f.floor_id = p_floor_id) then
    raise exception 'FLOOR_HAS_FLATS';
  end if;
  delete from public.floors where id = p_floor_id;
  return jsonb_build_object('deleted', p_floor_id);
end;
$$;
revoke all on function public.setup_delete_floor(uuid) from public, anon;
grant execute on function public.setup_delete_floor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Flats
-- ---------------------------------------------------------------------------
-- Validates one flat payload and returns it normalised. Raises on bad input.
create or replace function app_private.normalise_flat(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_number  text := trim(coalesce(p ->> 'number', ''));
  v_type    text := nullif(lower(trim(coalesce(p ->> 'flat_type', ''))), '');
  v_status  text := coalesce(nullif(lower(trim(coalesce(p ->> 'status', ''))), ''), 'vacant');
  v_parking text := nullif(trim(coalesce(p ->> 'parking_slot', '')), '');
  v_area    numeric;
  v_beds    int;
begin
  if char_length(v_number) not between 1 and 20 then raise exception 'INVALID_FLAT_NUMBER'; end if;
  if v_type is not null and v_type not in
     ('1rk', '1bhk', '2bhk', '3bhk', '4bhk', '5bhk_plus', 'studio', 'duplex', 'penthouse', 'shop', 'office', 'other') then
    raise exception 'INVALID_FLAT_TYPE';
  end if;
  if v_status not in ('occupied', 'vacant', 'under_construction', 'maintenance') then
    raise exception 'INVALID_FLAT_STATUS';
  end if;
  if v_parking is not null and char_length(v_parking) > 40 then raise exception 'INVALID_PARKING_SLOT'; end if;
  begin
    v_area := nullif(trim(coalesce(p ->> 'area_sqft', '')), '')::numeric;
    v_beds := nullif(trim(coalesce(p ->> 'bedrooms', '')), '')::int;
  exception when others then
    raise exception 'INVALID_FLAT_DETAILS';
  end;
  if v_area is not null and v_area not between 1 and 1000000 then raise exception 'INVALID_AREA'; end if;
  if v_beds is not null and v_beds not between 0 and 20 then raise exception 'INVALID_BEDROOMS'; end if;

  return jsonb_build_object('number', v_number, 'flat_type', v_type, 'status', v_status,
                            'parking_slot', v_parking, 'area_sqft', v_area, 'bedrooms', v_beds);
end;
$$;
revoke all on function app_private.normalise_flat(jsonb) from public, anon, authenticated;

create or replace function public.setup_upsert_flat(
  p_society_id   uuid,
  p_wing_id      uuid,
  p_floor_id     uuid,
  p_number       text,
  p_flat_type    text default null,
  p_area_sqft    numeric default null,
  p_bedrooms     int default null,
  p_parking_slot text default null,
  p_status       text default 'vacant',
  p_flat_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n   jsonb;
  v_row public.flats;
begin
  perform app_private.assert_can_manage(p_society_id);
  if not exists (select 1 from public.wings w where w.id = p_wing_id and w.society_id = p_society_id) then
    raise exception 'WING_NOT_FOUND';
  end if;
  if p_floor_id is not null and not exists (
    select 1 from public.floors f
     where f.id = p_floor_id and f.society_id = p_society_id and f.wing_id = p_wing_id) then
    raise exception 'FLOOR_NOT_FOUND';
  end if;

  v_n := app_private.normalise_flat(jsonb_build_object(
    'number', p_number, 'flat_type', p_flat_type, 'area_sqft', p_area_sqft,
    'bedrooms', p_bedrooms, 'parking_slot', p_parking_slot, 'status', p_status));

  perform pg_advisory_xact_lock(hashtext('setup:' || p_society_id::text));

  if exists (select 1 from public.flats f
              where f.wing_id = p_wing_id and lower(trim(f.number)) = lower(v_n ->> 'number')
                and f.id is distinct from p_flat_id) then
    raise exception 'FLAT_EXISTS';
  end if;

  if p_flat_id is null then
    insert into public.flats
      (society_id, wing_id, floor_id, number, flat_type, area_sqft, bedrooms, parking_slot, status)
    values (p_society_id, p_wing_id, p_floor_id, v_n ->> 'number', v_n ->> 'flat_type',
            (v_n ->> 'area_sqft')::numeric, (v_n ->> 'bedrooms')::smallint,
            v_n ->> 'parking_slot', v_n ->> 'status')
    returning * into v_row;
  else
    update public.flats
       set wing_id = p_wing_id, floor_id = p_floor_id, number = v_n ->> 'number',
           flat_type = v_n ->> 'flat_type', area_sqft = (v_n ->> 'area_sqft')::numeric,
           bedrooms = (v_n ->> 'bedrooms')::smallint, parking_slot = v_n ->> 'parking_slot',
           status = v_n ->> 'status'
     where id = p_flat_id and society_id = p_society_id
    returning * into v_row;
    if v_row.id is null then raise exception 'FLAT_NOT_FOUND'; end if;
  end if;

  return app_private.flat_json(v_row);
end;
$$;
revoke all on function public.setup_upsert_flat(uuid, uuid, uuid, text, text, numeric, int, text, text, uuid) from public, anon;
grant execute on function public.setup_upsert_flat(uuid, uuid, uuid, text, text, numeric, int, text, text, uuid) to authenticated;

-- All or nothing: one duplicate or invalid flat fails the whole call.
create or replace function public.setup_bulk_create_flats(
  p_society_id uuid,
  p_floor_id   uuid,
  p_flats      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_floor public.floors;
  v_item  jsonb;
  v_n     jsonb;
  v_row   public.flats;
  v_seen  text[] := '{}';
  v_out   jsonb := '[]'::jsonb;
begin
  perform app_private.assert_can_manage(p_society_id);
  select * into v_floor from public.floors f where f.id = p_floor_id and f.society_id = p_society_id;
  if v_floor.id is null then raise exception 'FLOOR_NOT_FOUND'; end if;
  if p_flats is null or jsonb_typeof(p_flats) <> 'array' or jsonb_array_length(p_flats) = 0 then
    raise exception 'INVALID_FLATS';
  end if;
  if jsonb_array_length(p_flats) > 500 then raise exception 'TOO_MANY_FLATS'; end if;

  perform pg_advisory_xact_lock(hashtext('setup:' || p_society_id::text));

  for v_item in select * from jsonb_array_elements(p_flats) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'INVALID_FLATS'; end if;
    v_n := app_private.normalise_flat(v_item);
    if lower(v_n ->> 'number') = any (v_seen)
       or exists (select 1 from public.flats f
                   where f.wing_id = v_floor.wing_id and lower(trim(f.number)) = lower(v_n ->> 'number')) then
      raise exception 'FLAT_EXISTS: %', v_n ->> 'number';
    end if;
    v_seen := v_seen || lower(v_n ->> 'number');

    insert into public.flats
      (society_id, wing_id, floor_id, number, flat_type, area_sqft, bedrooms, parking_slot, status)
    values (p_society_id, v_floor.wing_id, v_floor.id, v_n ->> 'number', v_n ->> 'flat_type',
            (v_n ->> 'area_sqft')::numeric, (v_n ->> 'bedrooms')::smallint,
            v_n ->> 'parking_slot', v_n ->> 'status')
    returning * into v_row;
    v_out := v_out || app_private.flat_json(v_row);
  end loop;

  return jsonb_build_object('created', jsonb_array_length(v_out), 'flats', v_out);
end;
$$;
revoke all on function public.setup_bulk_create_flats(uuid, uuid, jsonb) from public, anon;
grant execute on function public.setup_bulk_create_flats(uuid, uuid, jsonb) to authenticated;

create or replace function public.setup_delete_flat(p_flat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.flats;
begin
  select * into v_row from public.flats where id = p_flat_id;
  if v_row.id is null then raise exception 'FLAT_NOT_FOUND'; end if;
  perform app_private.assert_can_manage(v_row.society_id);
  begin
    delete from public.flats where id = p_flat_id;
  exception when foreign_key_violation then
    raise exception 'FLAT_IN_USE';
  end;
  return jsonb_build_object('deleted', p_flat_id);
end;
$$;
revoke all on function public.setup_delete_flat(uuid) from public, anon;
grant execute on function public.setup_delete_flat(uuid) to authenticated;
