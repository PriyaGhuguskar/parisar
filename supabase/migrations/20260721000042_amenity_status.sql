-- ============================================================================
-- Amenity status — the secretary marks each amenity Working or Closed (with an
-- optional "closed till <date>"). Shown on the Society profile + bookings.
-- Management is gated to secretary/co-secretary via RPCs; everyone reads.
-- ============================================================================

do $$ begin
  create type public.amenity_status as enum ('working', 'closed');
exception when duplicate_object then null; end $$;

alter table public.amenities
  add column if not exists status public.amenity_status not null default 'working';
alter table public.amenities
  add column if not exists closed_until date;

-- secretary_upsert_amenity: add a new amenity or edit an existing one, including
-- its status. Secretary/co-secretary only.
create or replace function public.secretary_upsert_amenity(
  p_society_id uuid, p_id uuid, p_name text, p_status text, p_closed_until date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := nullif(trim(p_name), '');
  v_status public.amenity_status;
  v_until  date;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_name is null then raise exception 'INVALID_NAME'; end if;
  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid
      and role in ('secretary', 'co_secretary') and status = 'active'
  ) then raise exception 'NOT_SECRETARY'; end if;

  begin v_status := coalesce(p_status, 'working')::public.amenity_status;
  exception when others then v_status := 'working'; end;
  -- "closed till" only makes sense while closed.
  v_until := case when v_status = 'closed' then p_closed_until else null end;

  if p_id is null then
    insert into public.amenities (society_id, name, is_custom, status, closed_until)
    values (p_society_id, v_name, true, v_status, v_until)
    returning id into v_id;
  else
    update public.amenities
       set name = v_name, status = v_status, closed_until = v_until
     where id = p_id and society_id = p_society_id
    returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;

  return (
    select jsonb_build_object('id', id, 'name', name, 'status', status, 'closed_until', closed_until)
    from public.amenities where id = v_id
  );
end;
$$;
grant execute on function public.secretary_upsert_amenity(uuid, uuid, text, text, date) to authenticated;

create or replace function public.secretary_delete_amenity(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_soc uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select society_id into v_soc from public.amenities where id = p_id;
  if v_soc is null then return; end if;
  if not exists (
    select 1 from public.society_memberships
    where society_id = v_soc and user_id = v_uid
      and role in ('secretary', 'co_secretary') and status = 'active'
  ) then raise exception 'NOT_SECRETARY'; end if;
  delete from public.amenities where id = p_id;
end;
$$;
grant execute on function public.secretary_delete_amenity(uuid) to authenticated;
