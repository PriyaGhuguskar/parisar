-- ============================================================================
-- Migration 059: private helpers + separate role fields on memberships.
--
-- Data-model rule (PLAN.md Decision 2): three separate fields.
--   resident_type  owner | tenant | family_member   (society_memberships)
--   society_title  resident | chairman | secretary | treasurer | committee_member
--                  (society_memberships; maps onto membership_role, which keeps
--                  driving permissions and the JWT hook)
--   staff role     society_staff.category
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Text / identity helpers
-- ---------------------------------------------------------------------------

-- 10-digit Indian mobile, or NULL when the value is not one. Accepts +91, 91,
-- a leading 0, spaces and dashes, and the "9876543210.0" a spreadsheet produces.
create or replace function app_private.norm_mobile(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  with d as (
    select regexp_replace(regexp_replace(coalesce(p, ''), '\.0+$', ''), '\D', '', 'g') as v
  ), t as (
    select case
             when length(v) = 10 then v
             when length(v) = 11 and left(v, 1) = '0' then right(v, 10)
             when length(v) = 12 and left(v, 2) = '91' then right(v, 10)
           end as m
      from d
  )
  select case when m ~ '^[6-9][0-9]{9}$' then m end from t
$$;
revoke all on function app_private.norm_mobile(text) from public, anon, authenticated;

-- The caller's OTP-verified 10-digit mobile. NULL for unverified / email users,
-- so "my phone matches this row" can never be true without an OTP.
create or replace function app_private.caller_phone10()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select right(regexp_replace(u.phone, '\D', '', 'g'), 10)
    from auth.users u
   where u.id = auth.uid()
     and coalesce(u.phone, '') <> ''
     and u.phone_confirmed_at is not null
$$;
revoke all on function app_private.caller_phone10() from public, anon, authenticated;

create or replace function app_private.valid_email(p text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p is not null and char_length(p) <= 254 and p ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
$$;
revoke all on function app_private.valid_email(text) from public, anon, authenticated;

-- "Rahul Sharma" -> "R**** S*****". The only form of a name an unverified person
-- ever sees. Keeps word count and first letters, caps the stars so length leaks
-- as little as possible.
create or replace function app_private.mask_name(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(string_agg(left(w, 1) || repeat('*', 4), ' '), '****')
    from regexp_split_to_table(trim(coalesce(p, '')), '\s+') as w
   where w <> ''
$$;
revoke all on function app_private.mask_name(text) from public, anon, authenticated;

-- Escape % _ \ so user search text is matched literally by ILIKE.
create or replace function app_private.like_escape(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;
revoke all on function app_private.like_escape(text) from public, anon, authenticated;

-- 1..100, default 25. Every paginated RPC goes through this.
create or replace function app_private.page_limit(p int)
returns int
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select least(greatest(coalesce(p, 25), 1), 100)
$$;
revoke all on function app_private.page_limit(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authorisation helpers (checked live against memberships, never from the JWT)
-- ---------------------------------------------------------------------------
create or replace function app_private.is_society_manager(p_society uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.has_live_role(p_society, array['secretary', 'co_secretary'])
$$;
revoke all on function app_private.is_society_manager(uuid) from public, anon, authenticated;

-- Society manager or Parisar staff. Raises otherwise; the error is the same for
-- "not your society" and "no such society" so ids cannot be probed.
create or replace function app_private.assert_can_manage(p_society uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (app_private.is_society_manager(p_society) or public.is_platform_admin_or_sales()) then
    raise exception 'NOT_SOCIETY_MANAGER';
  end if;
  if not exists (select 1 from public.societies s where s.id = p_society) then
    raise exception 'NOT_SOCIETY_MANAGER';
  end if;
end;
$$;
revoke all on function app_private.assert_can_manage(uuid) from public, anon, authenticated;

-- Society manager only. For anything holding resident names, phones or proofs:
-- the staff console deliberately shows none of those, so staff get no path here.
create or replace function app_private.assert_manager(p_society uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not app_private.is_society_manager(p_society) then
    raise exception 'NOT_SOCIETY_MANAGER';
  end if;
end;
$$;
revoke all on function app_private.assert_manager(uuid) from public, anon, authenticated;

create or replace function app_private.assert_platform_staff()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin_or_sales() then raise exception 'NOT_PLATFORM_STAFF'; end if;
end;
$$;
revoke all on function app_private.assert_platform_staff() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
-- A raised error rolls the hit back, but by then the limit is already reached,
-- so the bucket stays full. RPCs that must count FAILED attempts (lookups, tokens)
-- return {error: ...} instead of raising, so their hit commits.
create or replace function app_private.assert_rate(
  p_bucket text,
  p_subject text,
  p_max int,
  p_seconds int,
  p_error text default 'RATE_LIMITED'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.svc_rate_limit_hit(p_bucket, p_subject, p_max, p_seconds) then
    raise exception '%', p_error;
  end if;
end;
$$;
revoke all on function app_private.assert_rate(text, text, int, int, text) from public, anon, authenticated;

-- Best-effort client address for anonymous rate limits. Headers can be forged
-- when no trusted proxy overwrites them, so this is never the only limit: public
-- RPCs also limit per phone and throttle_public_lead caps total volume.
create or replace function app_private.caller_ip()
returns text
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_h   jsonb;
  v_xff text[];
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return 'unknown';
  end;
  if v_h is null then return 'unknown'; end if;
  if coalesce(v_h ->> 'cf-connecting-ip', '') <> '' then return v_h ->> 'cf-connecting-ip'; end if;
  if coalesce(v_h ->> 'x-real-ip', '') <> '' then return v_h ->> 'x-real-ip'; end if;
  v_xff := string_to_array(coalesce(v_h ->> 'x-forwarded-for', ''), ',');
  if coalesce(array_length(v_xff, 1), 0) > 0 then
    return trim(v_xff[array_length(v_xff, 1)]);   -- last hop = added by our proxy
  end if;
  return 'unknown';
end;
$$;
revoke all on function app_private.caller_ip() from public, anon, authenticated;

-- A society code typed by someone with no membership yet. Same throttle and
-- failure ledger as onboard_flats_for_code. Returns {society_id} or {error}; never
-- raises for a bad code, so the failure is recorded.
create or replace function app_private.resolve_join_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.society_codes;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_code_attempts_ok(v_uid);

  select * into v_row from public.society_codes
   where code = upper(trim(coalesce(p_code, ''))) and revoked_at is null;
  if not found then
    perform app_private.record_code_failure(v_uid, 'INVALID_CODE');
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if v_row.paused_at is not null then
    perform app_private.record_code_failure(v_uid, 'CODE_PAUSED');
    return jsonb_build_object('error', 'CODE_PAUSED');
  end if;
  if not public.society_accepts_joins(v_row.society_id) then
    return jsonb_build_object('error', 'SOCIETY_BLOCKED');
  end if;
  return jsonb_build_object('society_id', v_row.society_id);
end;
$$;
revoke all on function app_private.resolve_join_code(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Separate role fields on memberships
-- ---------------------------------------------------------------------------
alter table public.society_memberships
  add column if not exists resident_type text,
  add column if not exists society_title text;

alter table public.society_memberships
  drop constraint if exists society_memberships_resident_type_check;
alter table public.society_memberships
  add constraint society_memberships_resident_type_check
  check (resident_type is null or resident_type in ('owner', 'tenant', 'family_member'));

alter table public.society_memberships
  drop constraint if exists society_memberships_society_title_check;
alter table public.society_memberships
  add constraint society_memberships_society_title_check
  check (society_title is null
         or society_title in ('resident', 'chairman', 'secretary', 'treasurer', 'committee_member'));

comment on column public.society_memberships.resident_type is
  'owner | tenant | family_member. Separate from role and from staff category.';
comment on column public.society_memberships.society_title is
  'Display title. Maps onto role (see society_title_role); NULL means the default title for the role.';

-- Title -> permission role. The single place this mapping lives.
create or replace function app_private.society_title_role(p_title text)
returns public.membership_role
language sql
immutable
set search_path = public, pg_temp
as $$
  select (case p_title
            when 'resident'         then 'member'
            when 'committee_member' then 'board_member'
            when 'treasurer'        then 'co_secretary'
            when 'secretary'        then 'secretary'
            when 'chairman'         then 'secretary'
          end)::public.membership_role
$$;
revoke all on function app_private.society_title_role(text) from public, anon, authenticated;

-- The title to show when none was chosen.
create or replace function app_private.effective_title(
  p_title text,
  p_role public.membership_role
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_title, case p_role
    when 'member'       then 'resident'
    when 'board_member' then 'committee_member'
    when 'co_secretary' then 'treasurer'
    when 'secretary'    then 'secretary'
  end)
$$;
revoke all on function app_private.effective_title(text, public.membership_role) from public, anon, authenticated;

-- Every insert gets a resident type, whichever older RPC created the row.
create or replace function app_private.membership_defaults()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.resident_type := coalesce(new.resident_type, new.residency::text);
  return new;
end;
$$;
revoke all on function app_private.membership_defaults() from public, anon, authenticated;
drop trigger if exists membership_defaults on public.society_memberships;
create trigger membership_defaults
  before insert on public.society_memberships
  for each row execute function app_private.membership_defaults();

-- set_membership_role / transfer_secretary_role change role directly. A title
-- that no longer maps to the new role must not linger.
create or replace function app_private.membership_title_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and new.society_title is not null
     and app_private.society_title_role(new.society_title) <> new.role then
    new.society_title := null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.membership_title_sync() from public, anon, authenticated;
drop trigger if exists membership_title_sync on public.society_memberships;
create trigger membership_title_sync
  before update of role on public.society_memberships
  for each row execute function app_private.membership_title_sync();

-- claim_family_membership copies the primary's residency, so mark the claimant as
-- family when they actually share that primary's flat.
create or replace function app_private.family_claim_sets_type()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.claimed_user_id is not null and old.claimed_user_id is null then
    update public.society_memberships m
       set resident_type = 'family_member'
      from public.society_memberships p
     where p.id = new.membership_id
       and m.society_id = new.society_id
       and m.user_id = new.claimed_user_id
       and m.flat_id = p.flat_id
       and m.id <> p.id
       and m.status = 'active';
  end if;
  return new;
end;
$$;
revoke all on function app_private.family_claim_sets_type() from public, anon, authenticated;
drop trigger if exists family_claim_sets_type on public.family_members;
create trigger family_claim_sets_type
  after update of claimed_user_id on public.family_members
  for each row execute function app_private.family_claim_sets_type();

-- Backfill: residency first, then family members who already claimed.
update public.society_memberships
   set resident_type = residency::text
 where resident_type is null;

update public.society_memberships m
   set resident_type = 'family_member'
  from public.family_members fm
  join public.society_memberships p on p.id = fm.membership_id
 where fm.claimed_user_id = m.user_id
   and fm.society_id = m.society_id
   and m.flat_id = p.flat_id
   and m.id <> p.id;
