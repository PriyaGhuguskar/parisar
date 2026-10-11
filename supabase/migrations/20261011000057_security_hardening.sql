-- ============================================================================
-- 057 — security hardening (defence in depth; no behaviour change for clients)
-- ----------------------------------------------------------------------------
-- Runs after 054 (tenant lockdown), 055 (logic + infra) and 056 (auth hardening).
-- Every statement is idempotent so the file can be re-applied.
--
--   §1  RLS on the last tables that had it OFF (otp_requests, code_redemptions,
--       app_private.*). They were already unreachable (privileges revoked /
--       schema not exposed); RLS with no policy is a second lock. Only the table
--       owner (SECURITY DEFINER functions) and service_role (BYPASSRLS) use them.
--   §1a Per-user throttles: file_complaint (COMPLAINT_RATE_LIMITED, 10/h),
--       file_notification (NOTICE_RATE_LIMITED, 20/h), add_comment
--       (COMMENT_RATE_LIMITED, 30/10 min).
--   §1b Length caps (CHECK ... NOT VALID) on user-entered free text.
--   §2  EXECUTE on public functions: nothing is callable by `anon` any more.
--       Every app RPC is called after sign-in (audited: all `.rpc(` call sites in
--       apps/ and packages/; the only pre-auth one is dev_peek_otp, which
--       seed.sql re-grants locally). `authenticated` and `service_role` keep
--       exactly the access they had. Trigger functions and extension functions
--       are not touched.
--   §3  Default privileges: functions created later are no longer executable by
--       PUBLIC / anon unless a migration grants it explicitly.
--       ** A future pre-auth RPC needs `grant execute ... to anon`. **
--   §4  push_tokens: no direct INSERT/UPDATE by users — register_push_token (055)
--       is the only write path (it also moves a token between accounts).
--       SELECT and DELETE of the caller's own rows (RLS) are unchanged.
--   §5  TRUNCATE / REFERENCES / TRIGGER revoked from anon + authenticated on
--       every public table (TRUNCATE ignores RLS; no client uses any of them).
--   §6  Storage bucket parisar-attachments: private, 20 MiB per object, only
--       image/* types the apps produce + PDF (no SVG/HTML → no stored XSS on the
--       storage origin). Delete policy uses parisar_try_uuid like 054's update.
--   §7  Realtime: public.polls joins supabase_realtime (PollBlock subscribes to
--       poll status). poll_votes stays own-row-only; tallies via get_poll_results.
--   §8  Self-check: the migration fails if any public table has RLS off or any
--       public app function is still executable by anon.
-- ============================================================================

-- ============================================================================
-- §1 RLS everywhere
-- ============================================================================
alter table if exists public.otp_requests       enable row level security;
alter table if exists public.code_redemptions   enable row level security;
alter table if exists app_private.runtime_config        enable row level security;
alter table if exists app_private.code_attempt_failures enable row level security;
alter table if exists app_private.dev_flags             enable row level security;

-- Belt and braces: these were revoked in 005 / 006; keep them revoked.
revoke all on table public.otp_requests     from anon, authenticated;
revoke all on table public.code_redemptions from anon, authenticated;

-- ============================================================================
-- §1a Per-user throttles on user-generated content (raise_sos / report_content
--     pattern from 055, counted in public.edge_rate_events via
--     svc_rate_limit_hit, advisory-locked per user). A call that fails later in
--     the RPC rolls its count back, so only real writes count.
--       file_complaint    10 / hour      → COMPLAINT_RATE_LIMITED
--       file_notification 20 / hour      → NOTICE_RATE_LIMITED (board users; polls too)
--       add_comment       30 / 10 min    → COMMENT_RATE_LIMITED
--     Signatures, grants and every other line are unchanged (bodies generated
--     from the latest definitions: 054, 054, 009).
-- ============================================================================
-- file_complaint: body copied verbatim from 20261011000054_tenant_lockdown.sql; only the (057) throttle is new.
create or replace function public.file_complaint(
  p_kind             public.complaint_kind,
  p_description      text,
  p_reporter_flat_id uuid,
  p_language_code    text default 'en',
  p_complaint_id     uuid default gen_random_uuid(),
  p_storage_key      text default null,
  p_mime_type        text default null,
  p_byte_size        int  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id    uuid := auth.uid();
  v_society_id   uuid := public.current_society_id();
  v_complaint_id uuid;
begin
  if v_caller_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_society_id is null then
    raise exception 'NO_SOCIETY';
  end if;

  if not exists (
    select 1 from public.society_memberships
    where user_id    = v_caller_id
      and society_id = v_society_id
      and status     = 'active'
  ) then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;

  if not exists (
    select 1 from public.flats
    where id = p_reporter_flat_id and society_id = v_society_id
  ) then
    raise exception 'INVALID_FLAT';
  end if;

  if not public.svc_rate_limit_hit('rpc:file_complaint', v_caller_id::text, 10, 3600) then
    raise exception 'COMPLAINT_RATE_LIMITED';                       -- (057) 10 / hour / user
  end if;

  perform app_private.assert_attachment_key(p_storage_key, v_society_id, 'complaints',
                                            p_complaint_id, p_byte_size);           -- (054)

  insert into public.complaints (
    id, society_id, reporter_id, reporter_flat_id, kind, description, language_code
  )
  values (
    p_complaint_id, v_society_id, v_caller_id, p_reporter_flat_id,
    p_kind, p_description, coalesce(p_language_code, 'en')
  )
  returning id into v_complaint_id;

  if p_storage_key is not null then
    insert into public.attachments (
      society_id, owner_kind, owner_id, storage_key, mime_type, byte_size, created_by
    )
    values (
      v_society_id, 'complaint', v_complaint_id, p_storage_key, p_mime_type, p_byte_size, v_caller_id
    );
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'complaint.filed', 'complaints', v_complaint_id);

  return jsonb_build_object(
    'complaint_id', v_complaint_id,
    'society_id',   v_society_id
  );
end;
$$;

-- file_notification: body copied verbatim from 20261011000054_tenant_lockdown.sql; only the (057) throttle is new.
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
set search_path = public, pg_temp
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

  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id,
                                       array['board_member', 'co_secretary', 'secretary']);  -- (054)

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

  if not public.svc_rate_limit_hit('rpc:file_notification', v_caller_id::text, 20, 3600) then
    raise exception 'NOTICE_RATE_LIMITED';                          -- (057) 20 / hour / board user
  end if;

  perform app_private.assert_attachment_key(p_storage_key, v_society_id, 'notifications',
                                            p_notification_id, p_byte_size);        -- (054)

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

  if p_poll_options is not null then
    insert into public.polls (society_id, notification_id, question)
    values (v_society_id, v_notif_id, p_poll_question)
    returning id into v_poll_id;

    for i in 1 .. array_length(p_poll_options, 1) loop
      insert into public.poll_options (society_id, poll_id, label, position)
      values (v_society_id, v_poll_id, p_poll_options[i], i);
    end loop;
  end if;

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

-- add_comment: body copied verbatim from 20260529000009_phase6_flat_actions_community.sql; only the (057) throttle is new.
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

  if not public.svc_rate_limit_hit('rpc:add_comment', v_caller_id::text, 30, 600) then
    raise exception 'COMMENT_RATE_LIMITED';                         -- (057) 30 / 10 min / user
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

-- ============================================================================
-- §1b Length caps on free text (the UIs cap lower; the REST/RPC API did not).
--     NOT VALID: existing rows are not re-checked, every new INSERT/UPDATE is.
--     Caps are ~2x the UI limits so no legitimate client input is refused.
-- ============================================================================
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('complaints',          'description',      2000),
      ('complaint_responses', 'free_text',        1000),
      ('notifications',       'title',             200),
      ('notifications',       'body',             4000),
      ('polls',               'question',          500),
      ('poll_options',        'label',             200),
      ('posts',               'body',             4000),
      ('post_comments',       'body',             2000),
      ('reports',             'reason',            200),
      ('reports',             'note',             1000),
      ('flat_actions',        'body',             4000),
      ('sos_alerts',          'description',      1000),
      ('bookings',            'purpose',          1000),
      ('bookings',            'rejection_reason', 1000)
    ) as t(tbl, col, max_len)
  loop
    if exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = r.tbl and column_name = r.col)
       and not exists (
         select 1 from pg_constraint
          where conrelid = format('public.%I', r.tbl)::regclass
            and conname = format('%s_%s_max_len', r.tbl, r.col))
    then
      execute format(
        'alter table public.%I add constraint %I check (char_length(%I) <= %s) not valid',
        r.tbl, format('%s_%s_max_len', r.tbl, r.col), r.col, r.max_len);
    end if;
  end loop;
end
$$;

-- ============================================================================
-- §2 No anon EXECUTE on app functions
-- ============================================================================
-- For every public function anon can execute (directly or through PUBLIC):
--   1. grant EXECUTE explicitly to authenticated / service_role when they have it
--      today (usually only through PUBLIC), so their access is unchanged;
--   2. revoke it from PUBLIC and anon.
-- Skipped: trigger / event-trigger functions (never RPCs; EXECUTE is checked
-- only when a trigger is created) and functions owned by an extension.
do $$
declare
  r record;
  v_auth boolean;
  v_svc  boolean;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and not exists (
             select 1 from pg_depend d
              where d.classid = 'pg_catalog.pg_proc'::regclass
                and d.objid = p.oid
                and d.deptype = 'e')
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_svc  := has_function_privilege('service_role', r.oid, 'EXECUTE');
    if v_auth then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if v_svc then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end
$$;

-- ============================================================================
-- §3 Default privileges for functions created by later migrations
-- ============================================================================
-- The PUBLIC default is global (per-schema defaults can only ADD privileges, so
-- `in schema public revoke ... from public` would be a no-op). Supabase's own
-- per-schema default grants anon/authenticated/service_role; drop only anon.
-- Wrapped so a stack where migrations run as a role that may not alter
-- postgres' defaults logs a notice instead of failing (§2 already fixed the
-- existing functions; §8 enforces it).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    begin
      alter default privileges for role postgres revoke execute on functions from public;
      alter default privileges for role postgres in schema public revoke execute on functions from anon;
    exception when insufficient_privilege then
      raise notice '057: could not alter default privileges for role postgres (%); later functions need explicit revokes', sqlerrm;
    end;
  end if;
end
$$;

-- ============================================================================
-- §4 push_tokens: writes only through register_push_token / unregister_push_token
-- ============================================================================
revoke insert, update on table public.push_tokens from anon, authenticated;

-- ============================================================================
-- §5 Privileges no client needs (TRUNCATE bypasses RLS)
-- ============================================================================
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ============================================================================
-- §6 Storage bucket limits + delete policy
-- ============================================================================
-- Types: what the apps upload — mobile JPEG (expo-image-manipulator), web
-- image/* pickers (jpeg/png/webp/heic/heif/gif/avif) and PDFs (notices, fines).
-- 20 MiB: web pickers cap at 10 MiB, moderate-image at 5 MiB; mobile PDF notices
-- have no client cap, so leave headroom. The global storage limit (config.toml /
-- dashboard) must be >= this value.
update storage.buckets
   set public             = false,
       file_size_limit    = 20971520,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'image/gif', 'image/avif', 'application/pdf'
       ]
 where id = 'parisar-attachments';

-- 013's delete policy cast the first path segment with ::uuid (an error, not a
-- refusal, on a malformed name). Same rule, using 054's safe cast.
drop policy if exists "parisar_tenant_delete" on storage.objects;
create policy "parisar_tenant_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and public.parisar_try_uuid((storage.foldername(name))[1]) = (select public.current_society_id())
    and owner = (select auth.uid())
  );

-- ============================================================================
-- §7 Realtime: polls
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'polls')
  then
    alter publication supabase_realtime add table public.polls;
  end if;
end
$$;

-- ============================================================================
-- §8 Self-check
-- ============================================================================
do $$
declare
  v_list text;
begin
  -- Every public table (not owned by an extension) has RLS on.
  select string_agg(c.relname, ', ' order by c.relname) into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and not c.relrowsecurity
     and not exists (
           select 1 from pg_depend d
            where d.classid = 'pg_catalog.pg_class'::regclass
              and d.objid = c.oid
              and d.deptype = 'e');
  if v_list is not null then
    raise exception '057 self-check: RLS disabled on public tables: %', v_list;
  end if;

  -- No app function is executable by anon.
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind in ('f', 'p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and not exists (
           select 1 from pg_depend d
            where d.classid = 'pg_catalog.pg_proc'::regclass
              and d.objid = p.oid
              and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_list is not null then
    raise exception '057 self-check: functions still executable by anon: %', v_list;
  end if;

  -- The attachments bucket is private.
  if exists (select 1 from storage.buckets where id = 'parisar-attachments' and public) then
    raise exception '057 self-check: bucket parisar-attachments is public';
  end if;
end
$$;
