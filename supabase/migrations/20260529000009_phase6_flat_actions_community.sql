-- =====================================================================
-- Phase 6: Flat Actions & Community Feed
-- Mirrors the Phase 4/5 spine (20260526000007_phase4_complaints.sql,
-- 20260528000008_phase5_notifications_bookings.sql):
--   extensions -> enums (DO-block guarded) -> tables (+ denormalized
--   attribution) -> indexes -> enable RLS -> can_see_X() helper ->
--   SELECT policies -> REVOKE insert/update/delete from authenticated ->
--   SECURITY DEFINER RPCs (search_path pinned, role/ownership gate,
--   audit_log write, jsonb return) -> ALTER PUBLICATION ADD TABLE ->
--   net.http_post push trigger (x-push-trigger sentinel).
--
-- Adds:
--   5 enums  (flat_action_kind, fine_status, post_kind, report_target_kind,
--             moderation_event_kind)
--   5 tables (flat_actions, posts, post_comments, reports, moderation_events)
--   2 cols   (societies.grievance_officer_name, .grievance_officer_contact)
--   1 helper (can_see_flat_action — per-FLAT RLS, the genuinely new pattern)
--   12 RPCs  (issue_flat_action, acknowledge_fine, waive_fine, create_post,
--             add_comment, report_content, restore_content, confirm_takedown,
--             set_grievance_officer, get_grievance_officer, delete_post,
--             delete_comment) + flat_action_recipients (service-role push helper)
--   3 Realtime publication entries (flat_actions, posts, post_comments)
--   1 push trigger (notify_push_on_flat_action -> flat-action-fanout)
--
-- Reuses (NO schema change): attachments.owner_kind already has 'post' +
-- 'flat_action' (phase4 line 37); notification_preferences mute_fines /
-- mute_community / mute_general (phase5); notification_preferences_effective
-- VIEW + the eligible_push_recipients quiet-hours/cap shape.
--
-- ---------------------------------------------------------------------
-- Open-Question resolutions (locked in Plan 06-01):
--   OQ1 (issue/waive role set):
--     issue_flat_action = admin-only ('co_secretary','secretary');
--     waive_fine        = admin-only ('co_secretary','secretary') per D-04
--                         ("Secretary can Waive"). Co-Secretary is a full
--                         Secretary-equivalent (PROJECT.md SETUP-08).
--     board_member RETAINS SEE access via can_see_flat_action but CANNOT
--     issue or waive. The UI Waive affordance is admin-only to match.
--   OQ2 (create_post key-handoff guard):
--     create_post rejects any photo key NOT under
--     {society}/posts/{postId}/ with INVALID_ATTACHMENT_KEY so the
--     quarantine -> moderate -> move image gate cannot be bypassed.
--   OQ3 (push category mapping):
--     fines            -> mute_fines
--     warnings/notices -> mute_general
--     community/reports-> mute_community
--     All columns exist in Phase 5 notification_preferences (reuse).
--
-- Fine lifecycle (D-04): fine_status = outstanding | acknowledged | waived.
--   There is NO 'overdue' value — overdue is DERIVED at render
--   (now > due_date AND status='outstanding'). No payment anywhere.
--
-- Per-flat privacy (D-05): a flat action is visible ONLY to the targeted
--   flat's active residents OR board/co_secretary/secretary. The JWT carries
--   society_id + role ONLY (no flat_id claim) — the helper sub-queries
--   society_memberships on auth.uid() + the action's flat_id.
--
-- Server-side auto-hide (D-03): hidden_at on posts + post_comments; the
--   SELECT policy filters hidden_at IS NULL (board sees hidden). A reported
--   row vanishes from a DIRECT PostgREST query by another member (RLS, not
--   a client filter). First report wins via coalesce(hidden_at, now()).
--
-- JavaScript project — SQL only, no TypeScript.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions (pg_net required for the push trigger; already used 4/5)
-- ---------------------------------------------------------------------
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. Enums (DO-block guarded, mirroring phase5 lines 48-76)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'flat_action_kind') then
    create type public.flat_action_kind as enum ('warning', 'fine', 'notify');
  end if;
end$$;

-- fine_status: outstanding | acknowledged | waived. NO 'overdue' (Pitfall 6).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fine_status') then
    create type public.fine_status as enum ('outstanding', 'acknowledged', 'waived');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_kind') then
    create type public.post_kind as enum ('sell', 'help', 'general');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_target_kind') then
    create type public.report_target_kind as enum ('post', 'comment');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_event_kind') then
    create type public.moderation_event_kind as enum ('report', 'takedown', 'restore');
  end if;
end$$;

-- NOTE: attachment_owner already has 'post' + 'flat_action' (phase4 line 37).
-- Do NOT touch it — Phase 6 emits attachments rows with the right owner_kind.

-- ---------------------------------------------------------------------
-- 2. Tables (all society_id FK + created_at + denormalized attribution)
-- ---------------------------------------------------------------------

-- flat_actions: a Warning / Fine / Notify issued against a specific flat.
-- Denormalizes issuer_id + issuer_flat_id for "Issued by Amit (A-102)" (FLAT-02).
-- fine_status is NULL for non-fine kinds; 'outstanding' on a new fine.
create table if not exists public.flat_actions (
  id             uuid primary key default gen_random_uuid(),
  society_id     uuid not null references public.societies(id) on delete cascade,
  flat_id        uuid not null references public.flats(id),
  issuer_id      uuid not null references auth.users(id) on delete restrict,
  issuer_flat_id uuid references public.flats(id),  -- denormalized attribution
  kind           public.flat_action_kind not null,
  body           text not null,
  amount         numeric,                            -- fine only
  due_date       date,                               -- fine only
  fine_status    public.fine_status,                 -- fine only (NULL otherwise)
  created_at     timestamptz not null default now()
);

create index if not exists idx_flat_actions_society_flat_created
  on public.flat_actions (society_id, flat_id, created_at desc);

-- posts: a community feed post (sell / help / general). hidden_at (auto-hide,
-- D-03) + deleted_at (author soft-delete) are both nullable and both filtered
-- in the SELECT policy.
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  society_id     uuid not null references public.societies(id) on delete cascade,
  author_id      uuid not null references auth.users(id) on delete restrict,
  author_flat_id uuid references public.flats(id),   -- denormalized attribution
  kind           public.post_kind not null default 'general',
  body           text not null,
  hidden_at      timestamptz,                         -- set by report_content (D-03)
  deleted_at     timestamptz,                         -- set by delete_post / confirm_takedown
  created_at     timestamptz not null default now()
);

create index if not exists idx_posts_society_created
  on public.posts (society_id, created_at desc)
  where hidden_at is null and deleted_at is null;

-- post_comments: text-only comments, reportable + auto-hideable via the same
-- D-03 flow. Cascade-delete when the parent post is removed.
create table if not exists public.post_comments (
  id             uuid primary key default gen_random_uuid(),
  society_id     uuid not null references public.societies(id) on delete cascade,
  post_id        uuid not null references public.posts(id) on delete cascade,
  author_id      uuid not null references auth.users(id) on delete restrict,
  author_flat_id uuid references public.flats(id),    -- denormalized attribution
  body           text not null,
  hidden_at      timestamptz,                          -- set by report_content (D-03)
  deleted_at     timestamptz,                          -- set by delete_comment / confirm_takedown
  created_at     timestamptz not null default now()
);

create index if not exists idx_post_comments_post_created
  on public.post_comments (post_id, created_at);

-- reports: MANY allowed per target (no unique on target+reporter). First report
-- auto-hides; later reports are recorded but the hide is idempotent (Pitfall 5).
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  target_kind public.report_target_kind not null,
  target_id   uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_reports_society_target
  on public.reports (society_id, target_kind, target_id);

-- moderation_events: the Secretary's audit log (COMM-07). report | takedown |
-- restore with actor + target + timestamp. Dedicated table (NOT generic
-- audit_log, which is secretary-only-SELECT and not in the publication).
create table if not exists public.moderation_events (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  event_kind  public.moderation_event_kind not null,
  actor_id    uuid not null references auth.users(id) on delete restrict,
  target_kind public.report_target_kind not null,
  target_id   uuid not null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_moderation_events_society_created
  on public.moderation_events (society_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Grievance Officer columns (ALTER societies — NOT a new table, Pattern 6)
--    societies already carries secretary_phone / co_secretary_phone (phase3).
-- ---------------------------------------------------------------------
alter table public.societies
  add column if not exists grievance_officer_name    text,
  add column if not exists grievance_officer_contact text;

-- ---------------------------------------------------------------------
-- 4. Enable RLS on the 5 new tables
-- ---------------------------------------------------------------------
alter table public.flat_actions      enable row level security;
alter table public.posts             enable row level security;
alter table public.post_comments     enable row level security;
alter table public.reports           enable row level security;
alter table public.moderation_events enable row level security;

-- ---------------------------------------------------------------------
-- 5. RLS helper + SELECT policies
-- ---------------------------------------------------------------------

-- can_see_flat_action(): per-FLAT visibility (D-05, Pattern 2). The JWT has
-- NO flat_id claim, so branch (b) sub-queries society_memberships on
-- auth.uid() + the action's flat_id. Branch (a) lets board/admin see all flats.
-- board_member retains SEE access here; only ISSUE and WAIVE are admin-only.
create or replace function public.can_see_flat_action(p_action public.flat_actions)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select (
    -- (a) caller is board/co_secretary/secretary in the action's society -> sees all flats
    (
      p_action.society_id = public.current_society_id()
      and public.current_membership_role() in ('board_member', 'co_secretary', 'secretary')
    )
    -- (b) OR the action targets a flat the caller is an active resident of (MANDATORY, Pitfall 4)
    or exists (
      select 1 from public.society_memberships sm
      where sm.user_id    = auth.uid()
        and sm.society_id = p_action.society_id
        and sm.flat_id    = p_action.flat_id
        and sm.status     = 'active'
    )
  );
$$;

-- flat_actions SELECT: via can_see_flat_action() (per-flat + board).
drop policy if exists "flat_action_select" on public.flat_actions;
create policy "flat_action_select"
  on public.flat_actions for select to authenticated
  using (public.can_see_flat_action(flat_actions.*));

-- posts SELECT: same-society + auto-hide (D-03) + soft-delete filter (Pattern 3).
-- A board/admin caller also sees hidden rows (the moderation queue). A
-- deleted_at row vanishes for EVERYONE (author-delete + confirmed takedown).
drop policy if exists "post_select" on public.posts;
create policy "post_select"
  on public.posts for select to authenticated
  using (
    society_id = public.current_society_id()
    and deleted_at is null
    and (
      hidden_at is null
      or public.current_membership_role() in ('board_member', 'co_secretary', 'secretary')
    )
  );

-- post_comments SELECT: identical hidden_at / deleted_at predicate as posts.
drop policy if exists "post_comment_select" on public.post_comments;
create policy "post_comment_select"
  on public.post_comments for select to authenticated
  using (
    society_id = public.current_society_id()
    and deleted_at is null
    and (
      hidden_at is null
      or public.current_membership_role() in ('board_member', 'co_secretary', 'secretary')
    )
  );

-- reports SELECT: admin-only (the moderation queue reads these).
drop policy if exists "reports_select" on public.reports;
create policy "reports_select"
  on public.reports for select to authenticated
  using (
    society_id = public.current_society_id()
    and public.current_membership_role() in ('co_secretary', 'secretary')
  );

-- moderation_events SELECT: admin-only (COMM-07 audit log).
drop policy if exists "moderation_events_select" on public.moderation_events;
create policy "moderation_events_select"
  on public.moderation_events for select to authenticated
  using (
    society_id = public.current_society_id()
    and public.current_membership_role() in ('co_secretary', 'secretary')
  );

-- ---------------------------------------------------------------------
-- 6. REVOKE direct writes — every write goes through a SECURITY DEFINER RPC,
--    INCLUDING delete-own (delete_post / delete_comment soft-delete).
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.flat_actions      from authenticated;
revoke insert, update, delete on public.posts             from authenticated;
revoke insert, update, delete on public.post_comments     from authenticated;
revoke insert, update, delete on public.reports           from authenticated;
revoke insert, update, delete on public.moderation_events from authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC: issue_flat_action (admin-only — FLAT-01/02/04, OQ1)
-- ---------------------------------------------------------------------
create or replace function public.issue_flat_action(
  p_flat_id     uuid,
  p_kind        public.flat_action_kind,
  p_body        text,
  p_amount      numeric default null,
  p_due_date    date    default null,
  p_action_id   uuid    default gen_random_uuid(),
  p_storage_key text    default null,
  p_mime_type   text    default null,
  p_byte_size   int     default null
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
  v_action_id   uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- Admin-only issue (D-05; board_member can SEE but not issue).
  if v_role not in ('co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  -- Target flat must belong to this society.
  if not exists (
    select 1 from public.flats where id = p_flat_id and society_id = v_society_id
  ) then
    raise exception 'INVALID_FLAT';
  end if;

  -- A fine requires a positive amount AND a due date (FLAT-01).
  if p_kind = 'fine' and (p_amount is null or p_amount <= 0 or p_due_date is null) then
    raise exception 'FINE_FIELDS_REQUIRED';
  end if;

  -- Caller's own flat in this society (denormalized for attribution).
  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  insert into public.flat_actions (
    id, society_id, flat_id, issuer_id, issuer_flat_id,
    kind, body, amount, due_date, fine_status
  )
  values (
    p_action_id, v_society_id, p_flat_id, v_caller_id, v_caller_flat,
    p_kind, p_body,
    case when p_kind = 'fine' then p_amount   else null end,
    case when p_kind = 'fine' then p_due_date else null end,
    case when p_kind = 'fine' then 'outstanding'::public.fine_status else null end
  )
  returning id into v_action_id;

  -- Optional bylaw/AGM PDF (FLAT-04) — reuse polymorphic attachments.
  if p_storage_key is not null then
    insert into public.attachments (
      society_id, owner_kind, owner_id, storage_key, mime_type, byte_size, created_by
    )
    values (
      v_society_id, 'flat_action', v_action_id, p_storage_key, p_mime_type, p_byte_size, v_caller_id
    );
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'flat_action.issued', 'flat_actions', v_action_id,
    jsonb_build_object('kind', p_kind, 'flat_id', p_flat_id)
  );

  return jsonb_build_object('flat_action_id', v_action_id, 'society_id', v_society_id);
end;
$$;

grant execute on function public.issue_flat_action(
  uuid, public.flat_action_kind, text, numeric, date, uuid, text, text, int
) to authenticated;

-- ---------------------------------------------------------------------
-- 8. RPC: acknowledge_fine (member, own-flat resident only — D-04)
--    Atomic UPDATE outstanding -> acknowledged. Returns {ok,reason} — does
--    NOT throw when not acknowledgeable (wrong flat / already acked / waived).
-- ---------------------------------------------------------------------
create or replace function public.acknowledge_fine(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_row        public.flat_actions%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  update public.flat_actions fa
     set fine_status = 'acknowledged'
   where fa.id          = p_action_id
     and fa.society_id  = v_society_id
     and fa.kind        = 'fine'
     and fa.fine_status = 'outstanding'
     and exists (
       select 1 from public.society_memberships sm
       where sm.user_id    = v_caller_id
         and sm.society_id = v_society_id
         and sm.flat_id    = fa.flat_id
         and sm.status     = 'active'
     )
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_acknowledgeable');
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'flat_action.fine_acknowledged', 'flat_actions', p_action_id);

  return jsonb_build_object('ok', true, 'fine_status', 'acknowledged');
end;
$$;

grant execute on function public.acknowledge_fine(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. RPC: waive_fine (ADMIN-ONLY — D-04 "Secretary can Waive", OQ1)
--    co_secretary/secretary only — NOT board_member. Atomic
--    outstanding|acknowledged -> waived.
-- ---------------------------------------------------------------------
create or replace function public.waive_fine(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_role       text := public.current_membership_role();
  v_row        public.flat_actions%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- Admin-only waive (D-04). board_member CANNOT waive (raises INSUFFICIENT_ROLE).
  if v_role not in ('co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  update public.flat_actions fa
     set fine_status = 'waived'
   where fa.id          = p_action_id
     and fa.society_id  = v_society_id
     and fa.kind        = 'fine'
     and fa.fine_status in ('outstanding', 'acknowledged')
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_waivable');
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'flat_action.fine_waived', 'flat_actions', p_action_id);

  return jsonb_build_object('ok', true, 'fine_status', 'waived');
end;
$$;

grant execute on function public.waive_fine(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. RPC: create_post (any active member + OQ2 key-prefix guard — COMM-01)
--     Every photo key MUST live under {society}/posts/{postId}/ or the call
--     raises INVALID_ATTACHMENT_KEY — prevents bypassing the moderation gate.
-- ---------------------------------------------------------------------
create or replace function public.create_post(
  p_kind       public.post_kind,
  p_body       text,
  p_post_id    uuid    default gen_random_uuid(),
  p_photo_keys text[]  default null
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
  v_post_id     uuid;
  v_prefix      text;
  v_key         text;
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
  if v_caller_flat is null then
    -- A member with no flat is not an active member of this society.
    if not exists (
      select 1 from public.society_memberships sm
      where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
    ) then
      raise exception 'NOT_ACTIVE_MEMBER';
    end if;
  end if;

  -- Defensive ceiling: at most 4 photos (COMM-01).
  if p_photo_keys is not null and array_length(p_photo_keys, 1) > 4 then
    raise exception 'TOO_MANY_PHOTOS';
  end if;

  insert into public.posts (id, society_id, author_id, author_flat_id, kind, body)
  values (p_post_id, v_society_id, v_caller_id, v_caller_flat, p_kind, p_body)
  returning id into v_post_id;

  -- OQ2 key-handoff guard: every key must be under {society}/posts/{postId}/.
  if p_photo_keys is not null then
    v_prefix := v_society_id::text || '/posts/' || p_post_id::text || '/';
    foreach v_key in array p_photo_keys loop
      if v_key is null or position(v_prefix in v_key) <> 1 then
        raise exception 'INVALID_ATTACHMENT_KEY';
      end if;
      insert into public.attachments (
        society_id, owner_kind, owner_id, storage_key, created_by
      )
      values (v_society_id, 'post', v_post_id, v_key, v_caller_id);
    end loop;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'post.created', 'posts', v_post_id,
    jsonb_build_object('kind', p_kind, 'photo_count', coalesce(array_length(p_photo_keys, 1), 0))
  );

  return jsonb_build_object('post_id', v_post_id, 'society_id', v_society_id);
end;
$$;

grant execute on function public.create_post(public.post_kind, text, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 11. RPC: add_comment (any active member — COMM-04 prerequisite)
--     The parent post must exist, be in-society, and not hidden/deleted.
-- ---------------------------------------------------------------------
create or replace function public.add_comment(
  p_post_id    uuid,
  p_body       text,
  p_comment_id uuid default gen_random_uuid()
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
  v_comment_id  uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if not exists (
    select 1 from public.society_memberships sm
    where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
  ) then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;

  -- Parent post must be visible (in-society, not hidden, not deleted).
  if not exists (
    select 1 from public.posts
    where id = p_post_id
      and society_id = v_society_id
      and hidden_at is null
      and deleted_at is null
  ) then
    raise exception 'POST_NOT_FOUND';
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  insert into public.post_comments (id, society_id, post_id, author_id, author_flat_id, body)
  values (p_comment_id, v_society_id, p_post_id, v_caller_id, v_caller_flat, p_body)
  returning id into v_comment_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'comment.created', 'post_comments', v_comment_id);

  return jsonb_build_object('comment_id', v_comment_id, 'society_id', v_society_id);
end;
$$;

grant execute on function public.add_comment(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 12. RPC: report_content (any active member; first-report auto-hide — D-03)
--     Sets hidden_at = coalesce(hidden_at, now()) so the FIRST report wins and
--     subsequent reports are idempotent on the hide (Pitfall 5). Writes the
--     reports row + a moderation_events('report') audit row.
-- ---------------------------------------------------------------------
create or replace function public.report_content(
  p_target_kind public.report_target_kind,
  p_target_id   uuid,
  p_reason      text,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_report_id  uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if not exists (
    select 1 from public.society_memberships sm
    where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
  ) then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;

  if p_target_kind = 'post' then
    if not exists (
      select 1 from public.posts where id = p_target_id and society_id = v_society_id
    ) then
      raise exception 'TARGET_NOT_FOUND';
    end if;
    update public.posts
       set hidden_at = coalesce(hidden_at, now())   -- FIRST report wins (idempotent)
     where id = p_target_id and society_id = v_society_id;
  else
    if not exists (
      select 1 from public.post_comments where id = p_target_id and society_id = v_society_id
    ) then
      raise exception 'TARGET_NOT_FOUND';
    end if;
    update public.post_comments
       set hidden_at = coalesce(hidden_at, now())
     where id = p_target_id and society_id = v_society_id;
  end if;

  insert into public.reports (society_id, target_kind, target_id, reporter_id, reason, note)
  values (v_society_id, p_target_kind, p_target_id, v_caller_id, p_reason, p_note)
  returning id into v_report_id;

  insert into public.moderation_events (society_id, event_kind, actor_id, target_kind, target_id, reason)
  values (v_society_id, 'report', v_caller_id, p_target_kind, p_target_id, p_reason);

  return jsonb_build_object('report_id', v_report_id, 'hidden', true);
end;
$$;

grant execute on function public.report_content(
  public.report_target_kind, uuid, text, text
) to authenticated;

-- ---------------------------------------------------------------------
-- 13. RPC: restore_content (ADMIN-ONLY — D-03). Clears hidden_at (re-show for
--     everyone) + writes moderation_events('restore'). Member call -> INSUFFICIENT_ROLE.
-- ---------------------------------------------------------------------
create or replace function public.restore_content(
  p_target_kind public.report_target_kind,
  p_target_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_role       text := public.current_membership_role();
  v_found      boolean := false;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  if p_target_kind = 'post' then
    update public.posts set hidden_at = null
     where id = p_target_id and society_id = v_society_id
    returning true into v_found;
  else
    update public.post_comments set hidden_at = null
     where id = p_target_id and society_id = v_society_id
    returning true into v_found;
  end if;

  if v_found is not true then raise exception 'TARGET_NOT_FOUND'; end if;

  insert into public.moderation_events (society_id, event_kind, actor_id, target_kind, target_id)
  values (v_society_id, 'restore', v_caller_id, p_target_kind, p_target_id);

  return jsonb_build_object('ok', true, 'restored', true);
end;
$$;

grant execute on function public.restore_content(public.report_target_kind, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 14. RPC: confirm_takedown (ADMIN-ONLY — D-03). Sets deleted_at = now()
--     (removes from the feed for everyone) + moderation_events('takedown').
-- ---------------------------------------------------------------------
create or replace function public.confirm_takedown(
  p_target_kind public.report_target_kind,
  p_target_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_role       text := public.current_membership_role();
  v_found      boolean := false;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  if p_target_kind = 'post' then
    update public.posts set deleted_at = now()
     where id = p_target_id and society_id = v_society_id and deleted_at is null
    returning true into v_found;
  else
    update public.post_comments set deleted_at = now()
     where id = p_target_id and society_id = v_society_id and deleted_at is null
    returning true into v_found;
  end if;

  if v_found is not true then raise exception 'TARGET_NOT_FOUND'; end if;

  insert into public.moderation_events (society_id, event_kind, actor_id, target_kind, target_id)
  values (v_society_id, 'takedown', v_caller_id, p_target_kind, p_target_id);

  return jsonb_build_object('ok', true, 'taken_down', true);
end;
$$;

grant execute on function public.confirm_takedown(public.report_target_kind, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 15. RPC: set_grievance_officer (ADMIN-ONLY — D-06, COMM-05). Updates the two
--     societies columns. Does NOT rely on the broad tenant_update_societies
--     policy (Pattern 6 flag — the RPC is the gate).
-- ---------------------------------------------------------------------
create or replace function public.set_grievance_officer(
  p_name    text,
  p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_role       text := public.current_membership_role();
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('secretary', 'co_secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  update public.societies
     set grievance_officer_name    = nullif(btrim(p_name), ''),
         grievance_officer_contact = nullif(btrim(p_contact), '')
   where id = v_society_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'grievance.set', 'societies', v_society_id,
    jsonb_build_object('name', p_name)
  );

  return jsonb_build_object('ok', true, 'society_id', v_society_id);
end;
$$;

grant execute on function public.set_grievance_officer(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 16. RPC: get_grievance_officer (any active member — D-06, Pattern 6)
--     COALESCE name -> Secretary full_name -> 'Society Secretary';
--     contact -> secretary_phone -> ''. is_default = (name unset).
-- ---------------------------------------------------------------------
create or replace function public.get_grievance_officer()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'name',       coalesce(s.grievance_officer_name, sec.full_name, 'Society Secretary'),
    'contact',    coalesce(s.grievance_officer_contact, s.secretary_phone, ''),
    'is_default', (s.grievance_officer_name is null)
  )
  from public.societies s
  left join lateral (
    select p.full_name
    from public.society_memberships m
    join public.profiles p on p.user_id = m.user_id
    where m.society_id = s.id and m.role = 'secretary' and m.status = 'active'
    limit 1
  ) sec on true
  where s.id = public.current_society_id();
$$;

grant execute on function public.get_grievance_officer() to authenticated;

-- ---------------------------------------------------------------------
-- 17. RPC: delete_post (AUTHOR-ONLY soft-delete). Atomic UPDATE gated on
--     author_id = auth.uid(); 0 rows -> NOT_OWNER. Writes a takedown
--     moderation_events row for the retention trail (COMM-07).
-- ---------------------------------------------------------------------
create or replace function public.delete_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_row        public.posts%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  update public.posts
     set deleted_at = now()
   where id         = p_post_id
     and society_id = v_society_id
     and author_id  = v_caller_id   -- AUTHOR-ONLY gate
     and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'NOT_OWNER';
  end if;

  insert into public.moderation_events (society_id, event_kind, actor_id, target_kind, target_id)
  values (v_society_id, 'takedown', v_caller_id, 'post', p_post_id);

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'post.deleted', 'posts', p_post_id);

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

grant execute on function public.delete_post(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 18. RPC: delete_comment (AUTHOR-ONLY soft-delete). Same gate as delete_post.
-- ---------------------------------------------------------------------
create or replace function public.delete_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_row        public.post_comments%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  update public.post_comments
     set deleted_at = now()
   where id         = p_comment_id
     and society_id = v_society_id
     and author_id  = v_caller_id   -- AUTHOR-ONLY gate
     and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'NOT_OWNER';
  end if;

  insert into public.moderation_events (society_id, event_kind, actor_id, target_kind, target_id)
  values (v_society_id, 'takedown', v_caller_id, 'comment', p_comment_id);

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'comment.deleted', 'post_comments', p_comment_id);

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

grant execute on function public.delete_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 19. flat_action_recipients(p_flat_action_id) — service-role push helper
--     (FLAT-03). Flat-scoped: only the target flat's active account-holding
--     members. OQ3 category mapping: fine -> mute_fines else mute_general.
--     Reuses the IST quiet-hours wrap + rolling-24h cap from
--     eligible_push_recipients (phase5 lines 768-821). Family members are
--     contact-only (no auth user / no token) — push lands on the flat's
--     account-holding members.
-- ---------------------------------------------------------------------
create or replace function public.flat_action_recipients(p_flat_action_id uuid)
returns table (user_id uuid, expo_token text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_society_id uuid;
  v_flat_id    uuid;
  v_kind       public.flat_action_kind;
  v_now_ist    time := (now() at time zone 'Asia/Kolkata')::time;
begin
  select fa.society_id, fa.flat_id, fa.kind
    into v_society_id, v_flat_id, v_kind
  from public.flat_actions fa
  where fa.id = p_flat_action_id;

  if v_society_id is null then
    return;  -- unknown flat action -> no recipients
  end if;

  return query
  select e.user_id, pt.expo_token
  from public.notification_preferences_effective e
  join public.society_memberships sm
    on sm.user_id    = e.user_id
   and sm.society_id = e.society_id
   and sm.flat_id    = v_flat_id          -- per-FLAT scope (FLAT-03)
   and sm.status     = 'active'
  join public.push_tokens pt
    on pt.user_id = e.user_id and pt.notifications_enabled
  where e.society_id = v_society_id
    -- OQ3 category mapping: fine -> mute_fines, warning/notify -> mute_general.
    and not (
      case v_kind
        when 'fine' then e.mute_fines
        else             e.mute_general
      end
    )
    -- IST quiet-hours wrap-around (mirrors eligible_push_recipients).
    and not (
      case
        when e.quiet_start <= e.quiet_end
          then v_now_ist >= e.quiet_start and v_now_ist < e.quiet_end       -- same-day
        else v_now_ist >= e.quiet_start or  v_now_ist < e.quiet_end         -- overnight wrap
      end
    )
    -- Rolling-24h cap.
    and (
      select count(*)
      from public.push_deliveries pd
      where pd.user_id = e.user_id
        and pd.created_at > now() - interval '24 hours'
    ) < e.cap_per_day;
end;
$$;

grant execute on function public.flat_action_recipients(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 20. Realtime publication (Pitfall 3 — Realtime container reads at startup;
--     supabase db reset replays these but the stack must be restarted).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.flat_actions;
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_comments;

-- ---------------------------------------------------------------------
-- 21. Push trigger: flat_actions AFTER INSERT -> flat-action-fanout
--     (mirrors notify_push_on_notification). Fire-and-forget net.http_post
--     with the x-push-trigger:'true' sentinel header.
-- ---------------------------------------------------------------------
create or replace function public.notify_push_on_flat_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := 'http://host.docker.internal:54321/functions/v1/flat-action-fanout';
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

drop trigger if exists flat_action_push_trigger on public.flat_actions;
create trigger flat_action_push_trigger
  after insert on public.flat_actions
  for each row execute function public.notify_push_on_flat_action();
