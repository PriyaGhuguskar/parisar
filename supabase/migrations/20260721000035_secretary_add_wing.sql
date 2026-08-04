-- ============================================================================
-- secretary_add_wing: let an active secretary add a wing (and its flats) after
-- the society is already set up.
-- ----------------------------------------------------------------------------
-- bootstrap_society_structure covers the one-time setup wizard. Once a society
-- is live, the secretary still needs to add a wing that came online later (a new
-- building, a block that finished construction). Rather than widen the wizard
-- RPC, this is a narrow, audited door for exactly that:
--   * caller must be the society's ACTIVE secretary or co_secretary
--   * a wing name that already exists (case-insensitive) is rejected, so the
--     structure view never shows two "A" wings
--   * flat numbers are trimmed + de-duplicated within the call
-- Returns the new wing id + name + flat count for optimistic UI.
-- ============================================================================

create or replace function public.secretary_add_wing(
  p_society_id uuid,
  p_wing_name  text,
  p_flat_numbers text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := nullif(trim(p_wing_name), '');
  v_wing_id uuid;
  v_num     text;
  v_count   int := 0;
  v_seen    text[] := '{}';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_name is null then raise exception 'INVALID_WING_NAME'; end if;

  -- Caller must run this society and still be active.
  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id
      and user_id = v_uid
      and role in ('secretary', 'co_secretary')
      and status = 'active'
  ) then
    raise exception 'NOT_SECRETARY';
  end if;

  -- No duplicate wing names within a society (case-insensitive).
  if exists (
    select 1 from public.wings
    where society_id = p_society_id
      and lower(name) = lower(v_name)
  ) then
    raise exception 'WING_EXISTS';
  end if;

  insert into public.wings (society_id, name)
  values (p_society_id, v_name)
  returning id into v_wing_id;

  -- Flats: trim, drop blanks, de-dup (case-insensitive) within this call.
  if p_flat_numbers is not null then
    foreach v_num in array p_flat_numbers loop
      v_num := nullif(trim(v_num), '');
      if v_num is null then continue; end if;
      if lower(v_num) = any (select lower(x) from unnest(v_seen) x) then continue; end if;
      v_seen := array_append(v_seen, v_num);
      insert into public.flats (society_id, wing_id, number)
      values (p_society_id, v_wing_id, v_num);
      v_count := v_count + 1;
    end loop;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'wing.added', 'wings', v_wing_id,
          jsonb_build_object('name', v_name, 'flat_count', v_count));

  return jsonb_build_object('wing_id', v_wing_id, 'name', v_name, 'flat_count', v_count);
end;
$$;

grant execute on function public.secretary_add_wing(uuid, text, text[]) to authenticated;

comment on function public.secretary_add_wing(uuid, text, text[]) is
  'Active secretary/co_secretary only. Adds a wing (and optional flats) to a live society; rejects duplicate wing names. Audited as wing.added.';
