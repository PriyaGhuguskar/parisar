-- ============================================================================
-- Emergency SOS — a resident raises an alert with a description and picks who it
-- reaches. Delivered live (realtime) to exactly the chosen audience via RLS.
--
-- Audiences:
--   all                -> every resident + every guard (watchman)
--   residents          -> residents only
--   secretary_watchman -> secretary/co-secretary + guards
--   watchman           -> guards only
-- ============================================================================

do $$ begin
  create type public.sos_audience as enum ('all', 'residents', 'secretary_watchman', 'watchman');
exception when duplicate_object then null; end $$;

create table if not exists public.sos_alerts (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references public.societies(id) on delete cascade,
  raised_by     uuid references auth.users(id) on delete set null,
  raised_by_name text,
  raised_by_flat text,
  description   text not null,
  audience      public.sos_audience not null default 'all',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists idx_sos_alerts_society on public.sos_alerts(society_id, created_at desc);

comment on table public.sos_alerts is
  'Emergency SOS alerts. Raised by a resident; visible only to the chosen audience (residents / guards / secretary) via RLS.';

alter table public.sos_alerts enable row level security;

-- Residents see all/residents alerts; secretaries additionally see secretary_watchman ones.
create policy sos_member_read on public.sos_alerts
  for select to authenticated
  using (
    society_id = public.current_society_id()
    and (
      audience in ('all', 'residents')
      or (
        audience = 'secretary_watchman'
        and exists (
          select 1 from public.society_memberships m
          where m.society_id = sos_alerts.society_id and m.user_id = auth.uid()
            and m.role in ('secretary', 'co_secretary') and m.status = 'active'
        )
      )
    )
  );

-- Guards (watchmen) see all/watchman/secretary_watchman alerts for their society.
create policy sos_guard_read on public.sos_alerts
  for select to authenticated
  using (
    society_id = public.current_guard_society_id()
    and audience in ('all', 'watchman', 'secretary_watchman')
  );

alter publication supabase_realtime add table public.sos_alerts;

-- raise_sos: any active resident raises an alert. Attribution captured server-side.
create or replace function public.raise_sos(
  p_society_id uuid, p_description text, p_audience text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_desc text := nullif(trim(p_description), '');
  v_aud  public.sos_audience;
  v_who  text;
  v_flat text;
  v_id   uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_desc is null then raise exception 'INVALID_DESC'; end if;
  begin v_aud := coalesce(p_audience, 'all')::public.sos_audience;
  exception when others then v_aud := 'all'; end;

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

  insert into public.sos_alerts (society_id, raised_by, raised_by_name, raised_by_flat, description, audience)
  values (p_society_id, v_uid, v_who, v_flat, v_desc, v_aud)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.raise_sos(uuid, text, text) to authenticated;

-- resolve_sos: the raiser or a secretary/co-secretary marks an alert resolved.
create or replace function public.resolve_sos(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sos_alerts;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.sos_alerts where id = p_id;
  if v_row.id is null then return; end if;
  if v_row.raised_by = v_uid
     or exists (select 1 from public.society_memberships m
                 where m.society_id = v_row.society_id and m.user_id = v_uid
                   and m.role in ('secretary', 'co_secretary') and m.status = 'active')
  then
    update public.sos_alerts set resolved_at = now() where id = p_id and resolved_at is null;
  else
    raise exception 'NOT_ALLOWED';
  end if;
end;
$$;
grant execute on function public.resolve_sos(uuid) to authenticated;
