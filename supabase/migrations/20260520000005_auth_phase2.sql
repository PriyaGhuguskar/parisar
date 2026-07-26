-- Phase 2 — Auth + OTP Adapter
-- Adds: profiles.signup_intent (role choice from the onboard screen),
--       public.otp_requests (per-phone rate-limit ledger for the send-sms hook).

-- 1. signup_intent on profiles.
-- Set by the Phase 2 role-picker screen. Phase 3 reads this when creating the
-- society_memberships row. Does NOT appear in the JWT — the inject_society_claims
-- hook injects role from society_memberships only.
alter table public.profiles
  add column if not exists signup_intent text
    check (signup_intent in ('secretary', 'member'));

comment on column public.profiles.signup_intent is
  'Role chosen on the Phase 2 onboard screen (secretary|member). Consumed by Phase 3 to build the society_memberships row. Never injected into the JWT.';

-- 2. otp_requests — per-phone OTP rate-limit ledger.
-- Written ONLY by the send-sms Edge Function using the service-role key.
-- No RLS: clients never read or write this table directly.
create table if not exists public.otp_requests (
  id           bigserial primary key,
  phone        text not null,
  requested_at timestamptz not null default now()
);

create index if not exists otp_requests_phone_requested_idx
  on public.otp_requests (phone, requested_at desc);

comment on table public.otp_requests is
  'Per-phone OTP request ledger. Written by the send-sms Edge Function (service-role) to enforce AUTH-06 per-phone rate limiting. No RLS — not client-accessible. Phase 8 may add pg_cron cleanup of rows older than 24h.';

-- Explicitly revoke client access — defense in depth. This table has no RLS, so
-- default-deny does not apply; revoking grants keeps anon/authenticated locked out.
revoke all on public.otp_requests from anon, authenticated;
revoke all on sequence public.otp_requests_id_seq from anon, authenticated;
