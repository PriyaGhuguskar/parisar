-- ============================================================================
-- Staff directory + Facility calendar.
--
-- Staff directory: a SHARED contact list of local help (maid, driver, cook,
-- electrician, plumber, gardener). Any resident can add; everyone sees; the
-- adder is attributed. This is contacts only — NOT staff attendance (that stays
-- out of scope per PROJECT.md).
--
-- Facility calendar: society-ops schedule (water shutdown, lift maintenance,
-- events, garbage). The secretary schedules; everyone sees; the next upcoming
-- event auto-surfaces on the home highlights strip.
-- ============================================================================

do $$ begin
  create type public.staff_category as enum
    ('maid', 'driver', 'cook', 'electrician', 'plumber', 'gardener', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.facility_category as enum
    ('water_shutdown', 'lift_maintenance', 'society_event', 'garbage_collection', 'other');
exception when duplicate_object then null; end $$;

-- ---- Staff directory ------------------------------------------------------
create table if not exists public.society_staff (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references public.societies(id) on delete cascade,
  name          text not null,
  phone         text,
  category      public.staff_category not null default 'other',
  added_by      uuid references auth.users(id) on delete set null,
  added_by_name text,                         -- denormalized attribution ("added by")
  added_by_flat text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_society_staff_society on public.society_staff(society_id, category);

comment on table public.society_staff is
  'Shared contact directory of local help. Any resident adds; everyone reads; adder is attributed. Contacts only, not attendance.';

alter table public.society_staff enable row level security;
create policy society_staff_read on public.society_staff
  for select to authenticated
  using (society_id = public.current_society_id());
alter publication supabase_realtime add table public.society_staff;

-- ---- Facility calendar ----------------------------------------------------
create table if not exists public.facility_events (
  id         uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  category   public.facility_category not null,
  title      text not null,
  note       text,
  starts_at  timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_facility_events_society on public.facility_events(society_id, starts_at);

comment on table public.facility_events is
  'Society-ops schedule (water shutdown, lift maintenance, events, garbage). Secretary-managed; next upcoming event surfaces on home highlights.';

alter table public.facility_events enable row level security;
create policy facility_events_read on public.facility_events
  for select to authenticated
  using (society_id = public.current_society_id());
alter publication supabase_realtime add table public.facility_events;
