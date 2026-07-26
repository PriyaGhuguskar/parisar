-- =====================================================================
-- Phase 7 — Dashboard Summary RPC (DASH-03 / D-01)
--
-- Single role-aware SECURITY DEFINER aggregation over Phase 4/5/6 tables.
-- Mirrors the Phase 5 RPC pattern (verified: 20260528000008 lines 580-697:
-- request_booking / approve_booking — same `set search_path = public, auth`
-- + `auth.uid()` / `current_society_id()` / `current_membership_role()`
-- preamble, same `raise exception 'AUTH_REQUIRED'` / `'NO_SOCIETY'` gates).
--
-- RLS-respecting note: SECURITY DEFINER bypasses RLS, so EVERY sub-query
-- below filters by `society_id = v_society` and (member branch) by
-- `v_caller`. Cross-society leakage is the headline threat (T-07-04) —
-- locked by tests/isolation/dashboard-summary.test.js (Test 3).
--
-- Response envelope (D-01 + D-04):
--   { role,
--     // secretary/board branch:
--     complaints:    { count, previews[{id,title,flat}] },
--     bookings:      { count, previews[{id,amenity,slot,flat}] },
--     notifications: { count, previews[{id,title}] },
--     flatActions:   { count, previews[{id,kind,flat}] },
--     // member branch:
--     myComplaints:  { count, previews[{id,title,status}] },
--     notifications: { count, previews[{id,title}] },
--     myBookings:    { count, previews[{id,amenity,slot,status}] },
--     community:     { count, previews[{id,author,flat,title}] } }
--
-- Counts: 0..N (actual total in the relevant window).
-- Previews: cap at 2 rows (D-04). LIMIT 2 in every preview sub-query.
-- Windows: complaints/notifications/flat_actions/posts "last 7 days";
--   bookings "status='pending'" (no time cap, that's the secretary's queue).
--
-- Column-name verification against existing migrations:
--   complaints.reporter_id        (not author_id)            — phase4 line 47
--   complaints.reporter_flat_id   (not flat_id)              — phase4 line 49
--   complaints.description        (used as preview title)    — phase4 line 51
--   bookings.requester_id         (not author_id)            — phase5 line 153
--   bookings.requester_flat_id    (not flat_id)              — phase5 line 154
--   bookings.time_range tstzrange (not start_at/end_at)      — phase5 line 155
--   notifications.author_id (denormalized)                   — phase5 line 95
--   flat_actions.flat_id + issuer_id                         — phase6 line 123-124
--   posts.author_id + posts.body + posts.hidden_at           — phase6 line 143/146/147
--   flats.number + wings.name  (no flats.label column)       — phase1 line 41
--
-- JavaScript project — SQL only, no TypeScript.
-- =====================================================================

create or replace function public.get_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller   uuid := auth.uid();
  v_society  uuid := public.current_society_id();
  v_role     text := public.current_membership_role();
  v_result   jsonb;

  v_complaints_count        int;
  v_complaints_previews     jsonb;
  v_bookings_count          int;
  v_bookings_previews       jsonb;
  v_notifications_count     int;
  v_notifications_previews  jsonb;
  v_flat_actions_count      int;
  v_flat_actions_previews   jsonb;

  v_my_complaints_count     int;
  v_my_complaints_previews  jsonb;
  v_my_bookings_count       int;
  v_my_bookings_previews    jsonb;
  v_community_count         int;
  v_community_previews      jsonb;
begin
  if v_caller is null  then raise exception 'AUTH_REQUIRED'; end if;
  if v_society is null then raise exception 'NO_SOCIETY';    end if;

  if v_role in ('board_member','co_secretary','secretary') then
    -- ============================================================
    -- SECRETARY / BOARD VIEW (DASH-01)
    -- ============================================================

    -- complaints: last-7d count + last-2 previews (society-scoped).
    select count(*) into v_complaints_count
    from public.complaints
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_complaints_previews
    from (
      select jsonb_build_object(
        'id',    c.id,
        'title', c.description,
        'flat',  coalesce(w.name || '-' || f.number, '')
      ) as p
      from public.complaints c
      left join public.flats f on f.id = c.reporter_flat_id
      left join public.wings w on w.id = f.wing_id
      where c.society_id = v_society
        and c.created_at >= (now() - interval '7 days')
      order by c.created_at desc
      limit 2
    ) sub;

    -- bookings: pending count + last-2 pending previews.
    -- time_range is tstzrange — use lower() for the slot start.
    select count(*) into v_bookings_count
    from public.bookings
    where society_id = v_society
      and status = 'pending';

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_bookings_previews
    from (
      select jsonb_build_object(
        'id',      b.id,
        'amenity', a.name,
        'slot',    to_char(lower(b.time_range) at time zone 'Asia/Kolkata', 'Mon DD HH24:MI'),
        'flat',    coalesce(w.name || '-' || f.number, '')
      ) as p
      from public.bookings b
      left join public.amenities a on a.id = b.amenity_id
      left join public.flats     f on f.id = b.requester_flat_id
      left join public.wings     w on w.id = f.wing_id
      where b.society_id = v_society
        and b.status = 'pending'
      order by b.created_at desc
      limit 2
    ) sub;

    -- notifications: last-7d count + last-2 previews.
    select count(*) into v_notifications_count
    from public.notifications
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_notifications_previews
    from (
      select jsonb_build_object('id', n.id, 'title', n.title) as p
      from public.notifications n
      where n.society_id = v_society
      order by n.created_at desc
      limit 2
    ) sub;

    -- flat actions: last-7d count + last-2 previews.
    select count(*) into v_flat_actions_count
    from public.flat_actions
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_flat_actions_previews
    from (
      select jsonb_build_object(
        'id',   fa.id,
        'kind', fa.kind::text,
        'flat', coalesce(w.name || '-' || f.number, '')
      ) as p
      from public.flat_actions fa
      left join public.flats f on f.id = fa.flat_id
      left join public.wings w on w.id = f.wing_id
      where fa.society_id = v_society
      order by fa.created_at desc
      limit 2
    ) sub;

    v_result := jsonb_build_object(
      'role',          v_role,
      'complaints',    jsonb_build_object('count', v_complaints_count,    'previews', v_complaints_previews),
      'bookings',      jsonb_build_object('count', v_bookings_count,      'previews', v_bookings_previews),
      'notifications', jsonb_build_object('count', v_notifications_count, 'previews', v_notifications_previews),
      'flatActions',   jsonb_build_object('count', v_flat_actions_count,  'previews', v_flat_actions_previews)
    );

  else
    -- ============================================================
    -- MEMBER VIEW (DASH-02)
    -- ============================================================

    -- myComplaints: count + last-2 previews (caller's own complaints only).
    select count(*) into v_my_complaints_count
    from public.complaints
    where society_id = v_society
      and reporter_id = v_caller;

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_my_complaints_previews
    from (
      select jsonb_build_object(
        'id',     c.id,
        'title',  c.description,
        'status', c.status::text
      ) as p
      from public.complaints c
      where c.society_id  = v_society
        and c.reporter_id = v_caller
      order by c.created_at desc
      limit 2
    ) sub;

    -- notifications: society-wide visibility (members see society notices).
    select count(*) into v_notifications_count
    from public.notifications
    where society_id = v_society
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_notifications_previews
    from (
      select jsonb_build_object('id', n.id, 'title', n.title) as p
      from public.notifications n
      where n.society_id = v_society
      order by n.created_at desc
      limit 2
    ) sub;

    -- myBookings: caller's own bookings only.
    select count(*) into v_my_bookings_count
    from public.bookings
    where society_id   = v_society
      and requester_id = v_caller;

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_my_bookings_previews
    from (
      select jsonb_build_object(
        'id',      b.id,
        'amenity', a.name,
        'slot',    to_char(lower(b.time_range) at time zone 'Asia/Kolkata', 'Mon DD HH24:MI'),
        'status',  b.status::text
      ) as p
      from public.bookings b
      left join public.amenities a on a.id = b.amenity_id
      where b.society_id   = v_society
        and b.requester_id = v_caller
      order by b.created_at desc
      limit 2
    ) sub;

    -- community posts: society-wide, NOT hidden, last 7 days.
    -- hidden_at filter is the T-07-05 mitigation (member must never see
    -- auto-hidden posts via the dashboard preview).
    select count(*) into v_community_count
    from public.posts
    where society_id = v_society
      and hidden_at is null
      and deleted_at is null
      and created_at >= (now() - interval '7 days');

    select coalesce(jsonb_agg(p), '[]'::jsonb) into v_community_previews
    from (
      select jsonb_build_object(
        'id',     po.id,
        'author', coalesce(pr.full_name, 'Member'),
        'flat',   coalesce(w.name || '-' || f.number, ''),
        'title',  left(po.body, 60)
      ) as p
      from public.posts po
      left join public.profiles pr on pr.user_id = po.author_id
      left join public.flats    f  on f.id      = po.author_flat_id
      left join public.wings    w  on w.id      = f.wing_id
      where po.society_id = v_society
        and po.hidden_at  is null
        and po.deleted_at is null
      order by po.created_at desc
      limit 2
    ) sub;

    v_result := jsonb_build_object(
      'role',          'member',
      'myComplaints',  jsonb_build_object('count', v_my_complaints_count,  'previews', v_my_complaints_previews),
      'notifications', jsonb_build_object('count', v_notifications_count,  'previews', v_notifications_previews),
      'myBookings',    jsonb_build_object('count', v_my_bookings_count,    'previews', v_my_bookings_previews),
      'community',     jsonb_build_object('count', v_community_count,      'previews', v_community_previews)
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_summary() from public;
grant execute on function public.get_dashboard_summary() to authenticated;

comment on function public.get_dashboard_summary() is
  'Phase 7 DASH-03 — role-aware aggregation for the Home dashboard. RLS-respecting via explicit society_id filters in every sub-query (T-07-04); member branch additionally filters by reporter_id/requester_id = auth.uid(); community branch filters hidden_at is null (T-07-05); every preview sub-query is LIMIT 2 (T-07-07). Cross-society leakage is locked by tests/isolation/dashboard-summary.test.js.';
