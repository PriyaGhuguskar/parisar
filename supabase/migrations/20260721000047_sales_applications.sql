-- ============================================================================
-- Salesperson applications (public lead capture)
-- ----------------------------------------------------------------------------
-- The landing footer offers "Work as a salesperson". This is where that form
-- lands: a name, a phone number, and an explicit yes.
--
-- SECURITY POSTURE — copied deliberately from society_enrollment_requests
-- (…014), because this is the SECOND table an unauthenticated visitor can write
-- to and it holds the same class of data: a personal name and phone number.
--
--   * anon may INSERT and nothing else. No select, no update, no delete.
--   * Column-level grant, not a table grant: a submitter can set only the three
--     fields the form legitimately collects. status/notes/handled_by are
--     staff-owned and cannot be seeded from a crafted REST call.
--   * CHECK constraints validate shape in the DB, because the REST endpoint is
--     reachable directly and the form's own validation is only a courtesy.
--   * A partial unique index rate-limits by phone: one OPEN application per
--     number, so the queue cannot be flooded by resubmitting.
--
-- ONE DELIBERATE DIFFERENCE FROM …014. That migration noted it could not add a
-- staff read policy because "a staff role that does not exist in this schema
-- yet". It does now — is_platform_admin_or_sales(), added in …045 — so this
-- table gets the read policy …014 wanted. Without one the applications would be
-- write-only, reachable solely by the service role, which makes a form nobody
-- can action.
--
-- Reuses public.enrollment_status rather than inventing a parallel enum: the
-- triage lifecycle is identical (new → contacted → approved/rejected).
-- ============================================================================

create table if not exists public.sales_applications (
  id          uuid primary key default gen_random_uuid(),

  -- supplied by the visitor
  full_name   text not null,
  phone       text not null,
  willing     boolean not null,

  -- staff-owned
  status      public.enrollment_status not null default 'new',
  notes       text,
  handled_by  uuid references auth.users(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint sales_app_name_len  check (char_length(trim(full_name)) between 2 and 80),
  -- E.164 India: +91 followed by 10 digits starting 6-9.
  constraint sales_app_phone_shape check (phone ~ '^\+91[6-9][0-9]{9}$'),
  -- The checkbox is the point of the form. A row with willing=false is someone
  -- who said no, which is not an application — reject it at the database rather
  -- than filtering it out of every query forever.
  constraint sales_app_must_be_willing check (willing is true)
);

create unique index if not exists sales_applications_open_per_phone
  on public.sales_applications (phone)
  where status in ('new', 'contacted');

create index if not exists sales_applications_status_created
  on public.sales_applications (status, created_at desc);

alter table public.sales_applications enable row level security;

-- Anyone on the public site may apply. They may not read anything back: the
-- insert returns no row to anon because there is no anon SELECT policy.
create policy sales_applications_anon_insert
  on public.sales_applications
  for insert
  to anon, authenticated
  with check (true);

-- Platform staff triage. Admin and sales only — role='staff' is excluded by
-- is_platform_admin_or_sales(), consistent with every other platform surface.
create policy sales_applications_staff_read
  on public.sales_applications
  for select to authenticated
  using (public.is_platform_admin_or_sales());

create policy sales_applications_staff_update
  on public.sales_applications
  for update to authenticated
  using (public.is_platform_admin_or_sales())
  with check (public.is_platform_admin_or_sales());

revoke all on public.sales_applications from anon, authenticated;

-- Column-level insert grant: three fields, nothing else.
grant insert (full_name, phone, willing) on public.sales_applications to anon, authenticated;
grant select, update on public.sales_applications to authenticated;

comment on table public.sales_applications is
  'Salesperson applications from the public site. anon may INSERT three columns only; platform admin/sales read and triage.';
