-- ============================================================================
-- Staff "view a society" — READ ONLY, time-boxed, audited
-- ----------------------------------------------------------------------------
-- Support needs to see what a chairman sees ("the code isn't working", "my
-- complaint vanished"). This grants that without handing staff the keys.
--
-- WHY NOT THE OBVIOUS ONE-LINE VERSION.
-- Every tenant policy routes through current_society_id(), so making that
-- function return the viewed society would have unlocked all 24 policies at
-- once. It would also have unlocked the 19 policies that carry a with_check —
-- amenities, flats, complaints, family_members and societies UPDATE among them.
-- Staff would have been able to silently EDIT a society's flats or rename the
-- society itself. Convenient, and completely wrong.
--
-- So current_society_id() is left alone and this adds explicit `for select`
-- policies instead. A SELECT policy cannot authorise a write, so read-only is
-- guaranteed by construction rather than by everyone remembering to be careful.
-- The verbosity is the feature: each table below is a deliberate decision.
--
-- WHAT STAFF CAN SEE DURING A SESSION: the operational picture — flats,
-- complaints, notices, polls, bookings, the member list and resident names.
-- That is real exposure of resident data, which is why every session is
-- attributed, expires on its own, and is written to audit_log at the moment it
-- starts. Support access you cannot review afterwards is indistinguishable from
-- a breach.
--
-- WHAT IS DELIBERATELY EXCLUDED: push_tokens, notification_preferences,
-- notifications and family_members. Device tokens and someone's household
-- composition have no support value, so there is no reason to expose them.
-- ============================================================================

create table if not exists public.admin_view_sessions (
  admin_id   uuid primary key references auth.users(id) on delete cascade,
  society_id uuid not null references public.societies(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 minutes'
);

alter table public.admin_view_sessions enable row level security;
revoke all on public.admin_view_sessions from anon, authenticated;

comment on table public.admin_view_sessions is
  'One open society view per staff member. Expires after 60 minutes so support access can never become a standing privilege.';

-- ---------------------------------------------------------------------------
-- Which society, if any, is this staff member currently viewing?
-- Returns NULL for everyone else, which makes the policies below no-ops for
-- ordinary residents.
-- ---------------------------------------------------------------------------
create or replace function public.admin_viewing_society()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select v.society_id
  from public.admin_view_sessions v
  where v.admin_id = auth.uid()
    and v.expires_at > now()
    and exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

grant execute on function public.admin_viewing_society() to authenticated;

comment on function public.admin_viewing_society() is
  'Society the calling staff member is currently viewing, or NULL. Re-checks platform_admins on every call so revoking staff ends any open view immediately.';

-- ---------------------------------------------------------------------------
-- Start / stop a view. Starting is audited into the viewed society's own log,
-- so the chairman can see that staff looked and when.
-- ---------------------------------------------------------------------------
create or replace function public.admin_start_view(p_society_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if not exists (select 1 from public.societies where id = p_society_id) then
    raise exception 'SOCIETY_NOT_FOUND';
  end if;

  insert into public.admin_view_sessions (admin_id, society_id, started_at, expires_at)
  values (v_admin, p_society_id, now(), now() + interval '60 minutes')
  on conflict (admin_id) do update
    set society_id = excluded.society_id,
        started_at = excluded.started_at,
        expires_at = excluded.expires_at;

  -- Written into the SOCIETY's audit log, not a staff-only one: the people whose
  -- data was viewed are the ones who should be able to see that it happened.
  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_admin, 'admin.society_viewed', 'societies', p_society_id,
          jsonb_build_object('expires_at', now() + interval '60 minutes'));
end;
$$;

create or replace function public.admin_end_view()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.admin_view_sessions where admin_id = auth.uid();
end;
$$;

grant execute on function public.admin_start_view(uuid) to authenticated;
grant execute on function public.admin_end_view() to authenticated;

-- ---------------------------------------------------------------------------
-- READ-ONLY policies, one per table the dashboard actually reads.
-- `for select` only — these cannot authorise an insert, update or delete.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  -- Tables keyed directly by society_id.
  direct text[] := array[
    'flats','wings','amenities','complaints','polls','bookings','posts',
    'flat_actions','audit_log','society_memberships','society_codes',
    'moderation_events','reports','attachments'
  ];
begin
  foreach t in array direct loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists admin_view_select on public.%I', t);
    execute format(
      'create policy admin_view_select on public.%I for select to authenticated
         using (society_id = public.admin_viewing_society())', t);
  end loop;
end $$;

-- societies: the row itself
drop policy if exists admin_view_select on public.societies;
create policy admin_view_select on public.societies
  for select to authenticated
  using (id = public.admin_viewing_society());

-- profiles: no society_id column — reached through membership. This is the one
-- that exposes resident NAMES, which is why the session is audited.
drop policy if exists admin_view_select on public.profiles;
create policy admin_view_select on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.society_memberships m
    where m.user_id = profiles.user_id
      and m.society_id = public.admin_viewing_society()
  ));

-- Child rows reached via their parent.
drop policy if exists admin_view_select on public.complaint_responses;
create policy admin_view_select on public.complaint_responses
  for select to authenticated
  using (exists (
    select 1 from public.complaints c
    where c.id = complaint_responses.complaint_id
      and c.society_id = public.admin_viewing_society()
  ));

drop policy if exists admin_view_select on public.poll_options;
create policy admin_view_select on public.poll_options
  for select to authenticated
  using (exists (
    select 1 from public.polls p
    where p.id = poll_options.poll_id
      and p.society_id = public.admin_viewing_society()
  ));

drop policy if exists admin_view_select on public.post_comments;
create policy admin_view_select on public.post_comments
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and p.society_id = public.admin_viewing_society()
  ));

-- poll_votes stays EXCLUDED on purpose: who voted which way is the one thing a
-- resident is entitled to keep from everyone, staff included. Staff can see a
-- poll and its tallies through poll_options; they cannot see individual ballots.
