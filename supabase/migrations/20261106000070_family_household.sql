-- ============================================================================
-- Migration 070: family invites and same-flat household access.
--
-- Family invite: an owner or tenant creates it, the token is shown once and only
-- its SHA-256 is stored. Nothing is sent (Decision 5).
--
-- Household: knowing a flat number never grants access. household_lookup shows at
-- most masked names and a count, no phones. A request grants nothing until an owner
-- or authorised member of that flat, or a society manager, approves it.
-- ============================================================================

create table if not exists public.family_invites (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references public.societies(id) on delete cascade,
  flat_id       uuid not null references public.flats(id) on delete cascade,
  membership_id uuid not null references public.society_memberships(id) on delete cascade,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  full_name     text not null,
  relationship  text not null,
  phone10       text,
  token_hash    text not null unique,
  status        text not null default 'pending',
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_by   uuid references auth.users(id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint family_invites_relationship check (relationship in ('spouse', 'parent', 'child', 'sibling', 'other')),
  constraint family_invites_status check (status in ('pending', 'accepted', 'revoked')),
  constraint family_invites_name_len check (char_length(trim(full_name)) between 2 and 80),
  constraint family_invites_phone check (phone10 is null or phone10 ~ '^[6-9][0-9]{9}$')
);
create unique index if not exists family_invites_one_pending
  on public.family_invites (flat_id, phone10) where status = 'pending' and phone10 is not null;
create index if not exists idx_family_invites_flat on public.family_invites (flat_id, status);

create table if not exists public.household_access_requests (
  id              uuid primary key default gen_random_uuid(),
  society_id      uuid not null references public.societies(id) on delete cascade,
  flat_id         uuid not null references public.flats(id) on delete cascade,
  requester_id    uuid not null references auth.users(id) on delete cascade,
  full_name       text not null,
  relationship    text not null,
  resident_type   text not null default 'family_member',
  message         text,
  status          text not null default 'pending',
  decided_by      uuid references auth.users(id) on delete set null,
  decided_at      timestamptz,
  decision_reason text,
  membership_id   uuid references public.society_memberships(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint household_requests_relationship check (relationship in ('spouse', 'parent', 'child', 'sibling', 'other')),
  constraint household_requests_type check (resident_type in ('family_member', 'owner')),
  constraint household_requests_status check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint household_requests_name_len check (char_length(trim(full_name)) between 2 and 80),
  constraint household_requests_message_len check (message is null or char_length(message) <= 500),
  constraint household_requests_reason_len check (decision_reason is null or char_length(decision_reason) <= 500)
);
create unique index if not exists household_requests_one_pending
  on public.household_access_requests (society_id, requester_id) where status = 'pending';
create index if not exists idx_household_requests_flat on public.household_access_requests (flat_id, status);

alter table public.family_invites enable row level security;
alter table public.household_access_requests enable row level security;
revoke all on public.family_invites from anon, authenticated;
revoke all on public.household_access_requests from anon, authenticated;

drop trigger if exists guard_society_service on public.family_invites;
create trigger guard_society_service before insert or update or delete on public.family_invites
  for each row execute function public.guard_society_service_write();
drop trigger if exists guard_society_service on public.household_access_requests;
create trigger guard_society_service before insert or update or delete on public.household_access_requests
  for each row execute function public.guard_society_service_write();

-- ---------------------------------------------------------------------------
-- Family invites
-- ---------------------------------------------------------------------------
create or replace function app_private.token_hash(p_token text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
revoke all on function app_private.token_hash(text) from public, anon, authenticated;

create or replace function public.family_invite_create(
  p_society_id   uuid,
  p_full_name    text,
  p_relationship text,
  p_phone        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_mem   public.society_memberships;
  v_phone text := null;
  v_token text;
  v_row   public.family_invites;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_mem from public.society_memberships m
   where m.society_id = p_society_id and m.user_id = v_uid and m.status = 'active'
     and m.flat_id is not null and m.resident_type in ('owner', 'tenant')
   limit 1;
  if v_mem.id is null then raise exception 'NOT_ALLOWED'; end if;

  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if coalesce(p_relationship, '') not in ('spouse', 'parent', 'child', 'sibling', 'other') then
    raise exception 'INVALID_RELATIONSHIP';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is not null then
    v_phone := app_private.norm_mobile(p_phone);
    if v_phone is null then raise exception 'INVALID_PHONE'; end if;
    if v_phone = app_private.caller_phone10() then raise exception 'CANNOT_INVITE_SELF'; end if;
    if exists (select 1 from public.family_invites i
                where i.flat_id = v_mem.flat_id and i.phone10 = v_phone and i.status = 'pending'
                  and i.expires_at > now()) then
      raise exception 'INVITE_ALREADY_PENDING';
    end if;
    -- An expired invite must not hold the unique slot.
    update public.family_invites set status = 'revoked'
     where flat_id = v_mem.flat_id and phone10 = v_phone and status = 'pending' and expires_at <= now();
  end if;

  perform app_private.assert_rate('rpc:family_invite', v_uid::text, 20, 86400, 'INVITE_RATE_LIMITED');

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.family_invites
    (society_id, flat_id, membership_id, invited_by, full_name, relationship, phone10, token_hash)
  values (p_society_id, v_mem.flat_id, v_mem.id, v_uid, trim(p_full_name), p_relationship, v_phone,
          app_private.token_hash(v_token))
  returning * into v_row;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'family.invite_created', 'family_invites', v_row.id,
          jsonb_build_object('relationship', p_relationship));

  return jsonb_build_object('invite_id', v_row.id, 'token', v_token, 'expires_at', v_row.expires_at, 'sent', false);
end;
$$;
revoke all on function public.family_invite_create(uuid, text, text, text) from public, anon;
grant execute on function public.family_invite_create(uuid, text, text, text) to authenticated;

-- Invites for the caller's flat. Never returns a token.
create or replace function public.family_invite_list(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_flat uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select m.flat_id into v_flat from public.society_memberships m
   where m.society_id = p_society_id and m.user_id = v_uid and m.status = 'active' and m.flat_id is not null
   limit 1;
  if v_flat is null then raise exception 'NOT_ALLOWED'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'full_name', i.full_name, 'relationship', i.relationship, 'phone', i.phone10,
             'status', case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
             'expires_at', i.expires_at, 'accepted_at', i.accepted_at, 'created_at', i.created_at,
             'mine', i.invited_by = v_uid
           ) order by i.created_at desc), '[]'::jsonb)
      from public.family_invites i where i.flat_id = v_flat
  );
end;
$$;
revoke all on function public.family_invite_list(uuid) from public, anon;
grant execute on function public.family_invite_list(uuid) to authenticated;

create or replace function public.family_invite_revoke(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.family_invites;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.family_invites where id = p_invite_id for update;
  if v_row.id is null or not (v_row.invited_by = v_uid or app_private.is_society_manager(v_row.society_id)) then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if v_row.status <> 'pending' then raise exception 'INVITE_USED'; end if;
  update public.family_invites set status = 'revoked' where id = p_invite_id;
  return jsonb_build_object('invite_id', p_invite_id, 'status', 'revoked');
end;
$$;
revoke all on function public.family_invite_revoke(uuid) from public, anon;
grant execute on function public.family_invite_revoke(uuid) to authenticated;

-- Rate limited, and failures return {error} so the count commits. A valid token for
-- a different phone reveals nothing beyond the mismatch.
create or replace function app_private.check_invite(p_token text, p_lock boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_row public.family_invites;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_rate('rpc:family_token', v_uid::text, 20, 600, 'INVITE_RATE_LIMITED');

  select i.id into v_id from public.family_invites i where i.token_hash = app_private.token_hash(p_token);
  if v_id is null then return jsonb_build_object('error', 'INVITE_NOT_FOUND'); end if;
  if p_lock then
    select * into v_row from public.family_invites where id = v_id for update;
  else
    select * into v_row from public.family_invites where id = v_id;
  end if;

  if v_row.status = 'revoked' then return jsonb_build_object('error', 'INVITE_REVOKED'); end if;
  if v_row.status = 'accepted' then return jsonb_build_object('error', 'INVITE_USED'); end if;
  if v_row.expires_at <= now() then return jsonb_build_object('error', 'INVITE_EXPIRED'); end if;
  if v_row.phone10 is not null and v_row.phone10 is distinct from app_private.caller_phone10() then
    return jsonb_build_object('error', 'INVITE_PHONE_MISMATCH');
  end if;
  return jsonb_build_object('invite_id', v_row.id);
end;
$$;
revoke all on function app_private.check_invite(text, boolean) from public, anon, authenticated;

create or replace function public.family_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chk jsonb := app_private.check_invite(p_token, false);
  v_row public.family_invites;
begin
  if v_chk ? 'error' then return v_chk; end if;
  select * into v_row from public.family_invites where id = (v_chk ->> 'invite_id')::uuid;
  return jsonb_build_object(
    'society_name', (select s.name from public.societies s where s.id = v_row.society_id),
    'flat_label', app_private.flat_label(v_row.flat_id),
    'invited_by', (select app_private.mask_name(p.full_name) from public.profiles p where p.user_id = v_row.invited_by),
    'full_name', v_row.full_name,
    'relationship', v_row.relationship,
    'expires_at', v_row.expires_at);
end;
$$;
revoke all on function public.family_invite_preview(text) from public, anon;
grant execute on function public.family_invite_preview(text) to authenticated;

create or replace function public.family_invite_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_chk jsonb := app_private.check_invite(p_token, true);
  v_row public.family_invites;
  v_pri public.society_memberships;
  v_mem uuid;
begin
  if v_chk ? 'error' then return v_chk; end if;
  select * into v_row from public.family_invites where id = (v_chk ->> 'invite_id')::uuid;

  select * into v_pri from public.society_memberships m where m.id = v_row.membership_id;
  if v_pri.id is null or v_pri.status <> 'active' or v_pri.flat_id is distinct from v_row.flat_id then
    return jsonb_build_object('error', 'INVITER_INACTIVE');
  end if;
  if v_row.invited_by = v_uid then return jsonb_build_object('error', 'CANNOT_INVITE_SELF'); end if;

  v_mem := app_private.link_member_to_flat(v_row.society_id, v_uid, v_row.flat_id, v_pri.residency,
                                           'family_member', v_row.full_name);
  perform app_private.ensure_family_row(v_row.society_id, v_uid, v_row.flat_id, v_row.full_name,
                                        app_private.caller_phone10(), v_row.relationship, v_pri.id);

  update public.family_invites
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_row.id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'family.invite_accepted', 'family_invites', v_row.id,
          jsonb_build_object('flat_id', v_row.flat_id));

  return jsonb_build_object('society_id', v_row.society_id, 'flat_id', v_row.flat_id,
                            'membership_id', v_mem, 'refresh_required', true);
end;
$$;
revoke all on function public.family_invite_accept(text) from public, anon;
grant execute on function public.family_invite_accept(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Same-flat household
-- ---------------------------------------------------------------------------
-- Society by CODE, never by id: this caller belongs to no society yet. Failed codes
-- go through the shared ledger, so flats cannot be scanned across societies.
create or replace function public.household_lookup(
  p_code  text,
  p_wing  text,
  p_floor text,
  p_flat  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_res  jsonb;
  v_soc  uuid;
  v_flat public.flats;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_res := app_private.resolve_join_code(p_code);
  if v_res ? 'error' then return v_res; end if;
  v_soc := (v_res ->> 'society_id')::uuid;

  perform app_private.assert_rate('rpc:household_lookup', v_uid::text, 30, 3600, 'HOUSEHOLD_RATE_LIMITED');

  select f.* into v_flat
    from public.flats f
    join public.wings w on w.id = f.wing_id
    left join public.floors fl on fl.id = f.floor_id
   where f.society_id = v_soc
     and (lower(w.name) = lower(trim(coalesce(p_wing, ''))) or w.code = upper(trim(coalesce(p_wing, ''))))
     and lower(trim(f.number)) = lower(trim(coalesce(p_flat, '')))
     and (fl.id is null or nullif(trim(coalesce(p_floor, '')), '') is null
          or fl.number::text = trim(p_floor) or lower(coalesce(fl.name, '')) = lower(trim(p_floor)))
   limit 1;
  if v_flat.id is null then return jsonb_build_object('error', 'FLAT_NOT_FOUND'); end if;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select s.name from public.societies s where s.id = v_soc),
    'flat_id', v_flat.id,
    'flat_label', app_private.flat_label(v_flat.id),
    'member_count', (select count(*) from public.society_memberships m
                      where m.flat_id = v_flat.id and m.status = 'active'),
    'masked_members', (
      select coalesce(jsonb_agg(app_private.mask_name(p.full_name) order by m.joined_at), '[]'::jsonb)
        from public.society_memberships m
        join public.profiles p on p.user_id = m.user_id
       where m.flat_id = v_flat.id and m.status = 'active'),
    'already_on_flat', exists (select 1 from public.society_memberships m
                                where m.flat_id = v_flat.id and m.user_id = v_uid and m.status = 'active')
  );
end;
$$;
revoke all on function public.household_lookup(text, text, text, text) from public, anon;
grant execute on function public.household_lookup(text, text, text, text) to authenticated;

create or replace function public.household_request_access(
  p_code          text,
  p_flat_id       uuid,
  p_full_name     text,
  p_relationship  text,
  p_resident_type text default 'family_member',
  p_message       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_soc uuid;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_res := app_private.resolve_join_code(p_code);
  if v_res ? 'error' then return v_res; end if;
  v_soc := (v_res ->> 'society_id')::uuid;

  if not exists (select 1 from public.flats f where f.id = p_flat_id and f.society_id = v_soc) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if coalesce(p_relationship, '') not in ('spouse', 'parent', 'child', 'sibling', 'other') then
    raise exception 'INVALID_RELATIONSHIP';
  end if;
  if coalesce(p_resident_type, '') = 'tenant' then raise exception 'USE_TENANT_REGISTRATION'; end if;
  if coalesce(p_resident_type, '') not in ('family_member', 'owner') then raise exception 'INVALID_RESIDENT_TYPE'; end if;
  if char_length(coalesce(p_message, '')) > 500 then raise exception 'INVALID_MESSAGE'; end if;

  if exists (select 1 from public.society_memberships m
              where m.society_id = v_soc and m.user_id = v_uid and m.status = 'active' and m.flat_id = p_flat_id) then
    raise exception 'ALREADY_ON_FLAT';
  end if;
  if exists (select 1 from public.society_memberships m
              where m.society_id = v_soc and m.user_id = v_uid and m.status = 'active' and m.flat_id is not null) then
    raise exception 'ALREADY_MEMBER_OTHER_FLAT';
  end if;
  if exists (select 1 from public.society_memberships m
              where m.society_id = v_soc and m.user_id = v_uid and m.status = 'deleted')
     and not exists (select 1 from public.society_authorities a
                      where a.society_id = v_soc and a.user_id = v_uid) then
    raise exception 'MEMBERSHIP_REMOVED';
  end if;
  if exists (select 1 from public.household_access_requests r
              where r.society_id = v_soc and r.requester_id = v_uid and r.status = 'pending') then
    raise exception 'HOUSEHOLD_REQUEST_EXISTS';
  end if;

  perform app_private.assert_rate('rpc:household_request', v_uid::text, 5, 3600, 'HOUSEHOLD_RATE_LIMITED');

  insert into public.household_access_requests
    (society_id, flat_id, requester_id, full_name, relationship, resident_type, message)
  values (v_soc, p_flat_id, v_uid, trim(p_full_name), p_relationship, p_resident_type,
          nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'household.requested', 'household_access_requests', v_id,
          jsonb_build_object('flat_id', p_flat_id));

  return jsonb_build_object('request_id', v_id, 'status', 'pending', 'society_id', v_soc, 'flat_id', p_flat_id);
end;
$$;
revoke all on function public.household_request_access(text, uuid, text, text, text, text) from public, anon;
grant execute on function public.household_request_access(text, uuid, text, text, text, text) to authenticated;

create or replace function public.household_my_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'society_id', r.society_id, 'society_name', s.name, 'flat_id', r.flat_id,
             'flat_label', app_private.flat_label(r.flat_id), 'relationship', r.relationship,
             'resident_type', r.resident_type, 'status', r.status, 'decision_reason', r.decision_reason,
             'decided_at', r.decided_at, 'created_at', r.created_at
           ) order by r.created_at desc), '[]'::jsonb)
      from public.household_access_requests r
      join public.societies s on s.id = r.society_id
     where r.requester_id = v_uid
  );
end;
$$;
revoke all on function public.household_my_requests() from public, anon;
grant execute on function public.household_my_requests() to authenticated;

create or replace function public.household_cancel_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.household_access_requests
     set status = 'cancelled'
   where id = p_request_id and requester_id = v_uid and status = 'pending';
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  return jsonb_build_object('request_id', p_request_id, 'status', 'cancelled');
end;
$$;
revoke all on function public.household_cancel_request(uuid) from public, anon;
grant execute on function public.household_cancel_request(uuid) to authenticated;

-- An owner decides anything on their flat. A tenant decides family requests on
-- theirs. A family member decides nothing. Managers decide anything in the society.
create or replace function app_private.can_decide_household(r public.household_access_requests, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.is_society_manager(r.society_id)
      or exists (select 1 from public.society_memberships m
                  where m.flat_id = r.flat_id and m.user_id = p_user and m.status = 'active'
                    and (m.resident_type = 'owner'
                         or (m.resident_type = 'tenant' and r.resident_type = 'family_member')))
$$;
revoke all on function app_private.can_decide_household(public.household_access_requests, uuid)
  from public, anon, authenticated;

-- Requests the caller can decide. The approver gets the requester's typed name and
-- the last 4 digits of their verified phone, which is enough to recognise someone.
create or replace function public.household_pending_for_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'society_id', r.society_id, 'flat_id', r.flat_id,
             'flat_label', app_private.flat_label(r.flat_id), 'full_name', r.full_name,
             'relationship', r.relationship, 'resident_type', r.resident_type, 'message', r.message,
             'phone_last4', right(coalesce(u.phone, ''), 4), 'created_at', r.created_at
           ) order by r.created_at), '[]'::jsonb)
      from public.household_access_requests r
      left join auth.users u on u.id = r.requester_id
     where r.status = 'pending' and r.requester_id <> v_uid
       and app_private.can_decide_household(r, v_uid)
  );
end;
$$;
revoke all on function public.household_pending_for_me() from public, anon;
grant execute on function public.household_pending_for_me() to authenticated;

create or replace function public.household_decide_request(
  p_request_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.household_access_requests;
  v_reason    text := nullif(trim(coalesce(p_reason, '')), '');
  v_mem       uuid;
  v_residency public.residency_kind;
  v_phone     text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_approve is null then raise exception 'INVALID_DECISION'; end if;
  select * into v_row from public.household_access_requests where id = p_request_id for update;
  if v_row.id is null or not app_private.can_decide_household(v_row, v_uid) then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_row.requester_id = v_uid then raise exception 'CANNOT_DECIDE_OWN_REQUEST'; end if;
  if v_row.status <> 'pending' then raise exception 'REQUEST_CLOSED'; end if;

  if not p_approve then
    if char_length(coalesce(v_reason, '')) not between 3 and 500 then raise exception 'INVALID_REASON'; end if;
    update public.household_access_requests
       set status = 'rejected', decided_by = v_uid, decided_at = now(), decision_reason = v_reason
     where id = p_request_id;
  else
    v_residency := case when v_row.resident_type = 'owner' then 'owner'::public.residency_kind
      else coalesce((select m.residency from public.society_memberships m
                      where m.flat_id = v_row.flat_id and m.status = 'active'
                        and m.resident_type in ('owner', 'tenant')
                      order by (m.resident_type = 'owner') desc limit 1), 'owner'::public.residency_kind)
    end;
    select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) into v_phone
      from auth.users u where u.id = v_row.requester_id;

    v_mem := app_private.link_member_to_flat(v_row.society_id, v_row.requester_id, v_row.flat_id, v_residency,
                                             v_row.resident_type, v_row.full_name);
    if v_row.resident_type = 'owner' then
      perform app_private.ensure_owner_row(v_row.society_id, v_row.flat_id, v_row.requester_id, v_row.full_name, v_phone);
    else
      perform app_private.ensure_family_row(v_row.society_id, v_row.requester_id, v_row.flat_id, v_row.full_name,
                                            v_phone, v_row.relationship);
    end if;

    update public.household_access_requests
       set status = 'approved', decided_by = v_uid, decided_at = now(),
           decision_reason = v_reason, membership_id = v_mem
     where id = p_request_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_uid, 'household.decided', 'household_access_requests', p_request_id,
          jsonb_build_object('approved', p_approve, 'flat_id', v_row.flat_id));

  return jsonb_build_object('request_id', p_request_id, 'status', case when p_approve then 'approved' else 'rejected' end,
                            'membership_id', v_mem);
end;
$$;
revoke all on function public.household_decide_request(uuid, boolean, text) from public, anon;
grant execute on function public.household_decide_request(uuid, boolean, text) to authenticated;
