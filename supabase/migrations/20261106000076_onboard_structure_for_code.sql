-- ============================================================================
-- Migration 076: wing / floor / flat picker for personal onboarding.
--
-- onboard_flats_for_code (054) returns wings with flats but no floors, so the
-- onboarding wizard cannot offer Wing -> Floor -> Flat. This adds a sibling RPC
-- with the same gate, throttle and failure ledger, returning floors as records
-- (migration 063) and each flat's floor. Nothing about people is returned: only
-- whether a flat already has an active resident ("taken"), exactly what
-- onboard_flats_for_code already exposes. onboard_flats_for_code is unchanged.
--
-- Caller: signed in (no membership needed). Society is found by CODE only, never
-- by id, so a caller cannot browse another society's structure.
-- ============================================================================

create or replace function public.onboard_structure_for_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.society_codes;
  v_soc uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_code_attempts_ok(v_uid);

  select * into v_row from public.society_codes
   where code = upper(trim(coalesce(p_code, ''))) and revoked_at is null;
  if not found then
    perform app_private.record_code_failure(v_uid, 'INVALID_CODE');
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  -- Same exception as onboard_flats_for_code: a flat-less authority of the
  -- society may still pick their own flat while the code is paused.
  if v_row.paused_at is not null and not exists (
       select 1 from public.society_memberships m
        where m.society_id = v_row.society_id and m.user_id = v_uid
          and m.status = 'active' and m.flat_id is null
          and m.role in ('secretary', 'co_secretary')) then
    perform app_private.record_code_failure(v_uid, 'CODE_PAUSED');
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select s.name from public.societies s where s.id = v_soc),
    'wings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'code', w.code,
        'floors', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', fl.id, 'number', fl.number, 'name', fl.name
          ) order by fl.number), '[]'::jsonb)
          from public.floors fl where fl.wing_id = w.id
        ),
        'flats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id,
            'number', f.number,
            'floor_id', f.floor_id,
            'status', app_private.flat_effective_status(f.id, f.status),
            'taken', exists (select 1 from public.society_memberships m
                              where m.flat_id = f.id and m.status = 'active')
          ) order by f.number), '[]'::jsonb)
          from public.flats f where f.wing_id = w.id
        )
      ) order by w.sort_order, w.name), '[]'::jsonb)
      from public.wings w where w.society_id = v_soc
    )
  );
end;
$$;
revoke all on function public.onboard_structure_for_code(text) from public, anon;
grant execute on function public.onboard_structure_for_code(text) to authenticated;
