-- Phase 1 — Foundation: Initial tenancy schema
-- Implements ARCHITECTURE.md pseudo-DDL lines 429-509 (foundation subset only).
-- DOES NOT include: complaints, notifications, polls, posts, bookings, flat_actions,
-- attachments, audit_log — those land in their respective phases.

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============== Tenancy roots ==============

create table if not exists public.societies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.society_codes (
  code        text primary key,
  society_id  uuid not null references public.societies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists idx_society_codes_society on public.society_codes(society_id);

create table if not exists public.wings (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  name        text not null,
  unique (society_id, name)
);

create index if not exists idx_wings_society on public.wings(society_id);

create table if not exists public.flats (
  id          uuid primary key default gen_random_uuid(),
  society_id  uuid not null references public.societies(id) on delete cascade,
  wing_id     uuid not null references public.wings(id) on delete cascade,
  number      text not null,
  unique (society_id, wing_id, number)
);

create index if not exists idx_flats_society on public.flats(society_id);

-- ============== People ==============

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text not null unique,
  created_at  timestamptz not null default now()
);

-- Postgres enum types — mirror packages/shared-types/src/enums.js
do $$ begin
  create type public.residency_kind as enum ('owner', 'tenant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_role as enum ('member', 'board_member', 'co_secretary', 'secretary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.household_kind as enum ('family', 'bachelor');
exception when duplicate_object then null; end $$;

create table if not exists public.society_memberships (
  id                  uuid primary key default gen_random_uuid(),
  society_id          uuid not null references public.societies(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  flat_id             uuid not null references public.flats(id) on delete restrict,
  role                public.membership_role not null default 'member',
  residency           public.residency_kind not null,
  household           public.household_kind not null,
  emergency_contact   text,
  joined_at           timestamptz not null default now(),
  status              text not null default 'active',
  unique (society_id, user_id, flat_id)
);

create index if not exists idx_society_memberships_society_role on public.society_memberships(society_id, role);
create index if not exists idx_society_memberships_user on public.society_memberships(user_id);
create index if not exists idx_society_memberships_active_flat on public.society_memberships(flat_id) where status = 'active';
-- Hot path for the auth hook: look up an active membership by user_id quickly.
create index if not exists idx_society_memberships_user_active on public.society_memberships(user_id, society_id) where status = 'active';

create table if not exists public.family_members (
  id              uuid primary key default gen_random_uuid(),
  society_id      uuid not null references public.societies(id) on delete cascade,
  membership_id   uuid not null references public.society_memberships(id) on delete cascade,
  full_name       text not null,
  phone           text
);

create index if not exists idx_family_members_membership on public.family_members(membership_id);
create index if not exists idx_family_members_society on public.family_members(society_id);

-- ============== Push tokens (declared in Phase 1, populated in Phase 4) ==============

create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  expo_token      text not null unique,
  platform        text not null check (platform in ('ios', 'android', 'web')),
  device_label    text,
  last_seen_at    timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);
