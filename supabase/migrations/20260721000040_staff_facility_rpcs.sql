-- ============================================================================
-- Staff directory + facility calendar write RPCs (SECURITY DEFINER doors).
-- ============================================================================

-- add_society_staff: ANY active resident of the society can add a staff contact.
-- Attribution (name + flat) is captured server-side from the caller's profile +
-- membership so the list can show "Added by Rahul · B-203" without a join.
create or replace function public.add_society_staff(
  p_society_id uuid, p_name text, p_phone text, p_category text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := nullif(trim(p_name), '');
  v_phone  text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_cat    public.staff_category;
  v_who    text;
  v_flat   text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_name is null then raise exception 'INVALID_NAME'; end if;
  begin v_cat := coalesce(p_category, 'other')::public.staff_category;
  exception when others then v_cat := 'other'; end;

  -- Any active member of THIS society may add.
  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid and status = 'active'
  ) then raise exception 'NOT_A_MEMBER'; end if;

  select p.full_name into v_who from public.profiles p where p.user_id = v_uid;
  select nullif(concat_ws('-', w.name, f.number), '') into v_flat
    from public.society_memberships sm
    left join public.flats f on f.id = sm.flat_id
    left join public.wings w on w.id = f.wing_id
    where sm.user_id = v_uid and sm.society_id = p_society_id and sm.status = 'active'
    limit 1;

  insert into public.society_staff (society_id, name, phone, category, added_by, added_by_name, added_by_flat)
  values (p_society_id, v_name, v_phone, v_cat, v_uid, v_who, v_flat)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.add_society_staff(uuid, text, text, text) to authenticated;

-- delete_society_staff: the adder or a secretary/co-sec may remove an entry.
create or replace function public.delete_society_staff(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.society_staff;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.society_staff where id = p_id;
  if v_row.id is null then return; end if;
  if v_row.added_by = v_uid
     or exists (select 1 from public.society_memberships m
                 where m.society_id = v_row.society_id and m.user_id = v_uid
                   and m.role in ('secretary', 'co_secretary') and m.status = 'active')
  then
    delete from public.society_staff where id = p_id;
  else
    raise exception 'NOT_ALLOWED';
  end if;
end;
$$;
grant execute on function public.delete_society_staff(uuid) to authenticated;

-- add_facility_event: secretary/co-sec schedules an event and residents are
-- notified. The next upcoming one surfaces on the home highlights strip.
create or replace function public.add_facility_event(
  p_society_id uuid, p_category text, p_title text, p_note text, p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_title text := nullif(trim(p_title), '');
  v_cat   public.facility_category;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_title is null then raise exception 'INVALID_TITLE'; end if;
  if p_starts_at is null then raise exception 'INVALID_TIME'; end if;
  begin v_cat := coalesce(p_category, 'other')::public.facility_category;
  exception when others then v_cat := 'other'; end;

  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid
      and role in ('secretary', 'co_secretary') and status = 'active'
  ) then raise exception 'NOT_SECRETARY'; end if;

  insert into public.facility_events (society_id, category, title, note, starts_at, created_by)
  values (p_society_id, v_cat, v_title, nullif(trim(coalesce(p_note, '')), ''), p_starts_at, v_uid)
  returning id into v_id;

  insert into public.notifications (society_id, author_id, kind, category, title, body)
  values (p_society_id, v_uid, 'general', 'general', v_title,
          nullif(trim(coalesce(p_note, '')), ''));

  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.add_facility_event(uuid, text, text, text, timestamptz) to authenticated;

create or replace function public.delete_facility_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.facility_events;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.facility_events where id = p_id;
  if v_row.id is null then return; end if;
  if exists (select 1 from public.society_memberships m
              where m.society_id = v_row.society_id and m.user_id = v_uid
                and m.role in ('secretary', 'co_secretary') and m.status = 'active')
  then
    delete from public.facility_events where id = p_id;
  else
    raise exception 'NOT_ALLOWED';
  end if;
end;
$$;
grant execute on function public.delete_facility_event(uuid) to authenticated;
