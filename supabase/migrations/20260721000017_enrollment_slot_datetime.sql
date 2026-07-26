-- ============================================================================
-- Enrollment callback slot: real date + time, or "right now"
-- ----------------------------------------------------------------------------
-- The first cut stored preferred_slot as free text from four fixed buckets
-- ("Weekday morning · 9am-12pm"). That cannot express "call me now", cannot be
-- sorted into a call queue, and cannot be checked for being in the past.
--
-- Now:
--   call_now      = true  -> the caller wants a call immediately
--   preferred_at  = the requested moment, when they picked one
--   preferred_slot stays as the human-readable label the visitor saw, so the
--                  admin queue shows exactly what was on screen at submit time.
--
-- BACK-DATED ENTRIES ARE REJECTED IN THE DATABASE.
-- A CHECK constraint cannot reference now() (it must be immutable), so this is a
-- BEFORE INSERT trigger. That matters: the REST endpoint is reachable directly,
-- so form-side validation alone would let anyone POST a request dated 1990 and
-- quietly poison the call queue's ordering.
--
-- The 2-minute grace absorbs clock skew between the visitor's device and the
-- server — without it, someone selecting "in 1 minute" on a slightly-fast phone
-- gets an error they cannot understand or fix.
-- ============================================================================

alter table public.society_enrollment_requests
  add column if not exists preferred_at timestamptz,
  add column if not exists call_now     boolean not null default false;

create or replace function public.enrollment_validate_slot()
returns trigger
language plpgsql
as $$
begin
  -- Exactly one of the two ways of asking must be present.
  if new.call_now is not true and new.preferred_at is null then
    raise exception 'SLOT_REQUIRED';
  end if;

  if new.call_now is true then
    -- "Right now" carries its own meaning; a stale timestamp alongside it would
    -- just be noise in the queue.
    new.preferred_at := null;
  else
    if new.preferred_at < now() - interval '2 minutes' then
      raise exception 'SLOT_IN_PAST';
    end if;
    -- Nobody schedules a callback a year out; this is a typo, not an intent.
    if new.preferred_at > now() + interval '90 days' then
      raise exception 'SLOT_TOO_FAR';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enrollment_validate_slot_trg on public.society_enrollment_requests;
create trigger enrollment_validate_slot_trg
  before insert on public.society_enrollment_requests
  for each row execute function public.enrollment_validate_slot();

-- Call queue ordering: "right now" first, then soonest requested time.
create index if not exists society_enrollment_queue_order
  on public.society_enrollment_requests (call_now desc, preferred_at asc)
  where status in ('new', 'contacted');

-- Extend the anon column grant to the two new fields. Everything else on this
-- table stays staff-owned and unreachable from the public form.
grant insert (society_name, contact_name, phone, preferred_slot, preferred_at, call_now)
  on public.society_enrollment_requests to anon, authenticated;

comment on column public.society_enrollment_requests.preferred_at is
  'Requested callback moment. Trigger-enforced: never in the past, never beyond 90 days.';
comment on column public.society_enrollment_requests.call_now is
  'Caller asked to be rung immediately; preferred_at is nulled when true.';
