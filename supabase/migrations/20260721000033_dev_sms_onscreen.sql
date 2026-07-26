-- ============================================================================
-- DEV ONLY: show the OTP on screen for ANY number
-- ----------------------------------------------------------------------------
-- Problem: [auth.sms.test_otp] forces code 123456, but ONLY for the phone
-- numbers listed there. Any other number goes through the send_sms hook, which
-- needs a real SMS provider we do not have in dev — so arbitrary chairman /
-- resident numbers could not log in without whitelisting each one.
--
-- Fix: make the send_sms hook a POSTGRES function (runs in-DB, no separate
-- `functions serve` process to keep alive). It captures the OTP GoTrue
-- generated and stores it so the login screen can display it. Every number now
-- works in dev; the code is shown on screen rather than a fixed 123456, because
-- a single fixed code for all numbers is not something Supabase can do.
--
-- The seeded test numbers keep using 123456 via test_otp (the automated suite
-- depends on that) — those skip this hook entirely.
--
-- MUST BE REMOVED BEFORE PRODUCTION, exactly like test_otp and DevOtpHint:
--   * drop table dev_sms_otp, functions dev_send_sms + dev_peek_otp
--   * point [auth.hook.send_sms] back at the real provider Edge Function
-- ============================================================================

create table if not exists public.dev_sms_otp (
  phone      text primary key,
  otp        text not null,
  created_at timestamptz not null default now()
);

comment on table public.dev_sms_otp is
  'DEV STUB ONLY. Latest OTP per phone, captured by the dev_send_sms hook so the login screen can show it. Remove before production.';

-- The send_sms Auth Hook. GoTrue calls this (as supabase_auth_admin) for every
-- number NOT in test_otp, passing { user:{phone}, sms:{otp} }. We just record it.
create or replace function public.dev_send_sms(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := event->'user'->>'phone';
  v_otp   text := event->'sms'->>'otp';
begin
  if v_phone is not null and v_otp is not null then
    insert into public.dev_sms_otp (phone, otp, created_at)
    values ('+' || ltrim(v_phone, '+'), v_otp, now())
    on conflict (phone) do update set otp = excluded.otp, created_at = now();
  end if;
  -- An empty object tells GoTrue the send succeeded.
  return '{}'::jsonb;
end;
$$;

-- The hook runs as the auth admin role.
grant execute on function public.dev_send_sms(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant insert, update, select on public.dev_sms_otp to supabase_auth_admin;

-- Client-readable peek so the login screen can display the code. anon-callable
-- because it is a dev convenience; it only ever returns the code for the exact
-- phone asked, and the whole thing is stripped before production.
create or replace function public.dev_peek_otp(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select otp from public.dev_sms_otp
   where phone = p_phone and created_at > now() - interval '10 minutes'
   limit 1;
$$;

grant execute on function public.dev_peek_otp(text) to anon, authenticated;
