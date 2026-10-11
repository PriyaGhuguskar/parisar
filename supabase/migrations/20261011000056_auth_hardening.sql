-- Migration 056: auth hardening (CODE-REVIEW C2, HIGH 2/3/5/7).
--
-- What changes:
--   1. app_private.auth_throttle + auth_throttle_attempt()/auth_throttle_success()
--      — a server-side attempt counter used by PIN sign-in (supabase/functions/
--      pin-login and the website's pinLogin server action). 5 wrong PINs for a
--      phone lock it for 15 minutes; a per-IP counter catches spraying many
--      phones. Service role only.
--   2. find_user_id_by_phone() — replaces auth.admin.listUsers({perPage:1000})
--      + find, which silently missed every user past the first 1000. Service
--      role only.
--   3. service_mark_pin_set() — the only way profiles.pin_set becomes true now
--      that 054 makes the column non-writable by `authenticated`. Called by the
--      server after it has written the peppered PIN credential. Service role only.
--   4. mark_pin_set() (018) is revoked from `authenticated`: it let any user flip
--      pin_set without ever setting a credential.
--   5. reset_member_pin() also clears the stored password, so a PIN the chairman
--      reset really stops working (before, the old PIN kept signing in).
--   6. Legacy society-code passwords are wiped. An early draft wrote the shared
--      society code into auth.users as the password; anyone with the code and a
--      neighbour's phone could sign in as them. Every account whose profile has
--      no PIN (pin_set = false) has its password cleared — OTP still works, and
--      they set a PIN after their next OTP. Accounts WITH a PIN keep their
--      legacy `pk1.` password until their next PIN sign-in upgrades it to the
--      peppered secret (see pin-login).
--
-- Idempotent: create-or-replace / if-not-exists throughout.

create schema if not exists app_private;

-- ---------------------------------------------------------------------------
-- 1. Attempt throttle
-- ---------------------------------------------------------------------------
create table if not exists app_private.auth_throttle (
  key                text primary key,
  failures           integer     not null default 0,
  window_started_at  timestamptz not null default now(),
  locked_until       timestamptz,
  updated_at         timestamptz not null default now()
);

alter table app_private.auth_throttle enable row level security;
revoke all on app_private.auth_throttle from public, anon, authenticated;

create index if not exists auth_throttle_updated_at_idx
  on app_private.auth_throttle (updated_at);

comment on table app_private.auth_throttle is
  'Server-side sign-in attempt counters (keys like pin:phone:<digits>, pin:ip:<ip>). Written only by auth_throttle_attempt/auth_throttle_success.';

-- Count one attempt against p_key BEFORE the credential is checked (pessimistic:
-- parallel requests cannot all slip in ahead of the failure being recorded).
-- The attempt that reaches p_max is still allowed; the lock applies to the next
-- one. A successful sign-in then calls auth_throttle_success to undo the count.
--
-- Returns {allowed, failures, locked_until}.
create or replace function public.auth_throttle_attempt(
  p_key            text,
  p_max            integer,
  p_window_seconds integer,
  p_lock_seconds   integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  r     app_private.auth_throttle%rowtype;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'INVALID_KEY';
  end if;
  if coalesce(p_max, 0) < 1 or coalesce(p_window_seconds, 0) < 1 or coalesce(p_lock_seconds, 0) < 1 then
    raise exception 'INVALID_LIMITS';
  end if;

  insert into app_private.auth_throttle (key, failures, window_started_at, updated_at)
  values (p_key, 0, v_now, v_now)
  on conflict (key) do nothing;

  select * into r from app_private.auth_throttle where key = p_key for update;

  if r.locked_until is not null and r.locked_until > v_now then
    return jsonb_build_object('allowed', false, 'failures', r.failures, 'locked_until', r.locked_until);
  end if;

  -- Expired lock or expired window: start a fresh window.
  if r.locked_until is not null
     or r.window_started_at < v_now - make_interval(secs => p_window_seconds) then
    r.failures := 0;
    r.window_started_at := v_now;
    r.locked_until := null;
  end if;

  r.failures := r.failures + 1;
  if r.failures >= p_max then
    r.locked_until := v_now + make_interval(secs => p_lock_seconds);
  end if;

  update app_private.auth_throttle
     set failures = r.failures,
         window_started_at = r.window_started_at,
         locked_until = r.locked_until,
         updated_at = v_now
   where key = p_key;

  return jsonb_build_object('allowed', true, 'failures', r.failures, 'locked_until', r.locked_until);
end;
$$;

-- p_mode 'clear': forget the key entirely (per-phone counter after a correct PIN).
-- p_mode 'undo' : take back the one pessimistic count (per-IP counter — a shared
--                 NAT's successful sign-ins must not pile up toward its lock).
create or replace function public.auth_throttle_success(p_key text, p_mode text default 'clear')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null then return; end if;
  if p_mode = 'undo' then
    update app_private.auth_throttle
       set failures = greatest(failures - 1, 0),
           locked_until = case when failures - 1 <= 0 then null else locked_until end,
           updated_at = now()
     where key = p_key;
  else
    delete from app_private.auth_throttle where key = p_key;
  end if;
end;
$$;

revoke execute on function public.auth_throttle_attempt(text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.auth_throttle_success(text, text) from public, anon, authenticated;
grant execute on function public.auth_throttle_attempt(text, integer, integer, integer) to service_role;
grant execute on function public.auth_throttle_success(text, text) to service_role;

-- Housekeeping helper (call from pg_cron if enabled): drop idle counters.
create or replace function app_private.auth_throttle_prune()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with d as (
    delete from app_private.auth_throttle
     where updated_at < now() - interval '1 day'
       and (locked_until is null or locked_until < now())
    returning 1
  )
  select count(*)::integer from d;
$$;
revoke execute on function app_private.auth_throttle_prune() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. find_user_id_by_phone — exact lookup, no 1000-user page limit
-- ---------------------------------------------------------------------------
-- Accepts any formatting ("+91 98123 45678", "919812345678", "9812345678");
-- auth.users.phone is stored as bare digits with the country code.
create or replace function public.find_user_id_by_phone(p_phone text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id     uuid;
begin
  if length(v_digits) = 10 then v_digits := '91' || v_digits; end if;
  if length(v_digits) < 11 or length(v_digits) > 15 then return null; end if;
  select u.id into v_id from auth.users u where u.phone = v_digits limit 1;
  return v_id;
end;
$$;

revoke execute on function public.find_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_phone(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. service_mark_pin_set — server-only flag flip after the credential is written
-- ---------------------------------------------------------------------------
create or replace function public.service_mark_pin_set(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  update public.profiles
     set pin_set = true,
         pin_set_at = now()
   where user_id = p_user_id;
  if not found then
    -- A brand-new OTP user may not have a profile row yet (onboarding writes
    -- the name later). profiles.phone is NOT NULL UNIQUE, E.164 with '+'.
    begin
      insert into public.profiles (user_id, full_name, phone, pin_set, pin_set_at)
      select u.id, '', '+' || u.phone, true, now()
        from auth.users u
       where u.id = p_user_id and u.phone is not null
      on conflict (user_id) do update set pin_set = true, pin_set_at = now();
    exception when unique_violation then
      raise exception 'PROFILE_CONFLICT';
    end;
  end if;
end;
$$;

revoke execute on function public.service_mark_pin_set(uuid) from public, anon, authenticated;
grant execute on function public.service_mark_pin_set(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. mark_pin_set — no longer client-callable
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.mark_pin_set()') is not null then
    execute 'revoke execute on function public.mark_pin_set() from public, anon, authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. reset_member_pin — also clears the stored credential
-- ---------------------------------------------------------------------------
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
  -- Base: 054's definition (live-role check) + credential clear (056).
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

  -- The old PIN must stop working. The resident signs in with OTP and sets a
  -- new PIN (server-side, peppered) — the society code is never a credential.
  update auth.users set encrypted_password = '' where id = p_target_user_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_actor_id, 'pin.reset', 'profiles', p_target_user_id,
          jsonb_build_object('target_user_id', p_target_user_id));
end;
$$;

revoke all on function public.reset_member_pin(uuid) from public, anon;
grant execute on function public.reset_member_pin(uuid) to authenticated;

comment on function public.reset_member_pin(uuid) is
  'Chairman-only, audited. Clears the resident''s PIN credential; they sign in with OTP and choose a new PIN. The society code is never a sign-in credential.';

comment on column public.profiles.pin_set is
  'True once the resident has set their 4-digit PIN (server-side, peppered credential). Set only by service_mark_pin_set().';

-- ---------------------------------------------------------------------------
-- 6. Wipe passwords that are not a PIN credential (legacy society-code passwords)
-- ---------------------------------------------------------------------------
do $$
begin
  update auth.users u
     set encrypted_password = ''
    where coalesce(u.encrypted_password, '') <> ''
      and u.phone is not null
      and not exists (
        select 1 from public.profiles p where p.user_id = u.id and p.pin_set
      )
      -- Staff/platform users are email-less OTP accounts too; never touch an
      -- account that signs in by email+password (none today, but be safe).
      and coalesce(u.email, '') = '';
exception when insufficient_privilege then
  raise notice 'auth_hardening: could not clear legacy passwords (insufficient privilege) — run as postgres/supabase_admin';
end;
$$;
