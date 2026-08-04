-- ============================================================================
-- Home highlights — up to 4 pinned cards the secretary controls (water timing,
-- an update, an important notice…). Residents see them at the top of home, and
-- get a notification whenever a highlight is added or its text changes.
-- ============================================================================

create table if not exists public.society_highlights (
  id         uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  title      text not null,
  body       text not null,
  position   int  not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_society_highlights_society on public.society_highlights(society_id, position);

comment on table public.society_highlights is
  'Up to 4 secretary-pinned cards shown at the top of home. Editing notifies residents.';

alter table public.society_highlights enable row level security;

-- Residents of the society read their highlights; writes go through the RPC.
create policy society_highlights_read on public.society_highlights
  for select to authenticated
  using (society_id = public.current_society_id());

alter publication supabase_realtime add table public.society_highlights;

-- secretary_set_highlights: replace the whole set (0..4) atomically. For each
-- item that is NEW or whose text CHANGED, insert a notification so residents are
-- told — e.g. water timing 8:30 → 9:30 notifies even though the card stays.
create or replace function public.secretary_set_highlights(p_society_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_old   jsonb;
  v_item  jsonb;
  v_idx   int := 0;
  v_title text;
  v_body  text;
  v_prev  text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.society_memberships
    where society_id = p_society_id and user_id = v_uid
      and role in ('secretary', 'co_secretary') and status = 'active'
  ) then raise exception 'NOT_SECRETARY'; end if;

  if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items) > 4 then raise exception 'TOO_MANY'; end if;

  -- Snapshot old text keyed by lower(title) to detect additions / edits.
  select coalesce(jsonb_object_agg(lower(title), body), '{}'::jsonb) into v_old
    from public.society_highlights where society_id = p_society_id;

  delete from public.society_highlights where society_id = p_society_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_title := nullif(trim(v_item->>'title'), '');
    v_body  := nullif(trim(v_item->>'body'), '');
    if v_title is null or v_body is null then continue; end if;

    insert into public.society_highlights (society_id, title, body, position, updated_by)
    values (p_society_id, v_title, v_body, v_idx, v_uid);

    v_prev := v_old ->> lower(v_title);
    if v_prev is null or v_prev <> v_body then
      insert into public.notifications (society_id, author_id, kind, category, title, body)
      values (p_society_id, v_uid, 'general', 'general', v_title, v_body);
    end if;

    v_idx := v_idx + 1;
  end loop;

  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'position', position)
                              order by position), '[]'::jsonb)
    from public.society_highlights where society_id = p_society_id
  );
end;
$$;
grant execute on function public.secretary_set_highlights(uuid, jsonb) to authenticated;
