-- ============================================================================
-- Platform: feature catalogue, per-society entitlements, billing record, notes
-- ----------------------------------------------------------------------------
-- The staff console needs to answer four questions about any society:
--   what can they use · what are they paying · who do we call · what happened
--
-- SCOPE NOTE ON "PAYMENT": this records what a society is billed and whether it
-- has paid. It is NOT a payment gateway and never touches a resident's money —
-- PROJECT.md rules that out, and the landing page promises it. Money moving is
-- somebody else's system; this is the ledger staff read during a call.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The catalogue: what Parisar sells.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_features (
  key            text primary key,
  name           text not null,
  description    text not null,
  price_monthly  integer not null default 0,   -- paise-free: whole rupees
  is_core        boolean not null default false, -- core = always on, never billed
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  constraint feature_price_non_negative check (price_monthly >= 0)
);

alter table public.platform_features enable row level security;

-- Every signed-in user may READ the catalogue (a chairman should be able to see
-- what exists and what it costs). Only the service role may change it — pricing
-- is not something an admin should edit from a browser by accident.
create policy features_read_all on public.platform_features
  for select to authenticated using (true);
grant select on public.platform_features to authenticated;

comment on table public.platform_features is
  'What Parisar sells. price_monthly is whole rupees. is_core features are always on and never billed.';

-- ---------------------------------------------------------------------------
-- 2. Entitlements: what a given society may actually use.
--
-- ABSENCE MEANS DISABLED for non-core features. That is deliberate — a society
-- gets nothing extra by default, so a mistake fails closed rather than handing
-- out paid features for free.
-- ---------------------------------------------------------------------------
create table if not exists public.society_features (
  society_id  uuid not null references public.societies(id) on delete cascade,
  feature_key text not null references public.platform_features(key) on delete cascade,
  enabled     boolean not null default true,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (society_id, feature_key)
);

alter table public.society_features enable row level security;

-- A society may read its OWN entitlements (the app needs this to hide features
-- it has not bought). It may never write them.
create policy society_features_own_read on public.society_features
  for select to authenticated
  using (society_id = public.current_society_id() or society_id = public.admin_viewing_society());
grant select on public.society_features to authenticated;

comment on table public.society_features is
  'Per-society feature grants. A missing row means DISABLED for non-core features — mistakes fail closed.';

-- ---------------------------------------------------------------------------
-- 3. Billing record. Ledger only: no gateway, no card data, no resident money.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.billing_status as enum ('trial','active','past_due','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.society_billing (
  society_id     uuid primary key references public.societies(id) on delete cascade,
  plan           text not null default 'sprout',
  status         public.billing_status not null default 'trial',
  monthly_amount integer not null default 0,
  currency       text not null default 'INR',
  started_on     date,
  next_due_on    date,
  last_paid_on   date,
  notes          text,
  updated_at     timestamptz not null default now(),
  constraint billing_amount_non_negative check (monthly_amount >= 0)
);

alter table public.society_billing enable row level security;
-- No policy: staff-only, read through the admin RPC below.
revoke all on public.society_billing from anon, authenticated;

comment on table public.society_billing is
  'What a society is billed and whether they have paid. A ledger staff read on a call — NOT a payment gateway, and never touches resident money.';

-- ---------------------------------------------------------------------------
-- 4. Follow-up notes: what was said on the last call.
-- ---------------------------------------------------------------------------
create table if not exists public.society_notes (
  id         uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint note_body_len check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists society_notes_society_created
  on public.society_notes (society_id, created_at desc);

alter table public.society_notes enable row level security;
-- Staff-only. A chairman should NOT read internal call notes about their own
-- society — staff need to be able to write "chased twice, still unresponsive".
revoke all on public.society_notes from anon, authenticated;

comment on table public.society_notes is
  'Internal staff follow-up log. Deliberately NOT readable by the society itself, so staff can be candid.';

-- ---------------------------------------------------------------------------
-- 5. Seed the catalogue from what the product actually ships today.
--    Prices are PLACEHOLDERS — set them to whatever you actually charge.
-- ---------------------------------------------------------------------------
insert into public.platform_features (key, name, description, price_monthly, is_core, sort_order) values
  ('notices',      'Notice Board',        'Post a notice that reaches every flat instantly.',            0, true,  10),
  ('complaints',   'Complaints & Issues', 'Residents raise issues; the committee tracks them to closed.', 0, true,  20),
  ('community',    'Neighbour Chat',      'Society-wide posts, questions and replies.',                 299, false, 30),
  ('bookings',     'Events & Bookings',   'Clubhouse and amenity booking with committee approval.',     399, false, 40),
  ('polls',        'Polls & Decisions',   'Ask the society to vote and watch the count settle.',        199, false, 50),
  ('directory',    'Resident Directory',  'Every resident by wing and flat, with phone privacy.',       199, false, 60),
  ('flat_actions', 'Flat Notices',        'Record warnings, fines and notices against a flat.',         299, false, 70),
  ('moderation',   'Community Moderation','Review and hide reported posts.',                            149, false, 80)
on conflict (key) do nothing;

-- Existing societies keep everything they already had — switching entitlements
-- on retroactively would silently remove working features from live societies.
insert into public.society_features (society_id, feature_key, enabled)
select s.id, f.key, true from public.societies s cross join public.platform_features f
on conflict (society_id, feature_key) do nothing;

insert into public.society_billing (society_id, plan, status, monthly_amount, started_on)
select s.id, 'sprout', 'trial', 0, current_date from public.societies s
on conflict (society_id) do nothing;
