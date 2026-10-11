-- ============================================================================
-- Migration 054: tenant lockdown (CODE-REVIEW.md C1, C4, HIGH 4/5/6/8/10/11,
-- MEDIUM society switcher, LOW policy perf).
-- ----------------------------------------------------------------------------
-- What this closes, in order of the sections below:
--
--   §0  Private helpers: live-role checks (society_memberships, not the JWT),
--       attachment-key validation, authority revocation, a failed-code ledger,
--       and the single "active society" resolver used by the Auth Hook.
--   §1  C1: the FOR ALL / UPDATE tenant policies let any member write
--       societies, society_codes, wings, flats, society_memberships,
--       family_members and amenities (self-promote to secretary, block the
--       society, graft onto any flat). Those tables are now SELECT-only for
--       clients; every write goes through a SECURITY DEFINER RPC.
--   §2  HIGH 6: profiles.phone / pin_set / signup_intent are no longer
--       client-writable (column grants). Profile creation goes through
--       upsert_my_profile(), which takes the phone from auth.users.
--       MEDIUM: profiles.active_society_id + set_active_society() +
--       my_active_society() (society switcher, single source of truth).
--   §3  RPCs replacing every legitimate direct write found in apps/ and
--       packages/ (see contract-054.md for the call sites).
--   §4  HIGH: claim_family_membership requires an ACTIVE primary membership in
--       the SAME society.
--   §5  C4: service-only functions and notification_preferences_effective are
--       no longer reachable by anon / authenticated.
--   §6  HIGH 4: authority re-escalation. Removing, demoting or transferring a
--       secretary deletes the matching society_authorities row, so
--       claim_society_authority / onboard_resident can no longer re-grant
--       'secretary'. onboard_resident no longer revives a 'deleted'
--       membership and rate-limits failed code attempts.
--   §7  HIGH 5: privileged RPCs re-check the caller's role in
--       society_memberships (not just the JWT, which lives up to an hour).
--   §8  HIGH 8: legacy self-serve RPCs (create_society_with_secretary,
--       redeem_society_code, finalize_society_setup, claim_chairman,
--       validate_society_code, list_society_structure) are revoked;
--       generate_society_code uses gen_random_bytes.
--   §9  HIGH 10: no direct complaints / attachments INSERT; attachment rows and
--       storage objects are readable only by people who can see the owning
--       complaint / flat action / notice / post; storage writes are limited to
--       the expected path shapes.
--   §10 Auth Hook prefers profiles.active_society_id.
--   §11 society_guards: secretaries can read, not write (user_id was settable).
--
-- Bodies redefined with CREATE OR REPLACE are copied from their LATEST
-- definition (named in each section) with only the marked changes.
-- Idempotent where practical (drop … if exists, create or replace).
-- JavaScript project — SQL only.
-- ============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ============================================================================
-- §0  Private helpers
-- ============================================================================

-- Safe text -> uuid (NULL instead of an exception). Used by storage policies.
create or replace function public.parisar_try_uuid(p text)
returns uuid
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end
$$;
revoke all on function public.parisar_try_uuid(text) from public, anon;
grant execute on function public.parisar_try_uuid(text) to authenticated, service_role;

-- Does the caller hold one of p_roles in an ACTIVE membership of p_society,
-- right now (not as of their last token)?
create or replace function app_private.has_live_role(p_society uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and p_society is not null
     and exists (
       select 1
       from public.society_memberships m
       where m.user_id    = auth.uid()
         and m.society_id = p_society
         and m.status     = 'active'
         and m.role::text = any (p_roles)
     );
$$;
revoke all on function app_private.has_live_role(uuid, text[]) from public, anon, authenticated;

-- Raise p_error unless has_live_role(). The error text defaults to the code the
-- calling RPC already used, so client error mapping keeps working.
create or replace function app_private.assert_live_role(
  p_society uuid,
  p_roles   text[],
  p_error   text default 'INSUFFICIENT_ROLE'
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not app_private.has_live_role(p_society, p_roles) then
    raise exception '%', coalesce(p_error, 'INSUFFICIENT_ROLE');
  end if;
end;
$$;
revoke all on function app_private.assert_live_role(uuid, text[], text) from public, anon, authenticated;

-- An uploaded file key must be exactly {society}/{kind}/{owner_id}/{file}.
-- Mirrors create_post's OQ2 guard (009:556-559) for complaints, notices and
-- flat actions, so an RPC can never attach another society's / record's file.
create or replace function app_private.assert_attachment_key(
  p_key        text,
  p_society    uuid,
  p_kind       text,
  p_owner_id   uuid,
  p_byte_size  int default null
)
returns void
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_parts text[];
begin
  if p_key is null then return; end if;
  v_parts := string_to_array(p_key, '/');
  -- coalesce(…, true): any NULL comparison (e.g. an empty key) counts as invalid.
  if coalesce(
       p_society is null or p_owner_id is null
       or coalesce(array_length(v_parts, 1), 0) <> 4
       or v_parts[1] <> p_society::text
       or v_parts[2] <> p_kind
       or v_parts[3] <> p_owner_id::text
       or v_parts[4] !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
       or position('..' in p_key) > 0,
       true) then
    raise exception 'INVALID_ATTACHMENT_KEY';
  end if;
  if p_byte_size is not null and (p_byte_size < 0 or p_byte_size > 52428800) then
    raise exception 'INVALID_ATTACHMENT_SIZE';
  end if;
end;
$$;
revoke all on function app_private.assert_attachment_key(text, uuid, text, uuid, int) from public, anon, authenticated;

-- Delete the society_authorities row(s) that would re-grant 'secretary' to
-- p_user in p_society (matched by linked user_id, or by their auth phone while
-- unlinked). Audited. Returns how many rows were removed.
create or replace function app_private.revoke_society_authority(
  p_society uuid,
  p_user    uuid,
  p_actor   uuid,
  p_reason  text
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_count int := 0;
begin
  if p_society is null or p_user is null then return 0; end if;

  select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
    into v_phone
    from auth.users u where u.id = p_user;

  with d as (
    delete from public.society_authorities a
     where a.society_id = p_society
       and (a.user_id = p_user
            or (a.user_id is null and coalesce(v_phone, '') <> '' and a.phone = v_phone))
    returning a.id, a.phone
  ), logged as (
    insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
    select p_society, p_actor, 'authority.revoked', 'society_authorities', d.id,
           jsonb_build_object('user_id', p_user, 'phone', d.phone, 'reason', p_reason)
      from d
    returning 1
  )
  select count(*) into v_count from logged;

  return v_count;
end;
$$;
revoke all on function app_private.revoke_society_authority(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Failed society-code attempts, per user (HIGH 7: codes were guessable without
-- any throttle). Written only by the SECURITY DEFINER code RPCs.
create table if not exists app_private.code_attempt_failures (
  id           bigserial primary key,
  user_id      uuid not null,
  reason       text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists code_attempt_failures_user_time_idx
  on app_private.code_attempt_failures (user_id, attempted_at desc);
revoke all on app_private.code_attempt_failures from public, anon, authenticated;

create or replace function app_private.assert_code_attempts_ok(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- 5 failures inside 15 minutes -> every further attempt is refused until the
  -- oldest one ages out of the window.
  if (select count(*)
        from app_private.code_attempt_failures f
       where f.user_id = p_user
         and f.attempted_at > now() - interval '15 minutes') >= 5 then
    raise exception 'TOO_MANY_CODE_ATTEMPTS';
  end if;
end;
$$;
revoke all on function app_private.assert_code_attempts_ok(uuid) from public, anon, authenticated;

create or replace function app_private.record_code_failure(p_user uuid, p_reason text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into app_private.code_attempt_failures (user_id, reason) values (p_user, p_reason);
$$;
revoke all on function app_private.record_code_failure(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- §1  C1 — tenant tables become SELECT-only for clients
-- ============================================================================

-- societies (003:24-34)
drop policy if exists "tenant_insert_societies" on public.societies;
drop policy if exists "tenant_update_societies" on public.societies;
drop policy if exists "tenant_select_societies" on public.societies;
create policy "tenant_select_societies"
  on public.societies for select to authenticated
  using (id = (select public.current_society_id()));

-- society_codes (003:37-40)
drop policy if exists "tenant_all_society_codes" on public.society_codes;
drop policy if exists "tenant_select_society_codes" on public.society_codes;
create policy "tenant_select_society_codes"
  on public.society_codes for select to authenticated
  using (society_id = (select public.current_society_id()));

-- wings (003:43-46)
drop policy if exists "tenant_all_wings" on public.wings;
drop policy if exists "tenant_select_wings" on public.wings;
create policy "tenant_select_wings"
  on public.wings for select to authenticated
  using (society_id = (select public.current_society_id()));

-- flats (003:49-52)
drop policy if exists "tenant_all_flats" on public.flats;
drop policy if exists "tenant_select_flats" on public.flats;
create policy "tenant_select_flats"
  on public.flats for select to authenticated
  using (society_id = (select public.current_society_id()));

-- society_memberships (003:84-87). self_read_membership (041) stays.
drop policy if exists "tenant_all_memberships" on public.society_memberships;
drop policy if exists "tenant_select_memberships" on public.society_memberships;
create policy "tenant_select_memberships"
  on public.society_memberships for select to authenticated
  using (society_id = (select public.current_society_id()));

-- family_members (003:90-93)
drop policy if exists "tenant_all_family_members" on public.family_members;
drop policy if exists "tenant_select_family_members" on public.family_members;
create policy "tenant_select_family_members"
  on public.family_members for select to authenticated
  using (society_id = (select public.current_society_id()));

-- amenities (006:76-79)
drop policy if exists "tenant_all_amenities" on public.amenities;
drop policy if exists "tenant_select_amenities" on public.amenities;
create policy "tenant_select_amenities"
  on public.amenities for select to authenticated
  using (society_id = (select public.current_society_id()));

-- Defence in depth: no write privilege at all, whatever a future policy says.
-- (service_role and SECURITY DEFINER functions are unaffected.)
revoke insert, update, delete, truncate on public.societies           from anon, authenticated;
revoke insert, update, delete, truncate on public.society_codes       from anon, authenticated;
revoke insert, update, delete, truncate on public.wings               from anon, authenticated;
revoke insert, update, delete, truncate on public.flats               from anon, authenticated;
revoke insert, update, delete, truncate on public.society_memberships from anon, authenticated;
revoke insert, update, delete, truncate on public.family_members      from anon, authenticated;
revoke insert, update, delete, truncate on public.amenities           from anon, authenticated;

-- ============================================================================
-- §2  profiles — column-level write grants, active society
-- ============================================================================

alter table public.profiles
  add column if not exists active_society_id uuid references public.societies(id) on delete set null;

comment on column public.profiles.active_society_id is
  'Society the user last chose in the society switcher (set_active_society). The Auth Hook prefers it when the user still has an active membership there. Not client-writable or client-readable; use my_active_society().';

-- Only full_name stays client-writable (MyProfileCard, profile.jsx, StructureSetup,
-- structure.jsx, ProfileForm). phone / pin_set / signup_intent / active_society_id
-- are written by SECURITY DEFINER functions only.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "self_insert_profile" on public.profiles;  -- no INSERT grant any more

-- Create / update the caller's own profile. The phone ALWAYS comes from the
-- OTP-verified auth.users row, so nobody can pre-claim someone else's number.
create or replace function public.upsert_my_profile(
  p_full_name     text,
  p_signup_intent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := nullif(trim(coalesce(p_full_name, '')), '');
  v_phone text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_name is null or char_length(v_name) not between 2 and 80 then
    raise exception 'INVALID_NAME';
  end if;
  if p_signup_intent is not null and p_signup_intent not in ('secretary', 'member') then
    raise exception 'INVALID_SIGNUP_INTENT';
  end if;

  select '+' || u.phone into v_phone
    from auth.users u
   where u.id = v_uid and coalesce(u.phone, '') <> '';
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  begin
    insert into public.profiles (user_id, full_name, phone, signup_intent)
    values (v_uid, v_name, v_phone, p_signup_intent)
    on conflict (user_id) do update
      set full_name     = excluded.full_name,
          signup_intent = coalesce(excluded.signup_intent, public.profiles.signup_intent);
  exception when unique_violation then
    raise exception 'PHONE_IN_USE';
  end;

  return jsonb_build_object('user_id', v_uid, 'full_name', v_name);
end;
$$;
revoke all on function public.upsert_my_profile(text, text) from public, anon;
grant execute on function public.upsert_my_profile(text, text) to authenticated;

-- The one rule for "which society is this user in right now": the society chosen
-- in the switcher if they still have an active membership there, otherwise the
-- newest active membership (the pre-054 rule). Used by the Auth Hook and by
-- my_active_society(), so the JWT and the UI can never disagree.
create or replace function app_private.resolve_active_membership(p_user uuid)
returns table (society_id uuid, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.society_id, m.role::text
  from public.society_memberships m
  left join public.profiles p on p.user_id = m.user_id
  where m.user_id = p_user
    and m.status  = 'active'
  order by (m.society_id = p.active_society_id) desc nulls last,
           m.joined_at desc
  limit 1;
$$;
revoke all on function app_private.resolve_active_membership(uuid) from public, anon, authenticated;

create or replace function public.my_active_society()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_tok_soc  uuid;
  v_tok_role text;
  v_mem record;
  v_name text;
  v_service text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  v_tok_soc  := nullif(v_claims -> 'app_metadata' ->> 'society_id', '')::uuid;
  v_tok_role := v_claims -> 'app_metadata' ->> 'role';

  select r.society_id, r.role into v_mem
    from app_private.resolve_active_membership(v_uid) r;

  if v_mem.society_id is not null then
    select s.name, s.service_status into v_name, v_service
      from public.societies s where s.id = v_mem.society_id;
  end if;

  return jsonb_build_object(
    'society_id',     v_mem.society_id,
    'role',           v_mem.role,
    'society_name',   v_name,
    'service_status', v_service,
    -- true when the caller's access token predates a switch / role change:
    -- the client should call auth.refreshSession().
    'token_stale',    (v_tok_soc is distinct from v_mem.society_id)
                      or (v_tok_role is distinct from v_mem.role)
  );
end;
$$;
revoke all on function public.my_active_society() from public, anon;
grant execute on function public.my_active_society() to authenticated;

create or replace function public.set_active_society(p_society_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_society_id is null or not exists (
    select 1 from public.society_memberships m
     where m.user_id = v_uid and m.society_id = p_society_id and m.status = 'active'
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  update public.profiles set active_society_id = p_society_id where user_id = v_uid;
  if not found then raise exception 'NO_PROFILE'; end if;

  -- Caller must refreshSession() so the Auth Hook re-issues society_id/role.
  return public.my_active_society() || jsonb_build_object('refresh_required', true);
end;
$$;
revoke all on function public.set_active_society(uuid) from public, anon;
grant execute on function public.set_active_society(uuid) to authenticated;

-- ============================================================================
-- §3  RPCs that replace the direct client writes
-- ============================================================================

-- 3a. Own emergency contact (MyProfileCard.jsx / profile.jsx updated
--     society_memberships.emergency_contact directly).
create or replace function public.update_my_emergency_contact(
  p_membership_id     uuid,
  p_emergency_contact text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_val text := nullif(trim(coalesce(p_emergency_contact, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_val is not null and (char_length(v_val) > 40 or v_val !~ '^[0-9+() -]+$') then
    raise exception 'INVALID_CONTACT';
  end if;

  update public.society_memberships
     set emergency_contact = v_val
   where id = p_membership_id
     and user_id = v_uid
     and status in ('active', 'pending_review');
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.update_my_emergency_contact(uuid, text) from public, anon;
grant execute on function public.update_my_emergency_contact(uuid, text) to authenticated;

-- 3b. Pre-register family members on the caller's OWN membership (join
--     ProfileForm.jsx inserted family_members directly with any membership_id).
--     p_members: [{ name, phone?, relation?, is_resident? }, ...] (max 10).
--     Same phone handling as onboard_resident. claim_family_membership only
--     honours rows whose primary membership is active (§4).
create or replace function public.add_family_members(
  p_membership_id uuid,
  p_members       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_mem       public.society_memberships;
  v_item      jsonb;
  v_name      text;
  v_phone     text;
  v_own_phone text;
  v_added     int := 0;
  v_skipped   int := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' then raise exception 'INVALID_MEMBERS'; end if;
  if jsonb_array_length(p_members) > 10 then raise exception 'TOO_MANY_MEMBERS'; end if;

  select * into v_mem
    from public.society_memberships
   where id = p_membership_id
     and user_id = v_uid
     and status in ('active', 'pending_review');
  if v_mem.id is null then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
    into v_own_phone from auth.users u where u.id = v_uid;

  for v_item in select * from jsonb_array_elements(p_members) loop
    v_name := nullif(trim(coalesce(v_item->>'name', v_item->>'full_name', '')), '');
    if v_name is null or char_length(v_name) not between 2 and 80 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_phone := nullif(regexp_replace(coalesce(v_item->>'phone', ''), '\D', '', 'g'), '');
    if v_phone is not null then
      v_phone := right(v_phone, 10);
      if v_phone !~ '^[6-9][0-9]{9}$' or v_phone = v_own_phone then
        v_phone := null;
      else
        v_phone := '+91' || v_phone;
        if exists (select 1 from public.family_members
                    where society_id = v_mem.society_id and phone = v_phone
                      and claimed_user_id is null) then
          v_phone := null;  -- already pending elsewhere; keep the name only
        end if;
      end if;
    end if;

    insert into public.family_members (society_id, membership_id, full_name, phone, relation, is_resident)
    values (v_mem.society_id, v_mem.id, v_name, v_phone,
            nullif(trim(coalesce(v_item->>'relation', '')), ''),
            coalesce((v_item->>'is_resident')::boolean, true));
    v_added := v_added + 1;
  end loop;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_mem.society_id, v_uid, 'family.added', 'society_memberships', v_mem.id,
          jsonb_build_object('added', v_added, 'skipped', v_skipped));

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$$;
revoke all on function public.add_family_members(uuid, jsonb) from public, anon;
grant execute on function public.add_family_members(uuid, jsonb) to authenticated;

-- 3c. Review queue: approve one claimant and reject the other pending claimants
--     of the same flat in ONE transaction (review-queue.jsx / page.jsx did an
--     UPDATE then a loop of remove_member, which could leave the flat empty).
--     Rejected claimants get status 'rejected' (not 'deleted'), so they can
--     re-apply; they are not DPDP-erased.
create or replace function public.approve_pending_membership(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_mem      public.society_memberships;
  v_rejected uuid[];
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_mem from public.society_memberships where id = p_membership_id for update;
  if v_mem.id is null then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  perform app_private.assert_live_role(v_mem.society_id, array['secretary', 'co_secretary'],
                                       'INSUFFICIENT_PRIVILEGES');

  if v_mem.status <> 'pending_review' then raise exception 'NOT_PENDING'; end if;

  with r as (
    update public.society_memberships
       set status = 'rejected'
     where society_id = v_mem.society_id
       and flat_id    = v_mem.flat_id
       and status     = 'pending_review'
       and id        <> v_mem.id
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_rejected from r;

  delete from public.family_members where membership_id = any (v_rejected);

  update public.society_memberships set status = 'active' where id = v_mem.id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_mem.society_id, v_uid, 'member.approved', 'society_memberships', v_mem.id,
          jsonb_build_object('flat_id', v_mem.flat_id, 'rejected', to_jsonb(v_rejected)));

  return jsonb_build_object('approved', v_mem.id, 'rejected', to_jsonb(v_rejected));
end;
$$;
revoke all on function public.approve_pending_membership(uuid) from public, anon;
grant execute on function public.approve_pending_membership(uuid) to authenticated;

-- 3d. Review queue: reject one pending claimant (the "remove both" button used
--     remove_member, which also DPDP-redacts the person's profile).
create or replace function public.reject_pending_membership(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_mem public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_mem from public.society_memberships where id = p_membership_id for update;
  if v_mem.id is null then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  perform app_private.assert_live_role(v_mem.society_id, array['secretary', 'co_secretary'],
                                       'INSUFFICIENT_PRIVILEGES');

  if v_mem.status <> 'pending_review' then raise exception 'NOT_PENDING'; end if;

  update public.society_memberships set status = 'rejected' where id = v_mem.id;
  delete from public.family_members where membership_id = v_mem.id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_mem.society_id, v_uid, 'member.rejected', 'society_memberships', v_mem.id,
          jsonb_build_object('flat_id', v_mem.flat_id));

  return jsonb_build_object('rejected', v_mem.id);
end;
$$;
revoke all on function public.reject_pending_membership(uuid) from public, anon;
grant execute on function public.reject_pending_membership(uuid) to authenticated;

-- 3e. Setup board step (BoardForm.jsx inserted society_memberships directly,
--     without residency/household, as any role). Chairman-only, board_member
--     only, like set_membership_role. The user is found by their VERIFIED auth
--     phone, not the client-writable profiles.phone.
--     Returns { status: 'added'|'promoted'|'already_board'|'not_registered', membership_id }.
create or replace function public.secretary_add_board_member(
  p_society_id uuid,
  p_phone      text,
  p_flat_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_phone  text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_target uuid;
  v_mem    public.society_memberships;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_live_role(p_society_id, array['secretary'], 'ONLY_SECRETARY_CAN_SET_ROLE');
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if p_flat_id is null or not exists (
    select 1 from public.flats where id = p_flat_id and society_id = p_society_id
  ) then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;

  select u.id into v_target
    from auth.users u
   where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = v_phone
   limit 1;
  if v_target is null then
    return jsonb_build_object('status', 'not_registered', 'membership_id', null);
  end if;
  if v_target = v_uid then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;

  -- Already active somewhere in this society: promote that membership in place.
  select * into v_mem
    from public.society_memberships
   where society_id = p_society_id and user_id = v_target and status = 'active'
   order by joined_at desc
   limit 1;
  if v_mem.id is not null then
    if v_mem.role <> 'member' then
      return jsonb_build_object('status', 'already_board', 'membership_id', v_mem.id);
    end if;
    update public.society_memberships set role = 'board_member' where id = v_mem.id;
    v_id := v_mem.id;
  else
    insert into public.society_memberships
      (society_id, user_id, flat_id, role, residency, household, status)
    values (p_society_id, v_target, p_flat_id, 'board_member', 'owner', 'family', 'active')
    on conflict (society_id, user_id, flat_id) do update
      set role = 'board_member', status = 'active'
    returning id into v_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'role.changed', 'society_memberships', v_id,
          jsonb_build_object('target_user_id', v_target, 'to', 'board_member', 'via', 'setup_board'));

  return jsonb_build_object(
    'status', case when v_mem.id is not null then 'promoted' else 'added' end,
    'membership_id', v_id);
end;
$$;
revoke all on function public.secretary_add_board_member(uuid, text, uuid) from public, anon;
grant execute on function public.secretary_add_board_member(uuid, text, uuid) to authenticated;

-- 3f. Setup amenities step (AmenitiesForm.jsx inserted amenities directly).
--     Idempotent on (society_id, lower(name)): a double-submit or a retry adds
--     nothing. p_amenities: [{ name, is_custom? }, ...] (max 50).
create or replace function public.secretary_add_setup_amenities(
  p_society_id uuid,
  p_amenities  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_item     jsonb;
  v_name     text;
  v_inserted int := 0;
  v_skipped  int := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_live_role(p_society_id, array['secretary', 'co_secretary'], 'NOT_SECRETARY');
  if p_amenities is null or jsonb_typeof(p_amenities) <> 'array' then raise exception 'INVALID_AMENITIES'; end if;
  if jsonb_array_length(p_amenities) > 50 then raise exception 'TOO_MANY_AMENITIES'; end if;

  -- Serialise concurrent submits for the same society so the NOT EXISTS check holds.
  perform pg_advisory_xact_lock(hashtextextended('amenities:' || p_society_id::text, 0));

  for v_item in select * from jsonb_array_elements(p_amenities) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    if v_name is null or char_length(v_name) > 80 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if exists (select 1 from public.amenities
                where society_id = p_society_id and lower(name) = lower(v_name)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.amenities (society_id, name, is_custom)
    values (p_society_id, v_name, coalesce((v_item->>'is_custom')::boolean, false));
    v_inserted := v_inserted + 1;
  end loop;

  if v_inserted > 0 then
    insert into public.audit_log (society_id, actor_id, action, target_table, payload)
    values (p_society_id, v_uid, 'amenities.setup', 'amenities',
            jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped));
  end if;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;
revoke all on function public.secretary_add_setup_amenities(uuid, jsonb) from public, anon;
grant execute on function public.secretary_add_setup_amenities(uuid, jsonb) to authenticated;

-- ============================================================================
-- §4  claim_family_membership — latest def 20260721000028. Changes marked (054).
-- ============================================================================
create or replace function public.claim_family_membership()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_phone   text;
  v_fam     public.family_members;
  v_primary public.society_memberships;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select '+' || phone into v_phone from auth.users where id = v_uid;
  if v_phone is null then raise exception 'NO_PHONE'; end if;

  select sf.* into v_fam
  from public.family_members sf
  where sf.claimed_user_id = v_uid
  limit 1;
  if v_fam.id is not null then
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  -- (054) phone10 is the indexed generated column added by migration 055
  -- (right(digits(phone),10)); plpgsql resolves it at call time, after 055.
  select * into v_fam from public.family_members
   where claimed_user_id is null
     and phone10 = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
   order by id
   limit 1;
  if v_fam.id is null then raise exception 'NOT_A_FAMILY_MEMBER'; end if;

  if exists (select 1 from public.society_memberships
              where user_id = v_uid and society_id = v_fam.society_id) then
    update public.family_members set claimed_user_id = v_uid where id = v_fam.id;
    return jsonb_build_object('society_id', v_fam.society_id, 'already_member', true);
  end if;

  select * into v_primary from public.society_memberships where id = v_fam.membership_id;
  -- (054) the primary membership must exist, be in the SAME society as the
  -- family row, be ACTIVE and have a flat. Previously a row pointing at any
  -- membership (another society, a removed or pending member) was honoured.
  if v_primary.id is null or v_primary.society_id is distinct from v_fam.society_id then
    raise exception 'PRIMARY_MEMBERSHIP_GONE';
  end if;
  if v_primary.status <> 'active' then raise exception 'PRIMARY_NOT_ACTIVE'; end if;
  if v_primary.flat_id is null then raise exception 'PRIMARY_HAS_NO_FLAT'; end if;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, coalesce(v_fam.full_name, 'Family member'), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  insert into public.society_memberships
    (society_id, user_id, flat_id, role, residency, household, status, joined_at)
  values (v_fam.society_id, v_uid, v_primary.flat_id, 'member',
          v_primary.residency, v_primary.household, 'active', now());

  update public.family_members set claimed_user_id = v_uid where id = v_fam.id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_fam.society_id, v_uid, 'family.claimed', 'family_members', v_fam.id,
          jsonb_build_object('flat_id', v_primary.flat_id, 'relation', v_fam.relation));

  return jsonb_build_object('society_id', v_fam.society_id, 'already_member', false);
end;
$$;
revoke all on function public.claim_family_membership() from public, anon;
grant execute on function public.claim_family_membership() to authenticated;

-- ============================================================================
-- §5  C4 — service-only functions and the preferences view
-- ============================================================================

-- Push recipient helpers (008:768-823, 009:968-1025) returned every member's
-- Expo token to anyone, because EXECUTE was never revoked from PUBLIC.
revoke all on function public.eligible_push_recipients(uuid) from public, anon, authenticated;
grant execute on function public.eligible_push_recipients(uuid) to service_role;
revoke all on function public.flat_action_recipients(uuid) from public, anon, authenticated;
grant execute on function public.flat_action_recipients(uuid) to service_role;

-- Trigger-only / internal definer functions: nothing outside the database calls
-- these. (Trigger EXECUTE is checked at CREATE TRIGGER time, not at fire time.)
revoke all on function public.sync_last_paid() from public, anon, authenticated;
revoke all on function public.guard_society_service_write() from public, anon, authenticated;
revoke all on function app_private.functions_base_url() from public, anon, authenticated;
revoke all on function public.generate_society_code() from public, anon, authenticated;
revoke all on function public._add_society_authority(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public._feature_enabled(uuid, text) from public, anon, authenticated;
revoke all on function public.inject_society_claims(jsonb) from public, anon, authenticated;

-- The view returned every (user_id, society_id) pair on the platform (owner
-- rights). Fan-out reads it from SECURITY DEFINER functions, which keep working.
alter view public.notification_preferences_effective set (security_invoker = true);
revoke all on public.notification_preferences_effective from public, anon, authenticated;
grant select on public.notification_preferences_effective to service_role;

-- ============================================================================
-- §6  Authority re-escalation + onboarding
-- ============================================================================

-- One-time cleanup: authority rows of people who were already demoted or removed
-- before this migration (linked user exists in the society but is no longer an
-- active secretary there). Without this, claim_society_authority would still
-- hand them 'secretary' again.
with stale as (
  delete from public.society_authorities a
   where a.user_id is not null
     and exists (select 1 from public.society_memberships m2
                  where m2.society_id = a.society_id and m2.user_id = a.user_id)
     and not exists (select 1 from public.society_memberships m
                      where m.society_id = a.society_id and m.user_id = a.user_id
                        and m.status = 'active' and m.role = 'secretary')
  returning a.id, a.society_id, a.user_id, a.phone
)
insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
select s.society_id, null, 'authority.revoked', 'society_authorities', s.id,
       jsonb_build_object('user_id', s.user_id, 'phone', s.phone, 'reason', 'migration_054_stale')
  from stale s;

-- onboard_flats_for_code — latest def 20261008000052. (054): VOLATILE (it now
-- writes the failure ledger), throttled, failures recorded.
CREATE OR REPLACE FUNCTION public.onboard_flats_for_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare v_soc uuid; v_row public.society_codes; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_code_attempts_ok(v_uid);                       -- (054)

  select * into v_row from public.society_codes
   where code = upper(p_code) and revoked_at is null;
  if not found then
    perform app_private.record_code_failure(v_uid, 'INVALID_CODE');         -- (054)
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_row.paused_at is not null and not exists (select 1 from public.society_memberships m
                       where m.society_id = v_row.society_id and m.user_id = v_uid
                         and m.status = 'active' and m.flat_id is null
                         and m.role in ('secretary', 'co_secretary')) then
    perform app_private.record_code_failure(v_uid, 'CODE_PAUSED');          -- (054)
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  return jsonb_build_object(
    'society_id', v_soc,
    'society_name', (select name from public.societies where id = v_soc),
    'wings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name,
        'flats', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'number', f.number,
            'taken', exists (select 1 from public.society_memberships m
                              where m.flat_id = f.id and m.status = 'active')
          ) order by f.number), '[]'::jsonb)
          from public.flats f where f.wing_id = w.id
        )
      ) order by w.name), '[]'::jsonb)
      from public.wings w where w.society_id = v_soc
    )
  );
end;
$function$;
revoke all on function public.onboard_flats_for_code(text) from public, anon;
grant execute on function public.onboard_flats_for_code(text) to authenticated;

-- onboard_resident — latest def 20261008000052:130-241. (054) changes:
--   * throttle + record failed code attempts;
--   * a user whose membership in this society was REMOVED ('deleted') cannot
--     rejoin themselves (unless an authority row for them exists — i.e. staff
--     or an authority deliberately re-added them);
--   * the ON CONFLICT branch never revives a 'deleted' row for a non-authority.
CREATE OR REPLACE FUNCTION public.onboard_resident(p_code text, p_flat_id uuid, p_full_name text, p_residency residency_kind, p_alt_phone text, p_family jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_row       public.society_codes;
  v_soc       uuid;
  v_phone     text;
  v_status    text;
  v_taken     boolean;
  v_mem_id    uuid;
  v_fam       jsonb;
  v_fam_phone text;
  v_authority uuid;
  v_role      public.membership_role := 'member';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_code_attempts_ok(v_uid);                       -- (054)
  if p_full_name is null or length(trim(p_full_name)) < 2 then raise exception 'INVALID_NAME'; end if;

  select * into v_row from public.society_codes where code = upper(p_code) and revoked_at is null;
  if not found then
    perform app_private.record_code_failure(v_uid, 'INVALID_CODE');         -- (054)
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_row.paused_at is not null and not exists (select 1 from public.society_memberships m
                       where m.society_id = v_row.society_id and m.user_id = v_uid
                         and m.status = 'active' and m.flat_id is null
                         and m.role in ('secretary', 'co_secretary')) then
    perform app_private.record_code_failure(v_uid, 'CODE_PAUSED');          -- (054)
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;
  v_soc := v_row.society_id;
  if not public.society_accepts_joins(v_soc) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;

  if not exists (select 1 from public.flats where id = p_flat_id and society_id = v_soc) then
    return jsonb_build_object('error', 'FLAT_NOT_IN_SOCIETY');
  end if;

  select '+' || phone into v_phone from auth.users where id = v_uid;

  select id into v_authority
  from public.society_authorities
  where society_id = v_soc
    and (user_id = v_uid
         or (user_id is null
             and phone = right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10)))
  limit 1;

  -- (054) removed by the society: no self-service way back in.
  if v_authority is null and exists (
    select 1 from public.society_memberships
     where society_id = v_soc and user_id = v_uid and status = 'deleted'
  ) then
    return jsonb_build_object('error', 'MEMBERSHIP_REMOVED');
  end if;

  if v_authority is not null then
    v_role := 'secretary';
    update public.society_authorities
       set user_id = v_uid, claimed_at = coalesce(claimed_at, now())
     where id = v_authority;
  end if;

  select exists (select 1 from public.society_memberships
                  where flat_id = p_flat_id and society_id = v_soc and status = 'active'
                    and user_id <> v_uid)
    into v_taken;
  v_status := case when v_taken and v_authority is null then 'pending_review' else 'active' end;

  insert into public.profiles (user_id, full_name, phone)
  values (v_uid, trim(p_full_name), v_phone)
  on conflict (user_id) do update set full_name = excluded.full_name;

  select id into v_mem_id
  from public.society_memberships
  where society_id = v_soc and user_id = v_uid and flat_id is null and status = 'active'
  limit 1;

  if v_mem_id is not null then
    update public.society_memberships
       set flat_id = p_flat_id, residency = p_residency,
           emergency_contact = nullif(trim(coalesce(p_alt_phone,'')), ''),
           role = case when v_role = 'secretary' then 'secretary'::public.membership_role else role end
     where id = v_mem_id;
  else
    insert into public.society_memberships
      (society_id, user_id, flat_id, role, residency, household, emergency_contact, status)
    values (v_soc, v_uid, p_flat_id, v_role, p_residency, 'family',
            nullif(trim(coalesce(p_alt_phone,'')), ''), v_status)
    on conflict (society_id, user_id, flat_id) do update
      set status = case
                     when public.society_memberships.status = 'deleted'
                          and excluded.role <> 'secretary'
                       then public.society_memberships.status          -- (054)
                     else excluded.status
                   end,
          residency = excluded.residency,
          emergency_contact = excluded.emergency_contact, joined_at = now(),
          role = case when excluded.role = 'secretary' then excluded.role
                      else public.society_memberships.role end
    returning id into v_mem_id;
  end if;

  for v_fam in select * from jsonb_array_elements(p_family)
  loop
    if coalesce(trim(v_fam->>'name'), '') = '' then continue; end if;
    v_fam_phone := nullif(regexp_replace(coalesce(v_fam->>'phone',''), '\D', '', 'g'), '');
    if v_fam_phone is not null then
      v_fam_phone := '+91' || right(v_fam_phone, 10);
      if exists (select 1 from public.family_members
                  where society_id = v_soc and phone = v_fam_phone and claimed_user_id is null) then
        v_fam_phone := null;
      end if;
    end if;
    insert into public.family_members (society_id, membership_id, full_name, phone, relation, is_resident)
    values (v_soc, v_mem_id, trim(v_fam->>'name'), v_fam_phone,
            nullif(trim(v_fam->>'relation'), ''), coalesce((v_fam->>'is_resident')::boolean, true));
  end loop;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_soc, v_uid, 'member.joined', 'society_memberships', v_mem_id,
          jsonb_build_object('flat_id', p_flat_id, 'status', v_status,
            'authority', v_authority is not null,
            'family_count', jsonb_array_length(p_family)));

  return jsonb_build_object('society_id', v_soc, 'status', v_status);
end;
$function$;
revoke all on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb) from public, anon;
grant execute on function public.onboard_resident(text, uuid, text, public.residency_kind, text, jsonb) to authenticated;

-- ============================================================================
-- §7  Privileged RPCs: live role check (+ authority revocation where a
--     secretary loses the office). Each body is the latest definition.
-- ============================================================================

-- set_membership_role — latest def 20260721000015.
create or replace function public.set_membership_role(
  p_target_user_id uuid,
  p_role           public.membership_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_old_role   public.membership_role;
begin
  if v_actor_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- (1) only the chairman appoints — (054) checked live, not from the JWT
  if public.current_membership_role() <> 'secretary' then
    raise exception 'ONLY_SECRETARY_CAN_SET_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id, array['secretary'], 'ONLY_SECRETARY_CAN_SET_ROLE');

  if p_role = 'secretary' then
    raise exception 'USE_TRANSFER_SECRETARY_ROLE';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception 'CANNOT_CHANGE_OWN_ROLE';
  end if;

  select role into v_old_role
  from public.society_memberships
  where user_id = p_target_user_id
    and society_id = v_society_id
    and status = 'active';

  if v_old_role is null then
    raise exception 'TARGET_NOT_IN_SOCIETY';
  end if;

  if v_old_role = p_role then
    return;
  end if;

  update public.society_memberships
     set role = p_role
   where user_id = p_target_user_id
     and society_id = v_society_id
     and status = 'active';

  -- (054) a secretary who is demoted must not get the office back through
  -- claim_society_authority / onboard_resident.
  if v_old_role = 'secretary' then
    perform app_private.revoke_society_authority(v_society_id, p_target_user_id, v_actor_id, 'role_changed');
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (
    v_society_id,
    v_actor_id,
    'role.changed',
    'society_memberships',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'from', v_old_role,
      'to',   p_role
    )
  );
end;
$$;
revoke all on function public.set_membership_role(uuid, public.membership_role) from public, anon;
grant execute on function public.set_membership_role(uuid, public.membership_role) to authenticated;

-- transfer_secretary_role — latest def 20260524000006.
create or replace function public.transfer_secretary_role(p_new_secretary_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_user_id uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
begin
  if v_old_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if public.current_membership_role() <> 'secretary' then
    raise exception 'ONLY_SECRETARY_CAN_TRANSFER';
  end if;
  perform app_private.assert_live_role(v_society_id, array['secretary'], 'ONLY_SECRETARY_CAN_TRANSFER');  -- (054)

  if not exists (
    select 1 from public.society_memberships
    where user_id = p_new_secretary_user_id
      and society_id = v_society_id
      and status = 'active'
      and role in ('co_secretary', 'board_member')
  ) then
    raise exception 'TARGET_NOT_ELIGIBLE';
  end if;

  update public.society_memberships
    set role = 'member'
    where user_id = v_old_user_id and society_id = v_society_id and status = 'active';

  update public.society_memberships
    set role = 'secretary'
    where user_id = p_new_secretary_user_id and society_id = v_society_id and status = 'active';

  -- (054) the outgoing chairman's authority row would re-grant the office.
  perform app_private.revoke_society_authority(v_society_id, v_old_user_id, v_old_user_id, 'transferred');

  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (v_society_id, v_old_user_id, 'role.transferred', 'society_memberships',
          jsonb_build_object('from', v_old_user_id, 'to', p_new_secretary_user_id));
end;
$$;
revoke all on function public.transfer_secretary_role(uuid) from public, anon;
grant execute on function public.transfer_secretary_role(uuid) to authenticated;

-- reset_member_pin — latest def 20260721000018.
create or replace function public.reset_member_pin(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
begin
  if v_actor_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if public.current_membership_role() <> 'secretary' then
    raise exception 'ONLY_SECRETARY_CAN_RESET_PIN';
  end if;
  perform app_private.assert_live_role(v_society_id, array['secretary'], 'ONLY_SECRETARY_CAN_RESET_PIN');  -- (054)

  if not exists (
    select 1 from public.society_memberships
    where user_id = p_target_user_id and society_id = v_society_id and status = 'active'
  ) then
    raise exception 'TARGET_NOT_IN_SOCIETY';
  end if;

  update public.profiles
     set pin_set = false, pin_set_at = null
   where user_id = p_target_user_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_actor_id, 'pin.reset', 'profiles', p_target_user_id,
          jsonb_build_object('target_user_id', p_target_user_id));
end;
$$;
revoke all on function public.reset_member_pin(uuid) from public, anon;
grant execute on function public.reset_member_pin(uuid) to authenticated;

-- remove_member — latest def 20260701000011 (PAR-010).
create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership  record;
  v_user_id     uuid;
  v_phone_hash  text;
  v_caller_role text := public.current_membership_role();
  v_active_secretaries int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_caller_role not in ('secretary', 'co_secretary') then
    raise exception 'INSUFFICIENT_PRIVILEGES';
  end if;
  perform app_private.assert_live_role(public.current_society_id(),
                                       array['secretary', 'co_secretary'],
                                       'INSUFFICIENT_PRIVILEGES');                  -- (054)

  select * into v_membership
  from public.society_memberships
  where id = p_membership_id and society_id = public.current_society_id();
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  if v_membership.role in ('secretary', 'co_secretary')
     and v_membership.status = 'active' then
    select count(*) into v_active_secretaries
    from public.society_memberships
    where society_id = public.current_society_id()
      and role in ('secretary', 'co_secretary')
      and status = 'active'
      and id <> p_membership_id;
    if v_active_secretaries = 0 then
      raise exception 'LAST_SECRETARY';
    end if;
  end if;

  v_user_id := v_membership.user_id;

  update public.society_memberships set status = 'deleted' where id = p_membership_id;
  delete from public.family_members where membership_id = p_membership_id;

  -- (054) removed people lose any authority row in this society, so neither
  -- claim_society_authority nor onboard_resident can make them secretary again.
  perform app_private.revoke_society_authority(v_membership.society_id, v_user_id, auth.uid(), 'removed');

  if not exists (
    select 1 from public.society_memberships
    where user_id = v_user_id and status = 'active' and id <> p_membership_id
  ) then
    v_phone_hash := 'REDACTED-' || encode(extensions.digest(
      coalesce((select phone from public.profiles where user_id = v_user_id), '')::bytea,
      'sha256'::text
    ), 'hex');
    update public.profiles
      set full_name = '[REDACTED]', phone = v_phone_hash
      where user_id = v_user_id;
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (public.current_society_id(), auth.uid(), 'member.removed',
          'society_memberships', p_membership_id,
          jsonb_build_object('user_id', v_user_id, 'redacted', not exists (
            select 1 from public.society_memberships
            where user_id = v_user_id and status = 'active' and id <> p_membership_id
          )));
end;
$$;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- file_complaint — latest def 20260526000007. (054): storage key must be
-- {society}/complaints/{complaint_id}/{file}.
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
revoke all on function public.file_complaint(public.complaint_kind, text, uuid, text, uuid, text, text, int) from public, anon;
grant execute on function public.file_complaint(public.complaint_kind, text, uuid, text, uuid, text, text, int) to authenticated;

-- claim_complaint — latest def 20260701000011 (PAR-011). (054): live role;
-- a complaint outside the caller's society raises COMPLAINT_NOT_FOUND instead
-- of returning NULL (NULL still means "someone else claimed it first").
create or replace function public.claim_complaint(
  p_complaint_id  uuid,
  p_response_kind public.complaint_status,
  p_free_text     text default null
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
  v_updated     public.complaints%rowtype;
  v_response_id uuid;
  v_caller_flat uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id,
                                       array['board_member', 'co_secretary', 'secretary']);  -- (054)
  if p_response_kind = 'open' then raise exception 'INVALID_RESPONSE_KIND'; end if;

  if not exists (select 1 from public.complaints
                  where id = p_complaint_id and society_id = v_society_id) then
    raise exception 'COMPLAINT_NOT_FOUND';                                          -- (054)
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
  limit 1;

  update public.complaints
     set owner_id    = v_caller_id,
         status      = p_response_kind,
         claimed_at  = now(),
         resolved_at = case when p_response_kind = 'resolved' then now() else null end
   where id = p_complaint_id and society_id = v_society_id and owner_id is null
  returning * into v_updated;

  if v_updated.id is null then return null; end if;

  insert into public.complaint_responses (
    society_id, complaint_id, responder_id, responder_flat_id, response_kind, free_text
  )
  values (v_society_id, p_complaint_id, v_caller_id, v_caller_flat, p_response_kind, p_free_text)
  returning id into v_response_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_caller_id, 'complaint.claimed', 'complaints', p_complaint_id,
          jsonb_build_object('response_kind', p_response_kind, 'response_id', v_response_id));

  return to_jsonb(v_updated);
end;
$$;
revoke all on function public.claim_complaint(uuid, public.complaint_status, text) from public, anon;
grant execute on function public.claim_complaint(uuid, public.complaint_status, text) to authenticated;

-- add_complaint_response — latest def 20260701000011 (PAR-011). (054): the
-- owner must STILL hold a board role (a demoted owner could keep responding).
create or replace function public.add_complaint_response(
  p_complaint_id  uuid,
  p_response_kind public.complaint_status,
  p_free_text     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_society_id  uuid := public.current_society_id();
  v_response_id uuid;
  v_caller_flat uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if p_response_kind = 'open' then raise exception 'INVALID_RESPONSE_KIND'; end if;

  if not exists (
    select 1 from public.complaints
    where id = p_complaint_id and society_id = v_society_id and owner_id = v_caller_id
  ) then
    raise exception 'NOT_OWNER';
  end if;
  perform app_private.assert_live_role(v_society_id,
                                       array['board_member', 'co_secretary', 'secretary']);  -- (054)

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id = v_caller_id and sm.society_id = v_society_id and sm.status = 'active'
  limit 1;

  update public.complaints
     set status      = p_response_kind,
         resolved_at = case when p_response_kind = 'resolved' then now() else null end
   where id = p_complaint_id and society_id = v_society_id;

  insert into public.complaint_responses (
    society_id, complaint_id, responder_id, responder_flat_id, response_kind, free_text
  )
  values (v_society_id, p_complaint_id, v_caller_id, v_caller_flat, p_response_kind, p_free_text)
  returning id into v_response_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_caller_id, 'complaint.responded', 'complaints', p_complaint_id,
          jsonb_build_object('response_kind', p_response_kind, 'response_id', v_response_id));

  return v_response_id;
end;
$$;
revoke all on function public.add_complaint_response(uuid, public.complaint_status, text) from public, anon;
grant execute on function public.add_complaint_response(uuid, public.complaint_status, text) to authenticated;

-- file_notification — latest def 20260528000008. (054): live role + storage key
-- must be {society}/notifications/{notification_id}/{file}.
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
revoke all on function public.file_notification(text, text, public.notification_category, uuid, text, text, int, text, text[]) from public, anon;
grant execute on function public.file_notification(text, text, public.notification_category, uuid, text, text, int, text, text[]) to authenticated;

-- close_poll — latest def 20260528000008. (054): caller must be an active
-- member; the board branch is checked live.
create or replace function public.close_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_poll       public.polls%rowtype;
  v_author_id  uuid;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  perform app_private.assert_live_role(v_society_id,
          array['member', 'board_member', 'co_secretary', 'secretary'], 'NOT_ACTIVE_MEMBER');  -- (054)

  select * into v_poll
  from public.polls
  where id = p_poll_id and society_id = v_society_id;
  if v_poll.id is null then raise exception 'POLL_NOT_FOUND'; end if;

  select n.author_id into v_author_id
  from public.notifications n
  where n.id = v_poll.notification_id;

  if v_caller_id is distinct from v_author_id
     and not app_private.has_live_role(v_society_id,
                                       array['board_member', 'co_secretary', 'secretary']) then  -- (054)
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  update public.polls
     set status = 'closed', closed_at = now()
   where id = p_poll_id and society_id = v_society_id;

  return jsonb_build_object('poll_id', p_poll_id, 'status', 'closed');
end;
$$;
revoke all on function public.close_poll(uuid) from public, anon;
grant execute on function public.close_poll(uuid) to authenticated;

-- approve_booking — latest def 20260528000008. (054): live role; a booking
-- outside the caller's society raises BOOKING_NOT_FOUND.
create or replace function public.approve_booking(p_booking_id uuid)
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
  v_updated     public.bookings%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id,
                                       array['board_member', 'co_secretary', 'secretary']);  -- (054)

  if not exists (select 1 from public.bookings
                  where id = p_booking_id and society_id = v_society_id) then
    raise exception 'BOOKING_NOT_FOUND';                                            -- (054)
  end if;

  select sm.flat_id into v_caller_flat
  from public.society_memberships sm
  where sm.user_id    = v_caller_id
    and sm.society_id = v_society_id
    and sm.status     = 'active'
  limit 1;

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
    when exclusion_violation then
      return jsonb_build_object('approved', false, 'reason', 'slot_taken');
  end;

  if v_updated.id is null then
    return jsonb_build_object('approved', false, 'reason', 'race_lost_or_not_pending');
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id)
  values (v_society_id, v_caller_id, 'booking.approved', 'bookings', p_booking_id);

  return jsonb_build_object('approved', true, 'booking', to_jsonb(v_updated));
end;
$$;
revoke all on function public.approve_booking(uuid) from public, anon;
grant execute on function public.approve_booking(uuid) to authenticated;

-- reject_booking — latest def 20260528000008. (054): live role; cross-society
-- raises BOOKING_NOT_FOUND.
create or replace function public.reject_booking(
  p_booking_id uuid,
  p_reason     text default null
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
  v_updated     public.bookings%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('board_member', 'co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id,
                                       array['board_member', 'co_secretary', 'secretary']);  -- (054)

  if not exists (select 1 from public.bookings
                  where id = p_booking_id and society_id = v_society_id) then
    raise exception 'BOOKING_NOT_FOUND';                                            -- (054)
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
revoke all on function public.reject_booking(uuid, text) from public, anon;
grant execute on function public.reject_booking(uuid, text) to authenticated;

-- issue_flat_action — latest def 20260529000009. (054): live role + storage key
-- must be {society}/flat_actions/{action_id}/{file}.
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
set search_path = public, pg_temp
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

  if v_role not in ('co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id, array['co_secretary', 'secretary']);  -- (054)

  if not exists (
    select 1 from public.flats where id = p_flat_id and society_id = v_society_id
  ) then
    raise exception 'INVALID_FLAT';
  end if;

  if p_kind = 'fine' and (p_amount is null or p_amount <= 0 or p_due_date is null) then
    raise exception 'FINE_FIELDS_REQUIRED';
  end if;

  perform app_private.assert_attachment_key(p_storage_key, v_society_id, 'flat_actions',
                                            p_action_id, p_byte_size);              -- (054)

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
revoke all on function public.issue_flat_action(uuid, public.flat_action_kind, text, numeric, date, uuid, text, text, int) from public, anon;
grant execute on function public.issue_flat_action(uuid, public.flat_action_kind, text, numeric, date, uuid, text, text, int) to authenticated;

-- waive_fine — latest def 20260529000009. (054): live role; a flat action
-- outside the caller's society raises FLAT_ACTION_NOT_FOUND.
create or replace function public.waive_fine(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_role       text := public.current_membership_role();
  v_row        public.flat_actions%rowtype;
begin
  if v_caller_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  if v_role not in ('co_secretary', 'secretary') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;
  perform app_private.assert_live_role(v_society_id, array['co_secretary', 'secretary']);  -- (054)

  if not exists (select 1 from public.flat_actions
                  where id = p_action_id and society_id = v_society_id) then
    raise exception 'FLAT_ACTION_NOT_FOUND';                                        -- (054)
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
revoke all on function public.waive_fine(uuid) from public, anon;
grant execute on function public.waive_fine(uuid) to authenticated;

-- restore_content — latest def 20260529000009. (054): live role.
create or replace function public.restore_content(
  p_target_kind public.report_target_kind,
  p_target_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  perform app_private.assert_live_role(v_society_id, array['co_secretary', 'secretary']);  -- (054)

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
revoke all on function public.restore_content(public.report_target_kind, uuid) from public, anon;
grant execute on function public.restore_content(public.report_target_kind, uuid) to authenticated;

-- confirm_takedown — latest def 20260529000009. (054): live role.
create or replace function public.confirm_takedown(
  p_target_kind public.report_target_kind,
  p_target_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  perform app_private.assert_live_role(v_society_id, array['co_secretary', 'secretary']);  -- (054)

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
revoke all on function public.confirm_takedown(public.report_target_kind, uuid) from public, anon;
grant execute on function public.confirm_takedown(public.report_target_kind, uuid) to authenticated;

-- set_grievance_officer — latest def 20260529000009. (054): live role.
create or replace function public.set_grievance_officer(
  p_name    text,
  p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  perform app_private.assert_live_role(v_society_id, array['secretary', 'co_secretary']);  -- (054)

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
revoke all on function public.set_grievance_officer(text, text) from public, anon;
grant execute on function public.set_grievance_officer(text, text) to authenticated;

-- reveal_phone — latest def 20260524000006. (054): the requester must still be
-- an active member (a removed member's token keeps society_id for up to 1h).
create or replace function public.reveal_phone(p_target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_requester_id uuid := auth.uid();
  v_society_id   uuid := public.current_society_id();
begin
  if v_requester_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  perform app_private.assert_live_role(v_society_id,
          array['member', 'board_member', 'co_secretary', 'secretary'], 'NOT_ACTIVE_MEMBER');  -- (054)

  select p.phone into v_phone
  from public.profiles p
  join public.society_memberships sm on sm.user_id = p.user_id
  where p.user_id = p_target_user_id
    and sm.society_id = v_society_id
    and sm.status in ('active', 'pending_review')
  limit 1;

  if v_phone is null then
    raise exception 'NOT_FOUND_OR_CROSS_TENANT';
  end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_requester_id, 'phone.revealed', 'profiles', p_target_user_id,
          jsonb_build_object('target_user_id', p_target_user_id));

  return v_phone;
end;
$$;
revoke all on function public.reveal_phone(uuid) from public, anon;
grant execute on function public.reveal_phone(uuid) to authenticated;

-- bootstrap_society_structure — latest def 20261008000052. (054): the
-- "audit-log creator" path is gone (it came from the retired self-serve
-- create_society_with_secretary and let a demoted creator keep adding wings).
-- Only a live secretary / co_secretary of the society may bootstrap.
CREATE OR REPLACE FUNCTION public.bootstrap_society_structure(p_society_id uuid, p_wings jsonb, p_flats jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare
  v_user_id   uuid := auth.uid();
  v_wing_id   uuid;
  v_name      text;
  v_flat      jsonb;
  v_wing_map  jsonb := '{}'::jsonb;
  v_wings_out jsonb := '[]'::jsonb;
  v_flats_out jsonb := '[]'::jsonb;
  v_flat_id   uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_live_role(p_society_id, array['secretary', 'co_secretary'],
                                       'NOT_SOCIETY_CREATOR');                         -- (054)

  for v_name in select jsonb_array_elements_text(jsonb_path_query_array(p_wings, '$[*].name'))
  loop
    insert into public.wings (society_id, name) values (p_society_id, v_name)
    returning id into v_wing_id;
    v_wing_map := v_wing_map || jsonb_build_object(v_name, v_wing_id);
    v_wings_out := v_wings_out || jsonb_build_object('id', v_wing_id, 'name', v_name);
  end loop;

  for v_flat in select * from jsonb_array_elements(p_flats)
  loop
    v_wing_id := (v_wing_map ->> (v_flat ->> 'wing_name'))::uuid;
    if v_wing_id is null then raise exception 'UNKNOWN_WING: %', v_flat ->> 'wing_name'; end if;
    insert into public.flats (society_id, wing_id, number)
    values (p_society_id, v_wing_id, v_flat ->> 'number')
    returning id into v_flat_id;
    v_flats_out := v_flats_out || jsonb_build_object('id', v_flat_id, 'number', v_flat ->> 'number');
  end loop;

  return jsonb_build_object('wings', v_wings_out, 'flats', v_flats_out);
end;
$function$;
revoke all on function public.bootstrap_society_structure(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.bootstrap_society_structure(uuid, jsonb, jsonb) to authenticated;

-- ============================================================================
-- §8  HIGH 8 — legacy self-serve RPCs
-- ============================================================================
-- Society creation is staff-only (admin_create_society). The legacy wizard and
-- join path (web /setup/society…/setup/code, /join/code, /join/profile) are
-- retired; contract-054.md lists the call sites.
--   create_society_with_secretary — any user could create a society.
--   finalize_society_setup        — the "creator" could re-grant themselves
--                                   'secretary' and revive a deleted membership.
--   redeem_society_code           — co-secretary elevation trusted the
--                                   client-writable profiles.phone; its
--                                   auto-pause let anyone pause a valid code.
--   claim_chairman                — superseded by claim_society_authority; could
--                                   re-grant 'secretary' from secretary_phone.
--   validate_society_code / list_society_structure — unthrottled code oracles;
--                                   onboard_flats_for_code replaces both.
revoke all on function public.create_society_with_secretary(text, text, text) from public, anon, authenticated;
revoke all on function public.finalize_society_setup(uuid, uuid) from public, anon, authenticated;
revoke all on function public.redeem_society_code(text, uuid, public.residency_kind, public.household_kind, text) from public, anon, authenticated;
revoke all on function public.claim_chairman() from public, anon, authenticated;
revoke all on function public.validate_society_code(text) from public, anon, authenticated;
revoke all on function public.list_society_structure(text) from public, anon, authenticated;

-- generate_society_code — latest def 20260524000006. (054): CSPRNG
-- (gen_random_bytes, rejection-sampled so every character is equally likely)
-- instead of random().
create or replace function public.generate_society_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  charset   constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0/O/I/1/L
  v_len     constant int  := 31;
  v_limit   constant int  := 248;  -- 31 * 8: bytes >= 248 are rejected (no modulo bias)
  candidate text;
  v_chars   text;
  v_bytes   bytea;
  v_pos     int;
  v_b       int;
  attempts  int := 0;
begin
  loop
    v_chars := '';
    v_bytes := extensions.gen_random_bytes(32);
    v_pos   := 0;
    while char_length(v_chars) < 8 loop
      if v_pos >= 32 then
        v_bytes := extensions.gen_random_bytes(32);
        v_pos   := 0;
      end if;
      v_b   := get_byte(v_bytes, v_pos);
      v_pos := v_pos + 1;
      if v_b < v_limit then
        v_chars := v_chars || substr(charset, (v_b % v_len) + 1, 1);
      end if;
    end loop;
    candidate := substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);
    if not exists (
      select 1 from public.society_codes
      where code = candidate
        and revoked_at is null
    ) then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'Unable to generate unique society code after 20 attempts';
    end if;
  end loop;
end;
$$;
revoke all on function public.generate_society_code() from public, anon, authenticated;

-- ============================================================================
-- §9  HIGH 10 — complaints / attachments / storage
-- ============================================================================

-- Direct INSERT bypassed file_complaint's checks (007:139-181). Clients only
-- use the file_complaint / file_notification / issue_flat_action / create_post RPCs.
drop policy if exists "complaint_insert" on public.complaints;
drop policy if exists "attachments_insert" on public.attachments;
revoke insert, update, delete, truncate on public.complaints          from anon, authenticated;
revoke insert, update, delete, truncate on public.complaint_responses from anon, authenticated;
revoke insert, update, delete, truncate on public.attachments         from anon, authenticated;

-- Attachment rows: visible only to people who can see the owning record (the
-- owning table's own RLS decides), or to the uploader. Was: whole society.
drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select"
  on public.attachments for select to authenticated
  using (
    society_id = (select public.current_society_id())
    and (
      created_by = (select auth.uid())
      or (owner_kind = 'notification'
          and exists (select 1 from public.notifications n where n.id = attachments.owner_id))
      or (owner_kind = 'complaint'
          and exists (select 1 from public.complaints c where c.id = attachments.owner_id))
      or (owner_kind = 'flat_action'
          and exists (select 1 from public.flat_actions fa where fa.id = attachments.owner_id))
      or (owner_kind = 'post'
          and exists (select 1 from public.posts p where p.id = attachments.owner_id))
    )
  );

-- Storage read: {society}/{kind}/{owner_id}/{file}. SECURITY INVOKER so the
-- owning table's RLS (can_see_complaint, can_see_flat_action, post moderation)
-- decides. Unknown kinds and quarantine/ are not readable (uploader excepted,
-- via the policy's owner clause).
create or replace function public.can_read_attachment_object(p_name text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_soc   uuid;
  v_id    uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) < 4 then return false; end if;
  v_soc := public.parisar_try_uuid(v_parts[1]);
  if v_soc is null or v_soc is distinct from public.current_society_id() then return false; end if;
  v_id := public.parisar_try_uuid(v_parts[3]);
  if v_id is null then return false; end if;

  if v_parts[2] = 'complaints' then
    return exists (select 1 from public.complaints c where c.id = v_id and c.society_id = v_soc);
  elsif v_parts[2] = 'flat_actions' then
    return exists (select 1 from public.flat_actions fa where fa.id = v_id and fa.society_id = v_soc);
  elsif v_parts[2] = 'notifications' then
    return exists (select 1 from public.notifications n where n.id = v_id and n.society_id = v_soc);
  elsif v_parts[2] = 'posts' then
    return exists (select 1 from public.posts p where p.id = v_id and p.society_id = v_soc);
  end if;
  return false;
end;
$$;
revoke all on function public.can_read_attachment_object(text) from public, anon;
grant execute on function public.can_read_attachment_object(text) to authenticated, service_role;

-- Storage write: only the shapes the apps produce, by the roles that may use
-- them. posts/ is written only by the moderate-image function (service role),
-- so a member can never place an unmoderated photo there (or rename one there).
create or replace function public.can_write_attachment_object(p_name text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parts text[];
  v_soc   uuid;
  v_roles text[];
begin
  if p_name is null or position('..' in p_name) > 0 then return false; end if;
  v_parts := string_to_array(p_name, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 4 then return false; end if;
  v_soc := public.parisar_try_uuid(v_parts[1]);
  if v_soc is null or v_soc is distinct from public.current_society_id() then return false; end if;
  if public.parisar_try_uuid(v_parts[3]) is null then return false; end if;
  if coalesce(v_parts[4] !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$', true) then return false; end if;

  v_roles := case v_parts[2]
    when 'complaints'    then array['member', 'board_member', 'co_secretary', 'secretary']
    when 'quarantine'    then array['member', 'board_member', 'co_secretary', 'secretary']
    when 'notifications' then array['board_member', 'co_secretary', 'secretary']
    when 'flat_actions'  then array['co_secretary', 'secretary']
    else null
  end;
  if v_roles is null then return false; end if;

  -- Own membership rows are readable through self_read_membership (041).
  return exists (
    select 1 from public.society_memberships m
     where m.user_id = auth.uid() and m.society_id = v_soc
       and m.status = 'active' and m.role::text = any (v_roles)
  );
end;
$$;
revoke all on function public.can_write_attachment_object(text) from public, anon;
grant execute on function public.can_write_attachment_object(text) to authenticated, service_role;

drop policy if exists "parisar_tenant_read" on storage.objects;
create policy "parisar_tenant_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and (
      owner = (select auth.uid())
      or public.can_read_attachment_object(name)
    )
  );

drop policy if exists "parisar_tenant_write" on storage.objects;
create policy "parisar_tenant_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'parisar-attachments'
    and public.can_write_attachment_object(name)
  );

-- Update (rename / replace): still owner-only (013), and the NEW name must also
-- be a writable shape — otherwise a quarantine photo could be moved into posts/.
drop policy if exists "parisar_tenant_update" on storage.objects;
create policy "parisar_tenant_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'parisar-attachments'
    and public.parisar_try_uuid((storage.foldername(name))[1]) = (select public.current_society_id())
    and owner = (select auth.uid())
  )
  with check (
    bucket_id = 'parisar-attachments'
    and owner = (select auth.uid())
    and public.can_write_attachment_object(name)
  );

-- ============================================================================
-- §10 Auth Hook — latest def 20260721000036:80-143. (054): the resident branch
-- uses app_private.resolve_active_membership (switcher choice first, then the
-- newest active membership). Guard branch unchanged.
-- ============================================================================
create or replace function public.inject_society_claims(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  active_membership record;
  v_guard_society uuid;
  claims jsonb;
begin
  v_user_id := (event->>'user_id')::uuid;
  claims := coalesce(event->'claims', '{}'::jsonb);

  select r.society_id, r.role
    into active_membership
    from app_private.resolve_active_membership(v_user_id) r;               -- (054)

  if active_membership.society_id is not null then
    claims := jsonb_set(
      claims, '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
             'society_id', active_membership.society_id::text,
             'role', active_membership.role
           ),
      true
    );
  else
    select sg.society_id into v_guard_society
      from public.society_guards sg
      where sg.user_id = v_user_id and sg.status = 'active'
      order by sg.created_at desc, sg.id                                    -- (054) deterministic
      limit 1;

    if v_guard_society is not null then
      claims := jsonb_set(
        claims, '{app_metadata}',
        coalesce(claims->'app_metadata', '{}'::jsonb)
          || jsonb_build_object(
               'society_id', null,
               'role', 'guard',
               'guard_society_id', v_guard_society::text
             ),
        true
      );
    else
      claims := jsonb_set(
        claims, '{app_metadata}',
        coalesce(claims->'app_metadata', '{}'::jsonb)
          || jsonb_build_object('society_id', null, 'role', null),
        true
      );
    end if;
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;
grant execute on function public.inject_society_claims(jsonb) to supabase_auth_admin;
revoke execute on function public.inject_society_claims(jsonb) from authenticated, anon, public;

-- ============================================================================
-- §11 society_guards — secretaries read; all writes via secretary_add_guard /
-- claim_guard. The FOR ALL policy (036:156-167) let a secretary set any user_id
-- (e.g. turn any account into their society's "guard").
-- ============================================================================
drop policy if exists society_guards_secretary on public.society_guards;
drop policy if exists society_guards_secretary_read on public.society_guards;
create policy society_guards_secretary_read on public.society_guards
  for select to authenticated
  using (
    exists (select 1 from public.society_memberships m
             where m.society_id = society_guards.society_id and m.user_id = (select auth.uid())
               and m.role in ('secretary', 'co_secretary') and m.status = 'active')
  );
revoke insert, update, delete, truncate on public.society_guards from anon, authenticated;

notify pgrst, 'reload schema';
