-- =====================================================================
-- Phase 5: Notifications, Polls & Bookings
-- Mirrors the Phase 4 spine (20260526000007_phase4_complaints.sql):
--   extensions → enums → table (+ denormalized attribution) → indexes →
--   enable RLS → can_see_X helper → SELECT/INSERT policies →
--   REVOKE update/insert from authenticated → SECURITY DEFINER RPCs →
--   ALTER PUBLICATION ADD TABLE → net.http_post push triggers.
--
-- Adds:
--   4 enums  (notification_category, notification_kind, poll_status, booking_status)
--   7 tables (notifications, polls, poll_options, poll_votes, bookings,
--             notification_preferences, push_deliveries)
--   1 ALTER  (amenities.open_time / close_time)
--   1 VIEW   (notification_preferences_effective — COALESCE defaults, D-06)
--   1 btree_gist EXCLUDE constraint (bookings_no_overlap — BOOK-05)
--   7 RPCs   (file_notification, vote_on_poll, close_poll, request_booking,
--             approve_booking, reject_booking) + 1 RLS helper (can_see_booking)
--   1 SQL fn (eligible_push_recipients — A4: mute + IST quiet-hours-wrap + rolling-cap)
--   3 Realtime publication entries (notifications, poll_votes, bookings)
--   2 push trigger functions (notify_push_on_notification,
--                             notify_push_on_booking_decision)
--
-- Resolves assumptions: A1 (notification_category enum + mute mapping),
-- A2 (push_deliveries log table), A4 (eligible_push_recipients SQL helper),
-- A5 (separate polls/poll_options/poll_votes tables).
--
-- JavaScript project — SQL only, no TypeScript.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
--    pg_net: required for the push triggers (already used by Phase 4).
--    btree_gist: NEW — enables `amenity_id WITH =` alongside `time_range WITH &&`
--    inside the bookings exclusion constraint (Pitfall 1). Trusted extension,
--    available in Supabase Postgres.
-- ---------------------------------------------------------------------
create extension if not exists pg_net;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. Enums (DO-block guarded, mirroring Phase 4 lines 20-39)
-- ---------------------------------------------------------------------

-- A1 LOCK: notification_category is the cross-phase preference contract.
-- The 5 categories map 1:1 to the mute_* columns on notification_preferences.
-- Phase 5 emits only 'general' and 'polls'; complaints/community/fines are
-- posted by their own phases (4/6) but route through the same mute columns.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_category') then
    create type public.notification_category as enum (
      'complaints', 'polls', 'community', 'fines', 'general'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type public.notification_kind as enum ('general', 'poll');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'poll_status') then
    create type public.poll_status as enum ('open', 'closed');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. amenity hours (ALTER, not a new table — amenities exists since Phase 3)
--    Booking slots must fall within these IST hours (BOOK-01).
-- ---------------------------------------------------------------------
alter table public.amenities
  add column if not exists open_time  time not null default time '06:00',
  add column if not exists close_time time not null default time '22:00';

-- ---------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------

-- notifications: a society-wide notice. Optional poll (separate tables, A5).
-- Denormalizes author_id + author_flat_id for "Posted by Rahul (B-203)" (NOTF-04).
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  society_id      uuid not null references public.societies(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete restrict,
  author_flat_id  uuid references public.flats(id),  -- denormalized attribution (NOTF-04)
  kind            public.notification_kind not null default 'general',
  category        public.notification_category not null default 'general',
  title           text not null,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_society_created
  on public.notifications (society_id, created_at desc);

-- polls: one optional poll per notification (A5).
create table if not exists public.polls (
  id              uuid primary key default gen_random_uuid(),
  society_id      uuid not null references public.societies(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  question        text not null,
  status          public.poll_status not null default 'open',
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (notification_id)  -- at most one poll per notice
);

create index if not exists idx_polls_society on public.polls (society_id);

-- poll_options: 2-4 options per poll (enforced in file_notification RPC).
create table if not exists public.poll_options (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  poll_id     uuid not null references public.polls(id) on delete cascade,
  label       text not null,
  position    int not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_poll_options_poll on public.poll_options (poll_id, position);

-- poll_votes: one vote per (poll, user) — change-vote via UPSERT (Pitfall 5).
-- Tally is count(*) over rows, never a denormalized counter.
create table if not exists public.poll_votes (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  poll_id     uuid not null references public.polls(id) on delete cascade,
  option_id   uuid not null references public.poll_options(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (poll_id, user_id)  -- one vote per user; UPSERT changes it (NOTF-08)
);

create index if not exists idx_poll_votes_poll_option on public.poll_votes (poll_id, option_id);

-- bookings: amenity reservation with a single tstzrange column (Pitfall 1).
-- Atomic first-approval (BOOK-03) + denormalized approver/rejecter attribution (BOOK-06).
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  society_id        uuid not null references public.societies(id) on delete cascade,
  amenity_id        uuid not null references public.amenities(id) on delete cascade,
  requester_id      uuid not null references auth.users(id) on delete restrict,
  requester_flat_id uuid references public.flats(id),
  time_range        tstzrange not null,  -- single range column (NOT starts_at/ends_at)
  purpose           text,
  status            public.booking_status not null default 'pending',
  approved_by       uuid references auth.users(id),
  approver_flat_id  uuid references public.flats(id),
  approved_at       timestamptz,
  rejected_by       uuid references auth.users(id),
  rejecter_flat_id  uuid references public.flats(id),
  rejection_reason  text,
  rejected_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_bookings_society_status
  on public.bookings (society_id, status, created_at desc);
create index if not exists idx_bookings_requester
  on public.bookings (requester_id);

-- notification_preferences (D-01): one row per (user, society). The ONE Phase 5
-- table clients write directly (D-05 idempotent UPSERT). Missing row → defaults
-- via the notification_preferences_effective VIEW (D-06).
create table if not exists public.notification_preferences (
  id              uuid primary key default gen_random_uuid(),
  society_id      uuid not null references public.societies(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  mute_complaints boolean not null default false,
  mute_polls      boolean not null default false,
  mute_community  boolean not null default false,
  mute_fines      boolean not null default false,
  mute_general    boolean not null default false,
  quiet_start     time not null default time '22:00',
  quiet_end       time not null default time '07:00',
  cap_per_day     int  not null default 20,
  updated_at      timestamptz not null default now(),
  unique (user_id, society_id)
);

create index if not exists idx_notification_preferences_user
  on public.notification_preferences (user_id, society_id);

-- push_deliveries (A2 / Pitfall 3): delivery log so the rolling-24h cap is
-- countable. Written by the fan-out Edge Function (service-role) after each send.
-- D-03 is a single combined cap (per-category caps deferred). Pruning deferred to Phase 8.
create table if not exists public.push_deliveries (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    public.notification_category not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_deliveries_user_created
  on public.push_deliveries (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. btree_gist exclusion constraint (BOOK-05 — Success Criterion 4)
--    Two APPROVED bookings on the same amenity cannot overlap. Partial WHERE
--    means pending/rejected overlaps never block — only the approved slot is
--    exclusive. Guarded by DO-block so the migration is re-runnable (db reset).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_no_overlap'
  ) then
    alter table public.bookings
      add constraint bookings_no_overlap
      exclude using gist (amenity_id with =, time_range with &&)
      where (status = 'approved');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 5. Enable RLS on all 7 new tables
-- ---------------------------------------------------------------------
alter table public.notifications            enable row level security;
alter table public.polls                    enable row level security;
alter table public.poll_options             enable row level security;
alter table public.poll_votes               enable row level security;
alter table public.bookings                 enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_deliveries          enable row level security;

-- ---------------------------------------------------------------------
-- 6. RLS helpers + policies (mirror can_see_complaint lines 116-181)
-- ---------------------------------------------------------------------

-- can_see_booking(): requester OR (same-society board/co_secretary/secretary).
create or replace function public.can_see_booking(p_booking public.bookings)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select (
    p_booking.requester_id = auth.uid()
    or (
      p_booking.society_id = public.current_society_id()
      and public.current_membership_role() in ('board_member', 'co_secretary', 'secretary')
    )
  );
$$;

-- notifications SELECT: all active society members read notices.
drop policy if exists "notification_select" on public.notifications;
create policy "notification_select"
  on public.notifications for select to authenticated
  using (society_id = public.current_society_id());

-- notifications writes: only file_notification RPC. Revoke direct writes.
revoke insert, update on public.notifications from authenticated;

-- polls SELECT: same-society readers.
drop policy if exists "poll_select" on public.polls;
create policy "poll_select"
  on public.polls for select to authenticated
  using (society_id = public.current_society_id());
revoke insert, update on public.polls from authenticated;

-- poll_options SELECT: same-society readers.
drop policy if exists "poll_options_select" on public.poll_options;
create policy "poll_options_select"
  on public.poll_options for select to authenticated
  using (society_id = public.current_society_id());
revoke insert, update on public.poll_options from authenticated;

-- poll_votes SELECT: same-society readers (aggregate tally needs all rows; the
-- UI surfaces aggregate-only by contract — T-05-08 accepted). vote_on_poll RPC
-- is the only writer.
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select"
  on public.poll_votes for select to authenticated
  using (society_id = public.current_society_id());
revoke insert, update on public.poll_votes from authenticated;

-- bookings SELECT: via can_see_booking() (requester or same-society board).
drop policy if exists "booking_select" on public.bookings;
create policy "booking_select"
  on public.bookings for select to authenticated
  using (public.can_see_booking(bookings.*));

-- bookings writes: only request_booking / approve_booking / reject_booking RPCs.
revoke insert, update on public.bookings from authenticated;

-- notification_preferences: the ONE Phase 5 table clients write directly (D-05).
-- Self-service: scoped to (user_id = auth.uid() AND society_id = current). NOT revoked.
drop policy if exists "notification_preferences_select" on public.notification_preferences;
create policy "notification_preferences_select"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid() and society_id = public.current_society_id());

drop policy if exists "notification_preferences_insert" on public.notification_preferences;
create policy "notification_preferences_insert"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid() and society_id = public.current_society_id());

drop policy if exists "notification_preferences_update" on public.notification_preferences;
create policy "notification_preferences_update"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid() and society_id = public.current_society_id())
  with check (user_id = auth.uid() and society_id = public.current_society_id());

-- push_deliveries: service-role (Edge Function) writes only; no authenticated access.
revoke all on public.push_deliveries from authenticated, anon;

-- ---------------------------------------------------------------------
-- 7. notification_preferences_effective VIEW (D-06)
--    Single source of D-04 defaults via COALESCE: a missing prefs row resolves
--    to all-unmuted, quiet 22:00-07:00 IST, cap 20. Consumed by
--    eligible_push_recipients() so defaults live in exactly one place.
-- ---------------------------------------------------------------------
create or replace view public.notification_preferences_effective as
select
  sm.user_id,
  sm.society_id,
  coalesce(np.mute_complaints, false)    as mute_complaints,
  coalesce(np.mute_polls,      false)    as mute_polls,
  coalesce(np.mute_community,  false)    as mute_community,
  coalesce(np.mute_fines,      false)    as mute_fines,
  coalesce(np.mute_general,    false)    as mute_general,
  coalesce(np.quiet_start, time '22:00') as quiet_start,
  coalesce(np.quiet_end,   time '07:00') as quiet_end,
  coalesce(np.cap_per_day, 20)           as cap_per_day
from public.society_memberships sm
left join public.notification_preferences np
  on np.user_id = sm.user_id and np.society_id = sm.society_id
where sm.status = 'active';

-- ---------------------------------------------------------------------
-- 8. RPC: file_notification (notification + optional poll in one transaction)
--    Mirrors file_complaint: pre-generated UUID, optional attachment row
--    (owner_kind='notification'), audit_log write, jsonb return.
--    Board-role gated (NOTF-01); poll options count CHECK 2..4 (NOTF-02).
-- ---------------------------------------------------------------------
create or replace function public.file_notification(
  p_title           text,
  p_body            text,
  p_category        public.notification_category default 'general',
  p_notification_id uuid    default gen_random_uuid(),
  p_storage_key     text    default null,
  p_mime_type       text    default null,
  p_byte_size       int     default null,
  p_poll_question   text    default null,
  p_poll_options    text[]  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_role        text := public.current_membership_role();
  v_caller_flat uuid;
  v_notif_id    uuid;
  v_poll_id     uuid;
  v_kind        public.notification_kind := 'general';
  v_opt_count   int;
  i             int;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- Only board roles may post a society-wide notice.
  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  -- A poll is present iff options were supplied; enforce 2..4 (NOTF-02).
  if p_poll_options is not null then
    v_opt_count := array_length(p_poll_options, 1);
    if v_opt_count is null or v_opt_count < 2 or v_opt_count > 4 then
      raise exception 'POLL_OPTIONS_RANGE';
    end if;
    if p_poll_question is null or length(btrim(p_poll_question)) = 0 then
      raise exception 'POLL_QUESTION_REQUIRED';
    end if;
    v_kind := 'poll';
  end if;

  -- Caller's flat in this society (denormalized onto the notification, NOTF-04).
  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  insert into public.notifications (
    id, society_id, author_id, author_flat_id, kind, category, title, body
  )
  values (
    p_notification_id, v_society_id, v_caller_id, v_caller_flat,
    v_kind, p_category, p_title, p_body
  )
  returning id into v_notif_id;

  -- Optional poll + options in the same transaction (A5).
  if p_poll_options is not null then
    insert into public.polls (society_id, notification_id, question)
    values (v_society_id, v_notif_id, p_poll_question)
    returning id into v_poll_id;

    for i in 1 .. array_length(p_poll_options, 1) loop
      insert into public.poll_options (society_id, poll_id, label, position)
      values (v_society_id, v_poll_id, p_poll_options[i], i);
    end loop;
  end if;

  -- Optional attachment (owner_kind='notification' — reuses Phase 4 polymorphic table).
  if p_storage_key is not null then
    insert into public.attachments (
      society_id, owner_kind, owner_id, storage_key, mime_type, byte_size, created_by
    )
    values (
      v_society_id, 'notification', v_notif_id, p_storage_key, p_mime_type, p_byte_size, v_caller_id
    );
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'notification.posted', 'notifications', v_notif_id,
    jsonb_build_object('kind', v_kind, 'category', p_category, 'poll_id', v_poll_id)
  );

  return jsonb_build_object(
    'notification_id', v_notif_id,
    'society_id',      v_society_id,
    'poll_id',         v_poll_id
  );
end;
$$;

grant execute on function public.file_notification(
  text, text, public.notification_category, uuid, text, text, int, text, text[]
) to authenticated;

-- ---------------------------------------------------------------------
-- 9. RPC: vote_on_poll (UPSERT — one vote per user, change until closed)
--    Returns the aggregate tally as count(*) over poll_votes (never a counter).
-- ---------------------------------------------------------------------
create or replace function public.vote_on_poll(
  p_poll_id   uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_poll       public.polls%rowtype;
  v_tally      jsonb;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- Poll must exist in the caller's society and be open.
  select * into v_poll
  from public.polls
  where id = p_poll_id and society_id = v_society_id;
  if v_poll.id is null then raise exception 'POLL_NOT_FOUND'; end if;
  if v_poll.status <> 'open' then raise exception 'POLL_CLOSED'; end if;

  -- Option must belong to this poll.
  if not exists (
    select 1 from public.poll_options
    where id = p_option_id and poll_id = p_poll_id and society_id = v_society_id
  ) then
    raise exception 'INVALID_OPTION';
  end if;

  -- One vote per user; change-vote via UPSERT (NOTF-08, Pitfall 5).
  insert into public.poll_votes (society_id, poll_id, option_id, user_id)
  values (v_society_id, p_poll_id, p_option_id, v_caller_id)
  on conflict (poll_id, user_id)
  do update set option_id = excluded.option_id, created_at = now();

  -- Tally = count(*) grouped by option_id (consistent under concurrency).
  select coalesce(jsonb_object_agg(t.option_id, t.cnt), '{}'::jsonb) into v_tally
  from (
    select option_id, count(*) as cnt
    from public.poll_votes
    where poll_id = p_poll_id
    group by option_id
  ) t;

  return jsonb_build_object(
    'poll_id',   p_poll_id,
    'my_option', p_option_id,
    'tally',     v_tally
  );
end;
$$;

grant execute on function public.vote_on_poll(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. RPC: close_poll (author OR board role)
-- ---------------------------------------------------------------------
create or replace function public.close_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_role       text := public.current_membership_role();
  v_poll       public.polls%rowtype;
  v_author_id  uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  select * into v_poll
  from public.polls
  where id = p_poll_id and society_id = v_society_id;
  if v_poll.id is null then raise exception 'POLL_NOT_FOUND'; end if;

  -- Author of the parent notification.
  select n.author_id into v_author_id
  from public.notifications n
  where n.id = v_poll.notification_id;

  if v_caller_id <> v_author_id
     and v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  update public.polls
     set status = 'closed', closed_at = now()
   where id = p_poll_id and society_id = v_society_id;

  return jsonb_build_object('poll_id', p_poll_id, 'status', 'closed');
end;
$$;

grant execute on function public.close_poll(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. RPC: request_booking (server-side guards — BOOK-01)
--     Builds time_range := tstzrange(starts, ends, '[)'). Guards:
--     end>start, lead-time >=1h, <=30d ahead, <=4h duration, within amenity hours (IST).
-- ---------------------------------------------------------------------
create or replace function public.request_booking(
  p_amenity_id uuid,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_purpose    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_caller_flat uuid;
  v_amenity     public.amenities%rowtype;
  v_booking_id  uuid;
  v_start_ist   time;
  v_end_ist     time;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- Caller must be an active member of this society.
  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;
  if v_caller_flat is null then raise exception 'NOT_ACTIVE_MEMBER'; end if;

  -- Amenity must belong to this society.
  select * into v_amenity
  from public.amenities
  where id = p_amenity_id and society_id = v_society_id;
  if v_amenity.id is null then raise exception 'INVALID_AMENITY'; end if;

  -- Time-order + window guards.
  if p_ends_at <= p_starts_at then raise exception 'TIME_ORDER'; end if;
  if p_starts_at < now() + interval '1 hour' then raise exception 'LEAD_TIME'; end if;
  if p_starts_at > now() + interval '30 days' then raise exception 'TOO_FAR'; end if;
  if p_ends_at - p_starts_at > interval '4 hours' then raise exception 'DURATION'; end if;

  -- Slot must fall within the amenity's open/close hours (IST, D-02).
  v_start_ist := (p_starts_at at time zone 'Asia/Kolkata')::time;
  v_end_ist   := (p_ends_at   at time zone 'Asia/Kolkata')::time;
  if v_start_ist < v_amenity.open_time
     or v_end_ist > v_amenity.close_time
     or v_end_ist <= v_start_ist then        -- reject slots wrapping past close/midnight
    raise exception 'OUTSIDE_HOURS';
  end if;

  insert into public.bookings (
    society_id, amenity_id, requester_id, requester_flat_id, time_range, purpose, status
  )
  values (
    v_society_id, p_amenity_id, v_caller_id, v_caller_flat,
    tstzrange(p_starts_at, p_ends_at, '[)'), p_purpose, 'pending'
  )
  returning id into v_booking_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'booking.requested', 'bookings', v_booking_id);

  return jsonb_build_object('booking_id', v_booking_id, 'society_id', v_society_id);
end;
$$;

grant execute on function public.request_booking(uuid, timestamptz, timestamptz, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 12. RPC: approve_booking (atomic first-approval — BOOK-03 — + 23P01 catch)
--     Mirrors claim_complaint: UPDATE ... WHERE status='pending' RETURNING.
--     NULL return = race lost. exclusion_violation (23P01) → clean slot_taken.
-- ---------------------------------------------------------------------
create or replace function public.approve_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_role        text := public.current_membership_role();
  v_caller_flat uuid;
  v_updated     public.bookings%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  -- THE ATOMIC APPROVAL: only one concurrent caller can pass status='pending'.
  -- The exclusion constraint fires inside this UPDATE if an approved booking
  -- already overlaps; catch 23P01 → clean slot_taken (defense-in-depth, BOOK-05).
  begin
    update public.bookings
       set status           = 'approved',
           approved_by      = v_caller_id,
           approver_flat_id = v_caller_flat,
           approved_at      = now()
     where id         = p_booking_id
       and society_id = v_society_id
       and status     = 'pending'
    returning * into v_updated;
  exception
    when exclusion_violation then               -- SQLSTATE 23P01
      return jsonb_build_object('approved', false, 'reason', 'slot_taken');
  end;

  -- 0 rows updated → race lost or row not pending / in another society.
  if v_updated.id is null then
    return jsonb_build_object('approved', false, 'reason', 'race_lost_or_not_pending');
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'booking.approved', 'bookings', p_booking_id);

  return jsonb_build_object('approved', true, 'booking', to_jsonb(v_updated));
end;
$$;

grant execute on function public.approve_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. RPC: reject_booking (any board member, optional reason — BOOK-04)
-- ---------------------------------------------------------------------
create or replace function public.reject_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_role        text := public.current_membership_role();
  v_caller_flat uuid;
  v_updated     public.bookings%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  update public.bookings
     set status           = 'rejected',
         rejected_by      = v_caller_id,
         rejecter_flat_id = v_caller_flat,
         rejection_reason = p_reason,
         rejected_at      = now()
   where id         = p_booking_id
     and society_id = v_society_id
     and status     = 'pending'
  returning * into v_updated;

  if v_updated.id is null then
    return jsonb_build_object('rejected', false, 'reason', 'not_pending');
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'booking.rejected', 'bookings', p_booking_id,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('rejected', true, 'booking', to_jsonb(v_updated));
end;
$$;

grant execute on function public.reject_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 14. eligible_push_recipients(p_notification_id) — A4 SQL helper
--     Returns the (user_id, expo_token) set for the notification's society that
--     pass: category mute (A1 map) + IST quiet-hours-now wrap (Pitfall 2) +
--     rolling-24h cap (Pitfall 3). JOINs push_tokens by user_id (no society_id
--     on push_tokens). Service-role only (Edge Function consumes it).
-- ---------------------------------------------------------------------
create or replace function public.eligible_push_recipients(p_notification_id uuid)
returns table (user_id uuid, expo_token text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_society_id uuid;
  v_category   public.notification_category;
  v_now_ist    time := (now() at time zone 'Asia/Kolkata')::time;
begin
  select n.society_id, n.category
    into v_society_id, v_category
  from public.notifications n
  where n.id = p_notification_id;

  if v_society_id is null then
    return;  -- unknown notification → no recipients
  end if;

  return query
  select e.user_id, pt.expo_token
  from public.notification_preferences_effective e
  join public.push_tokens pt
    on pt.user_id = e.user_id and pt.notifications_enabled
  where e.society_id = v_society_id
    -- A1 mute mapping: category enum value X → mute_X column.
    and not (
      case v_category
        when 'complaints' then e.mute_complaints
        when 'polls'      then e.mute_polls
        when 'community'  then e.mute_community
        when 'fines'      then e.mute_fines
        when 'general'    then e.mute_general
        else false
      end
    )
    -- IST quiet-hours wrap-around (Pitfall 2): exclude recipient if now is inside window.
    and not (
      case
        when e.quiet_start <= e.quiet_end
          then v_now_ist >= e.quiet_start and v_now_ist < e.quiet_end       -- same-day
        else v_now_ist >= e.quiet_start or  v_now_ist < e.quiet_end         -- overnight wrap
      end
    )
    -- Rolling-24h cap (Pitfall 3): exclude recipient at/over cap.
    and (
      select count(*)
      from public.push_deliveries pd
      where pd.user_id = e.user_id
        and pd.created_at > now() - interval '24 hours'
    ) < e.cap_per_day;
end;
$$;

grant execute on function public.eligible_push_recipients(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 15. Realtime publication (Pitfall 7 — Realtime container reads at startup;
--     supabase db reset replays these but the stack must be restarted).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.poll_votes;
alter publication supabase_realtime add table public.bookings;

-- ---------------------------------------------------------------------
-- 16. Push triggers (mirror notify_push_on_response lines 421-455).
--     Fire-and-forget net.http_post with the x-push-trigger:'true' sentinel header.
-- ---------------------------------------------------------------------

-- notifications AFTER INSERT → society-wide notification-fanout.
create or replace function public.notify_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := 'http://host.docker.internal:54321/functions/v1/notification-fanout';
begin
  v_payload := jsonb_build_object(
    'type',       TG_OP,
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     to_jsonb(NEW),
    'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
  );

  perform net.http_post(
    url     := v_url,
    body    := v_payload,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-push-trigger', 'true'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists notification_push_trigger on public.notifications;
create trigger notification_push_trigger
  after insert on public.notifications
  for each row execute function public.notify_push_on_notification();

-- bookings AFTER UPDATE OF status (approve/reject from pending) → booking-ack-fanout
-- (A3 — dedicated thin single-recipient path; see Plan 05-02).
create or replace function public.notify_push_on_booking_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := 'http://host.docker.internal:54321/functions/v1/booking-ack-fanout';
begin
  v_payload := jsonb_build_object(
    'type',       TG_OP,
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     to_jsonb(NEW),
    'old_record', to_jsonb(OLD)
  );

  perform net.http_post(
    url     := v_url,
    body    := v_payload,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-push-trigger', 'true'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists booking_decision_push_trigger on public.bookings;
create trigger booking_decision_push_trigger
  after update of status on public.bookings
  for each row
  when (new.status in ('approved', 'rejected') and old.status = 'pending')
  execute function public.notify_push_on_booking_decision();
