-- ============================================================================
-- Migration 065: resident records and the link-to-flat helper.
--
-- A resident record is what the society says about a person before that person
-- has proven anything: name, mobile, flat, resident type, verification status. It
-- grants nothing. The person proves the mobile by OTP and confirms it (067), and
-- only then does a membership exist.
--
-- One phone holds one live record per society (Decision 3: one person, one
-- membership). A rejected record frees the phone so it can be imported again.
-- ============================================================================

create table if not exists public.resident_import_batches (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references public.societies(id) on delete cascade,
  file_name     text,
  status        text not null default 'validated',
  total_rows    int not null default 0,
  valid_rows    int not null default 0,
  warning_rows  int not null default 0,
  error_rows    int not null default 0,
  imported_rows int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  confirmed_by  uuid references auth.users(id) on delete set null,
  confirmed_at  timestamptz,
  constraint resident_import_batches_status check (status in ('validated', 'confirmed', 'cancelled')),
  constraint resident_import_batches_file_name_len check (file_name is null or char_length(file_name) <= 200)
);
create index if not exists idx_resident_import_batches_society
  on public.resident_import_batches (society_id, created_at desc);

create table if not exists public.resident_records (
  id                 uuid primary key default gen_random_uuid(),
  society_id         uuid not null references public.societies(id) on delete cascade,
  flat_id            uuid not null references public.flats(id) on delete restrict,
  full_name          text not null,
  phone10            text not null,
  email              text,
  resident_type      text not null,
  status             text not null default 'pending',
  source             text not null default 'import',
  batch_id           uuid references public.resident_import_batches(id) on delete set null,
  user_id            uuid references auth.users(id) on delete set null,
  membership_id      uuid references public.society_memberships(id) on delete set null,
  proposed_changes   jsonb,
  correction_note    text,
  reported_incorrect boolean not null default false,
  rejection_reason   text,
  verified_at        timestamptz,
  reviewed_by        uuid references auth.users(id) on delete set null,
  reviewed_at        timestamptz,
  invite_prepared_at timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint resident_records_type check (resident_type in ('owner', 'tenant', 'family_member')),
  constraint resident_records_status check (status in ('pending', 'verified', 'rejected', 'needs_correction')),
  constraint resident_records_source check (source in ('import', 'manual')),
  constraint resident_records_phone check (phone10 ~ '^[6-9][0-9]{9}$'),
  constraint resident_records_name_len check (char_length(trim(full_name)) between 2 and 80),
  constraint resident_records_email_len check (email is null or char_length(email) <= 254),
  constraint resident_records_note_len check (correction_note is null or char_length(correction_note) <= 500),
  constraint resident_records_reason_len check (rejection_reason is null or char_length(rejection_reason) <= 500)
);
create unique index if not exists resident_records_live_phone_key
  on public.resident_records (society_id, phone10) where status <> 'rejected';
create index if not exists idx_resident_records_society_status
  on public.resident_records (society_id, status, created_at desc);
create index if not exists idx_resident_records_phone on public.resident_records (phone10);
create index if not exists idx_resident_records_flat on public.resident_records (flat_id);

create table if not exists public.resident_import_rows (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.resident_import_batches(id) on delete cascade,
  society_id   uuid not null references public.societies(id) on delete cascade,
  row_number   int not null,
  raw          jsonb not null,
  status       text not null,
  errors       jsonb not null default '[]'::jsonb,
  warnings     jsonb not null default '[]'::jsonb,
  mobile       text,
  flat_id      uuid references public.flats(id) on delete set null,
  normalized   jsonb,
  record_id    uuid references public.resident_records(id) on delete set null,
  constraint resident_import_rows_status check (status in ('valid', 'warning', 'error', 'imported'))
);
create index if not exists idx_resident_import_rows_batch
  on public.resident_import_rows (batch_id, row_number);

-- RPC-only: phones and proofs of identity live here, so no client policy at all.
alter table public.resident_import_batches enable row level security;
alter table public.resident_import_rows enable row level security;
alter table public.resident_records enable row level security;
revoke all on public.resident_import_batches from anon, authenticated;
revoke all on public.resident_import_rows from anon, authenticated;
revoke all on public.resident_records from anon, authenticated;

drop trigger if exists guard_society_service on public.resident_import_batches;
create trigger guard_society_service
  before insert or update or delete on public.resident_import_batches
  for each row execute function public.guard_society_service_write();
drop trigger if exists guard_society_service on public.resident_records;
create trigger guard_society_service
  before insert or update or delete on public.resident_records
  for each row execute function public.guard_society_service_write();

-- ---------------------------------------------------------------------------
-- link_member_to_flat: the single way the new flows put a person on a flat.
-- Enforces one membership per person per society and never creates a second row
-- for someone already there. Any live resident record for this person and flat is
-- marked verified at the same time, so nothing ends up duplicated.
-- ---------------------------------------------------------------------------
create or replace function app_private.link_member_to_flat(
  p_society   uuid,
  p_user      uuid,
  p_flat      uuid,
  p_residency public.residency_kind,
  p_type      text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mem   public.society_memberships;
  v_id    uuid;
  v_phone text;
begin
  if not exists (select 1 from public.flats f where f.id = p_flat and f.society_id = p_society) then
    raise exception 'FLAT_NOT_IN_SOCIETY';
  end if;
  if not public.society_accepts_joins(p_society) then raise exception 'SOCIETY_BLOCKED'; end if;

  select u.phone into v_phone from auth.users u where u.id = p_user;

  -- Removed by the society: no way back unless an authority row was deliberately
  -- re-added for them (same rule as onboard_resident in 054).
  if exists (select 1 from public.society_memberships m
              where m.society_id = p_society and m.user_id = p_user and m.status = 'deleted')
     and not exists (select 1 from public.society_authorities a
                      where a.society_id = p_society and a.user_id = p_user) then
    raise exception 'MEMBERSHIP_REMOVED';
  end if;

  insert into public.profiles (user_id, full_name, phone)
  values (p_user, p_full_name, '+' || coalesce(v_phone, ''))
  on conflict (user_id) do update
    set full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name);

  select * into v_mem from public.society_memberships m
   where m.society_id = p_society and m.user_id = p_user and m.status = 'active'
   order by (m.flat_id is not null) desc
   limit 1
   for update;

  if v_mem.id is not null then
    if v_mem.flat_id is not null and v_mem.flat_id <> p_flat then
      raise exception 'ALREADY_MEMBER_OTHER_FLAT';
    end if;
    update public.society_memberships
       set flat_id = p_flat, residency = p_residency,
           resident_type = case when flat_id is null then p_type else coalesce(resident_type, p_type) end
     where id = v_mem.id;
    v_id := v_mem.id;
  else
    -- A claim on any other flat lapses: one person, one membership.
    update public.society_memberships
       set status = 'rejected'
     where society_id = p_society and user_id = p_user
       and status = 'pending_review' and flat_id is distinct from p_flat;

    update public.society_memberships
       set status = 'active', residency = p_residency, resident_type = p_type, joined_at = now()
     where society_id = p_society and user_id = p_user and flat_id = p_flat
    returning id into v_id;

    if v_id is null then
      insert into public.society_memberships
        (society_id, user_id, flat_id, role, residency, household, resident_type, status, joined_at)
      values (p_society, p_user, p_flat, 'member', p_residency, 'family', p_type, 'active', now())
      returning id into v_id;
    end if;
  end if;

  update public.resident_records r
     set status = 'verified', user_id = p_user, membership_id = v_id,
         verified_at = coalesce(r.verified_at, now()), updated_at = now()
   where r.society_id = p_society and r.flat_id = p_flat
     and r.status in ('pending', 'needs_correction')
     and r.phone10 = right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10);

  return v_id;
end;
$$;
revoke all on function app_private.link_member_to_flat(uuid, uuid, uuid, public.residency_kind, text, text)
  from public, anon, authenticated;

-- Family row for a person who just joined a flat, claimed by them. Reuses an
-- unclaimed entry for their phone on that flat instead of adding another. Returns
-- NULL when the flat has nobody for the row to hang off (membership_id is NOT NULL).
create or replace function app_private.ensure_family_row(
  p_society  uuid,
  p_user     uuid,
  p_flat     uuid,
  p_name     text,
  p_phone10  text,
  p_relation text,
  p_primary  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primary uuid := p_primary;
  v_id      uuid;
begin
  select fm.id into v_id from public.family_members fm
   where fm.society_id = p_society and fm.claimed_user_id = p_user limit 1;
  if v_id is not null then return v_id; end if;

  if v_primary is null then
    select m.id into v_primary from public.society_memberships m
     where m.society_id = p_society and m.flat_id = p_flat and m.status = 'active'
       and m.user_id <> p_user and m.resident_type in ('owner', 'tenant')
     order by (m.resident_type = 'owner') desc, m.joined_at
     limit 1;
  end if;
  if v_primary is null then return null; end if;

  select fm.id into v_id
    from public.family_members fm
    join public.society_memberships m on m.id = fm.membership_id
   where fm.society_id = p_society and fm.claimed_user_id is null
     and fm.phone10 = p_phone10 and m.flat_id = p_flat
   limit 1;

  if v_id is not null then
    update public.family_members set claimed_user_id = p_user where id = v_id;
    return v_id;
  end if;

  insert into public.family_members
    (society_id, membership_id, full_name, phone, relation, is_resident, claimed_user_id)
  values (p_society, v_primary, p_name,
          case when p_phone10 is not null then '+91' || p_phone10 end, p_relation, true, p_user)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function app_private.ensure_family_row(uuid, uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
