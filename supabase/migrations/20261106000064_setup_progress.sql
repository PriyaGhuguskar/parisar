-- ============================================================================
-- Migration 064: setup progress. Draft per step, optional-step skip, completion.
--
-- Steps (key, required):
--   society_details  no   authorities  no   wings  YES   floors  YES   flats  YES
--   amenities        no   staff        no   guards no    residents_import  no
-- Completion also needs at least one wing, floor and flat to really exist; a step
-- marked done does not count on its own.
-- ============================================================================

create table if not exists public.society_setup_steps (
  society_id uuid not null references public.societies(id) on delete cascade,
  step_key   text not null,
  status     text not null default 'draft',
  draft      jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (society_id, step_key),
  constraint society_setup_steps_status check (status in ('draft', 'completed', 'skipped'))
);
alter table public.society_setup_steps enable row level security;
revoke all on public.society_setup_steps from anon, authenticated;

drop trigger if exists guard_society_service on public.society_setup_steps;
create trigger guard_society_service
  before insert or update or delete on public.society_setup_steps
  for each row execute function public.guard_society_service_write();

-- NULL = not a step.
create or replace function app_private.setup_step_required(p_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_key in ('wings', 'floors', 'flats') then true
    when p_key in ('society_details', 'authorities', 'amenities', 'staff', 'guards', 'residents_import') then false
  end
$$;
revoke all on function app_private.setup_step_required(text) from public, anon, authenticated;

create or replace function public.setup_get_state(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_soc    public.societies;
  v_wings  int;
  v_floors int;
  v_flats  int;
begin
  perform app_private.assert_can_manage(p_society_id);
  select * into v_soc from public.societies where id = p_society_id;

  select count(*) into v_wings from public.wings where society_id = p_society_id;
  select count(*) into v_floors from public.floors where society_id = p_society_id;
  select count(*) into v_flats from public.flats where society_id = p_society_id;

  return jsonb_build_object(
    'society', jsonb_build_object(
      'id', v_soc.id, 'name', v_soc.name,
      'setup_completed_at', v_soc.setup_completed_at,
      'code', (select c.code from public.society_codes c
                where c.society_id = v_soc.id and c.revoked_at is null limit 1)),
    'counts', jsonb_build_object('wings', v_wings, 'floors', v_floors, 'flats', v_flats),
    'can_complete', v_wings > 0 and v_floors > 0 and v_flats > 0,
    'steps', (
      select jsonb_agg(jsonb_build_object(
               'key', k.key, 'required', app_private.setup_step_required(k.key),
               'status', coalesce(s.status, 'pending'),
               'draft', s.draft, 'updated_at', s.updated_at) order by k.ord)
        from unnest(array['society_details', 'authorities', 'wings', 'floors', 'flats',
                          'amenities', 'staff', 'guards', 'residents_import'])
             with ordinality as k(key, ord)
        left join public.society_setup_steps s
          on s.society_id = p_society_id and s.step_key = k.key),
    'wings', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', w.id, 'name', w.name, 'code', w.code,
               'floors', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', fl.id, 'number', fl.number, 'name', fl.name, 'flat_count', fl.flat_count,
                          'flats', (select coalesce(jsonb_agg(app_private.flat_json(f) order by f.number), '[]'::jsonb)
                                      from public.flats f where f.floor_id = fl.id)
                        ) order by fl.number), '[]'::jsonb)
                   from public.floors fl where fl.wing_id = w.id),
               'unassigned_flats', (
                 select coalesce(jsonb_agg(app_private.flat_json(f) order by f.number), '[]'::jsonb)
                   from public.flats f where f.wing_id = w.id and f.floor_id is null)
             ) order by w.sort_order, w.name), '[]'::jsonb)
        from public.wings w where w.society_id = p_society_id)
  );
end;
$$;
revoke all on function public.setup_get_state(uuid) from public, anon;
grant execute on function public.setup_get_state(uuid) to authenticated;

-- Autosave for a step. Saving a draft on a finished step reopens it.
create or replace function public.setup_save_draft(p_society_id uuid, p_step text, p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.assert_can_manage(p_society_id);
  if app_private.setup_step_required(p_step) is null then raise exception 'INVALID_STEP'; end if;
  if p_draft is null or pg_column_size(p_draft) > 262144 then raise exception 'INVALID_DRAFT'; end if;

  insert into public.society_setup_steps (society_id, step_key, status, draft, updated_by, updated_at)
  values (p_society_id, p_step, 'draft', p_draft, auth.uid(), now())
  on conflict (society_id, step_key) do update
    set status = 'draft', draft = excluded.draft, updated_by = excluded.updated_by, updated_at = now();

  return jsonb_build_object('step', p_step, 'status', 'draft');
end;
$$;
revoke all on function public.setup_save_draft(uuid, text, jsonb) from public, anon;
grant execute on function public.setup_save_draft(uuid, text, jsonb) to authenticated;

create or replace function public.setup_complete_step(p_society_id uuid, p_step text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.assert_can_manage(p_society_id);
  if app_private.setup_step_required(p_step) is null then raise exception 'INVALID_STEP'; end if;

  if (p_step = 'wings' and not exists (select 1 from public.wings where society_id = p_society_id))
     or (p_step = 'floors' and not exists (select 1 from public.floors where society_id = p_society_id))
     or (p_step = 'flats' and not exists (select 1 from public.flats where society_id = p_society_id)) then
    raise exception 'STEP_INCOMPLETE';
  end if;

  insert into public.society_setup_steps (society_id, step_key, status, updated_by, updated_at)
  values (p_society_id, p_step, 'completed', auth.uid(), now())
  on conflict (society_id, step_key) do update
    set status = 'completed', updated_by = excluded.updated_by, updated_at = now();

  return jsonb_build_object('step', p_step, 'status', 'completed');
end;
$$;
revoke all on function public.setup_complete_step(uuid, text) from public, anon;
grant execute on function public.setup_complete_step(uuid, text) to authenticated;

create or replace function public.setup_skip_step(p_society_id uuid, p_step text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required boolean := app_private.setup_step_required(p_step);
begin
  perform app_private.assert_can_manage(p_society_id);
  if v_required is null then raise exception 'INVALID_STEP'; end if;
  if v_required then raise exception 'STEP_NOT_SKIPPABLE'; end if;

  insert into public.society_setup_steps (society_id, step_key, status, updated_by, updated_at)
  values (p_society_id, p_step, 'skipped', auth.uid(), now())
  on conflict (society_id, step_key) do update
    set status = 'skipped', updated_by = excluded.updated_by, updated_at = now();

  return jsonb_build_object('step', p_step, 'status', 'skipped');
end;
$$;
revoke all on function public.setup_skip_step(uuid, text) from public, anon;
grant execute on function public.setup_skip_step(uuid, text) to authenticated;

create or replace function public.setup_complete(p_society_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_wings  int;
  v_floors int;
  v_flats  int;
  v_at     timestamptz;
begin
  perform app_private.assert_can_manage(p_society_id);
  perform pg_advisory_xact_lock(hashtext('setup:' || p_society_id::text));

  select count(*) into v_wings from public.wings where society_id = p_society_id;
  select count(*) into v_floors from public.floors where society_id = p_society_id;
  select count(*) into v_flats from public.flats where society_id = p_society_id;

  if v_wings = 0 then raise exception 'SETUP_NEEDS_WING'; end if;
  if v_floors = 0 then raise exception 'SETUP_NEEDS_FLOOR'; end if;
  if v_flats = 0 then raise exception 'SETUP_NEEDS_FLAT'; end if;

  insert into public.society_setup_steps (society_id, step_key, status, updated_by, updated_at)
  select p_society_id, k, 'completed', v_uid, now()
    from unnest(array['wings', 'floors', 'flats']) as k
  on conflict (society_id, step_key) do update
    set status = 'completed', updated_by = excluded.updated_by, updated_at = now();

  update public.societies
     set setup_completed_at = coalesce(setup_completed_at, now()),
         setup_completed_by = coalesce(setup_completed_by, v_uid)
   where id = p_society_id
  returning setup_completed_at into v_at;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'setup.completed', 'societies', p_society_id,
          jsonb_build_object('wings', v_wings, 'floors', v_floors, 'flats', v_flats));

  return jsonb_build_object(
    'society_id', p_society_id,
    'setup_completed_at', v_at,
    'counts', jsonb_build_object('wings', v_wings, 'floors', v_floors, 'flats', v_flats),
    'setup_state', app_private.authority_setup_state(p_society_id, v_uid)
  );
end;
$$;
revoke all on function public.setup_complete(uuid) from public, anon;
grant execute on function public.setup_complete(uuid) to authenticated;
