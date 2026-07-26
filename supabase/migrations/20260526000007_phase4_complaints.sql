-- =====================================================================
-- Phase 4: Complaints (Lighthouse)
-- Adds: 3 tables (complaints, complaint_responses, attachments)
--       1 column (push_tokens.notifications_enabled)
--       3 enums (complaint_kind, complaint_status, attachment_owner)
--       4 helpers/RPCs (can_see_complaint helper, file_complaint,
--                       claim_complaint, add_complaint_response)
--       1 trigger function (notify_push_on_response → net.http_post)
--       2 Realtime publication entries (complaints, complaint_responses)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions (defensive — pg_net is required for the push trigger)
-- ---------------------------------------------------------------------
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'complaint_kind') then
    create type public.complaint_kind as enum ('society', 'member');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'complaint_status') then
    create type public.complaint_status as enum ('open', 'checking', 'will_resolve', 'need_info', 'resolved');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'attachment_owner') then
    create type public.attachment_owner as enum ('complaint', 'post', 'notification', 'flat_action');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

create table if not exists public.complaints (
  id               uuid primary key default gen_random_uuid(),
  society_id       uuid not null references public.societies(id) on delete cascade,
  reporter_id      uuid not null references auth.users(id) on delete restrict,
  reporter_flat_id uuid not null references public.flats(id),
  kind             public.complaint_kind not null,
  description      text not null,
  status           public.complaint_status not null default 'open',
  owner_id         uuid references auth.users(id),
  claimed_at       timestamptz,
  resolved_at      timestamptz,
  language_code    text not null default 'en',
  created_at       timestamptz not null default now()
);

create index if not exists idx_complaints_society_status
  on public.complaints (society_id, status, created_at desc);
create index if not exists idx_complaints_society_reporter
  on public.complaints (society_id, reporter_id);
create index if not exists idx_complaints_owner
  on public.complaints (owner_id) where owner_id is not null;

create table if not exists public.complaint_responses (
  id                uuid primary key default gen_random_uuid(),
  society_id        uuid not null references public.societies(id) on delete cascade,
  complaint_id      uuid not null references public.complaints(id) on delete cascade,
  responder_id      uuid not null references auth.users(id),
  responder_flat_id uuid references public.flats(id),  -- denormalized for attribution display
  response_kind     public.complaint_status not null,
  free_text         text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_complaint_responses_complaint
  on public.complaint_responses (complaint_id, created_at);
create index if not exists idx_complaint_responses_society
  on public.complaint_responses (society_id, created_at desc);

create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  owner_kind  public.attachment_owner not null,
  owner_id    uuid not null,
  storage_key text not null,
  mime_type   text,
  byte_size   int,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_attachments_owner
  on public.attachments (society_id, owner_kind, owner_id);

-- ---------------------------------------------------------------------
-- 3. push_tokens: add notifications_enabled column
-- ---------------------------------------------------------------------
alter table public.push_tokens
  add column if not exists notifications_enabled boolean not null default true;

-- ---------------------------------------------------------------------
-- 4. Enable RLS on the new tables
-- ---------------------------------------------------------------------
alter table public.complaints           enable row level security;
alter table public.complaint_responses  enable row level security;
alter table public.attachments          enable row level security;

-- ---------------------------------------------------------------------
-- 5. RLS helper + policies
-- ---------------------------------------------------------------------

-- can_see_complaint(): reporter OR (same-society board/co_secretary/secretary)
create or replace function public.can_see_complaint(p_complaint public.complaints)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select (
    p_complaint.reporter_id = auth.uid()
    or (
      p_complaint.society_id = public.current_society_id()
      and public.current_membership_role() in ('board_member', 'co_secretary', 'secretary')
    )
  );
$$;

-- complaints SELECT: via can_see_complaint() helper
drop policy if exists "complaint_select" on public.complaints;
create policy "complaint_select"
  on public.complaints for select to authenticated
  using (public.can_see_complaint(complaints.*));

-- complaints INSERT: any active member of the society can file
drop policy if exists "complaint_insert" on public.complaints;
create policy "complaint_insert"
  on public.complaints for insert to authenticated
  with check (
    society_id  = public.current_society_id()
    and reporter_id = auth.uid()
  );

-- complaints UPDATE: only SECURITY DEFINER claim_complaint / add_complaint_response
-- RPCs touch the row. Revoke direct UPDATE from authenticated clients.
revoke update on public.complaints from authenticated;

-- complaint_responses SELECT: same visibility rule as the parent complaint
drop policy if exists "complaint_responses_select" on public.complaint_responses;
create policy "complaint_responses_select"
  on public.complaint_responses for select to authenticated
  using (
    exists (
      select 1
      from public.complaints c
      where c.id = complaint_responses.complaint_id
        and public.can_see_complaint(c.*)
    )
  );

-- complaint_responses INSERT: only SECURITY DEFINER RPCs may insert.
-- Authenticated direct INSERTs are revoked so clients must go through the RPCs.
revoke insert on public.complaint_responses from authenticated;

-- attachments SELECT: same-society readers only
drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select"
  on public.attachments for select to authenticated
  using (society_id = public.current_society_id());

-- attachments INSERT: same-society writers must own the row they create
drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert"
  on public.attachments for insert to authenticated
  with check (
    society_id = public.current_society_id()
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- 6. RPC: file_complaint
-- ---------------------------------------------------------------------
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
set search_path = public, auth
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

  -- Caller must be an active member of this society.
  if not exists (
    select 1 from public.society_memberships
    where user_id    = v_caller_id
      and society_id = v_society_id
      and status     = 'active'
  ) then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;

  -- Reporter flat must belong to the same society.
  if not exists (
    select 1 from public.flats
    where id = p_reporter_flat_id and society_id = v_society_id
  ) then
    raise exception 'INVALID_FLAT';
  end if;

  insert into public.complaints (
    id, society_id, reporter_id, reporter_flat_id, kind, description, language_code
  )
  values (
    p_complaint_id, v_society_id, v_caller_id, p_reporter_flat_id,
    p_kind, p_description, coalesce(p_language_code, 'en')
  )
  returning id into v_complaint_id;

  -- Optional attachment row when a photo was uploaded before the RPC call.
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

grant execute on function public.file_complaint(
  public.complaint_kind, text, uuid, text, uuid, text, text, int
) to authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC: claim_complaint (atomic first-responder)
-- ---------------------------------------------------------------------
create or replace function public.claim_complaint(
  p_complaint_id  uuid,
  p_response_kind public.complaint_status,
  p_free_text     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id     uuid := auth.uid();
  v_society_id    uuid := public.current_society_id();
  v_role          text := public.current_membership_role();
  v_updated       public.complaints%rowtype;
  v_response_id   uuid;
  v_caller_flat   uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  -- Look up the caller's flat in this society (denormalize onto complaint_responses).
  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  -- THE ATOMIC CLAIM: only succeeds if owner_id is currently NULL AND the row is in
  -- the caller's society. Two concurrent callers cannot both pass the predicate.
  update public.complaints
     set owner_id   = v_caller_id,
         status     = p_response_kind,
         claimed_at = now(),
         resolved_at = case when p_response_kind = 'resolved' then now() else null end
   where id         = p_complaint_id
     and society_id = v_society_id
     and owner_id is null
  returning * into v_updated;

  -- 0 rows updated → race lost (or row in another society / already claimed).
  if v_updated.id is null then
    return null;
  end if;

  insert into public.complaint_responses (
    society_id, complaint_id, responder_id, responder_flat_id, response_kind, free_text
  )
  values (
    v_society_id, p_complaint_id, v_caller_id, v_caller_flat, p_response_kind, p_free_text
  )
  returning id into v_response_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'complaint.claimed', 'complaints', p_complaint_id,
    jsonb_build_object('response_kind', p_response_kind, 'response_id', v_response_id)
  );

  return to_jsonb(v_updated);
end;
$$;

grant execute on function public.claim_complaint(uuid, public.complaint_status, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 8. RPC: add_complaint_response (owner-only follow-ups)
-- ---------------------------------------------------------------------
create or replace function public.add_complaint_response(
  p_complaint_id  uuid,
  p_response_kind public.complaint_status,
  p_free_text     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id    uuid := auth.uid();
  v_society_id   uuid := public.current_society_id();
  v_response_id  uuid;
  v_caller_flat  uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- Owner check: only the claim winner can add further responses.
  if not exists (
    select 1 from public.complaints
    where id         = p_complaint_id
      and society_id = v_society_id
      and owner_id   = v_caller_id
  ) then
    raise exception 'NOT_OWNER';
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

  update public.complaints
     set status      = p_response_kind,
         resolved_at = case
                         when p_response_kind = 'resolved' then now()
                         else resolved_at
                       end
   where id = p_complaint_id and society_id = v_society_id;

  insert into public.complaint_responses (
    society_id, complaint_id, responder_id, responder_flat_id, response_kind, free_text
  )
  values (
    v_society_id, p_complaint_id, v_caller_id, v_caller_flat, p_response_kind, p_free_text
  )
  returning id into v_response_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (
    v_society_id, v_caller_id, 'complaint.response_added', 'complaint_responses', v_response_id,
    jsonb_build_object('response_kind', p_response_kind)
  );

  return v_response_id;
end;
$$;

grant execute on function public.add_complaint_response(uuid, public.complaint_status, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 9. Realtime publication
--    These statements require a full Supabase restart to take effect at the
--    Realtime service layer. supabase db reset replays them into pg_publication
--    but the Realtime container reads the publication at startup.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.complaints;
alter publication supabase_realtime add table public.complaint_responses;

-- ---------------------------------------------------------------------
-- 10. Push trigger: complaint_response INSERT → push-fanout Edge Function
--     Uses net.http_post (pg_net) — fire-and-forget; does NOT block the
--     originating transaction. A sentinel header is used in place of the
--     service-role key to avoid storing secrets in the migration.
-- ---------------------------------------------------------------------
create or replace function public.notify_push_on_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_url     text := 'http://host.docker.internal:54321/functions/v1/push-fanout';
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
      'Content-Type',  'application/json',
      'x-push-trigger', 'true'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists complaint_response_push_trigger on public.complaint_responses;
create trigger complaint_response_push_trigger
  after insert on public.complaint_responses
  for each row execute function public.notify_push_on_response();
