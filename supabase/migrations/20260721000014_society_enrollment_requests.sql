-- ============================================================================
-- Society enrollment requests (lead capture)
-- ----------------------------------------------------------------------------
-- Product change: societies are no longer self-service. A chairman REQUESTS
-- enrollment (society name, their name, phone, a preferred callback slot); the
-- admin team calls them, gathers the rest, creates the society and hands over
-- the join code. This table is the front door for that.
--
-- SECURITY POSTURE — this is the only table in the product an UNAUTHENTICATED
-- visitor can write to, so it is deliberately tight:
--
--   * anon may INSERT and nothing else. No select, no update, no delete — a
--     lead list is competitor-interesting and contains personal phone numbers,
--     so it must never be readable without a session.
--   * Column-level grant, not a table grant: anon can only supply the four
--     fields a visitor legitimately fills. status/notes/handled_by/timestamps
--     are staff-owned and cannot be seeded by the submitter.
--   * CHECK constraints validate shape at the DB, not just in the form, because
--     the REST endpoint is reachable directly.
--   * A partial unique index rate-limits by phone: one OPEN request per number.
--     Re-submitting updates nothing and errors, instead of letting someone
--     flood the queue.
--
-- No RLS policy grants anon SELECT, so even a leaked anon key cannot read leads.
-- ============================================================================

create type public.enrollment_status as enum ('new', 'contacted', 'approved', 'rejected');

create table if not exists public.society_enrollment_requests (
  id             uuid primary key default gen_random_uuid(),

  -- supplied by the visitor
  society_name   text not null,
  contact_name   text not null,
  phone          text not null,
  preferred_slot text not null,

  -- staff-owned
  status         public.enrollment_status not null default 'new',
  notes          text,
  handled_by     uuid references auth.users(id) on delete set null,
  society_id     uuid references public.societies(id) on delete set null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint enrollment_society_name_len check (char_length(trim(society_name)) between 2 and 120),
  constraint enrollment_contact_name_len check (char_length(trim(contact_name)) between 2 and 80),
  -- E.164 India: +91 followed by 10 digits starting 6-9.
  constraint enrollment_phone_shape      check (phone ~ '^\+91[6-9][0-9]{9}$'),
  constraint enrollment_slot_len         check (char_length(trim(preferred_slot)) between 2 and 60)
);

-- One open request per phone number: stops the queue being flooded, and stops a
-- duplicate call being made to the same chairman.
create unique index if not exists society_enrollment_open_per_phone
  on public.society_enrollment_requests (phone)
  where status in ('new', 'contacted');

create index if not exists society_enrollment_status_created
  on public.society_enrollment_requests (status, created_at desc);

alter table public.society_enrollment_requests enable row level security;

-- Anyone on the public site may submit. They may not read anything back — the
-- insert returns no row to anon because there is no SELECT policy.
create policy society_enrollment_anon_insert
  on public.society_enrollment_requests
  for insert
  to anon, authenticated
  with check (true);

-- Deliberately NO select/update/delete policy. Staff triage happens through the
-- service role (admin tooling), which bypasses RLS. Adding a "staff can read"
-- policy would require a staff role that does not exist in this schema yet;
-- inventing one here would be a security decision made in the wrong place.

revoke all on public.society_enrollment_requests from anon, authenticated;

-- Column-level insert grant: a submitter can set ONLY these four fields. Even a
-- crafted REST call cannot pre-set status, notes, handled_by or society_id.
grant insert (society_name, contact_name, phone, preferred_slot)
  on public.society_enrollment_requests to anon, authenticated;

comment on table public.society_enrollment_requests is
  'Lead capture for society onboarding. anon may INSERT four columns only; no read path without the service role.';
