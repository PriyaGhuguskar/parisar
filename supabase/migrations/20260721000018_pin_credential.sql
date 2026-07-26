-- ============================================================================
-- Credential state: has this resident set their PIN yet?
-- ----------------------------------------------------------------------------
-- The new sign-in flow is: phone + society code (first time) -> finish onboarding
-- -> set a 4-digit PIN -> phone + PIN from then on.
--
-- Supabase Auth is doing the real work: the code, and later the PIN, are set as
-- the user's PASSWORD via the admin API, and sign-in is signInWithPassword.
-- That means Supabase hashes the secret (bcrypt), rate-limits attempts, and
-- issues the session. We are NOT hand-rolling JWTs — CLAUDE.md rules that out
-- explicitly, and it would mean reimplementing auth badly.
--
-- ----------------------------------------------------------------------------
-- WHY THIS FLAG EXISTS, and why the code MUST stop working once a PIN is set.
--
-- Code sign-in works by writing the society code into the user's password. If
-- that path stayed open after someone set a PIN, then anyone entering that
-- resident's phone number plus the society code — which every resident has —
-- would RESET the victim's password back to the shared code. The resident's PIN
-- would silently stop working and they would be locked out of their own account
-- by a neighbour.
--
-- So this is not a hardening preference. Leaving both paths open is incoherent:
-- the PIN would protect nothing and would actively break for the people who set
-- one. pin_set closes the code path per-user the moment they have their own
-- credential.
--
-- Recovery for a forgotten PIN is therefore a deliberate, logged action by the
-- society chairman (see reset_member_pin below) rather than "just use the code
-- again" — which would reopen exactly the hole this closes.
-- ============================================================================

alter table public.profiles
  add column if not exists pin_set    boolean not null default false,
  add column if not exists pin_set_at timestamptz;

comment on column public.profiles.pin_set is
  'True once the resident has chosen their own 4-digit PIN. While true, society-code sign-in is refused for this user — otherwise a neighbour could reset their credential back to the shared code.';

-- ---------------------------------------------------------------------------
-- mark_pin_set — called after the resident sets their PIN.
-- The PIN itself is never stored here; Supabase Auth holds the hash. This only
-- records that the transition happened, so the code path can be closed.
-- ---------------------------------------------------------------------------
create or replace function public.mark_pin_set()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  update public.profiles
     set pin_set = true,
         pin_set_at = now()
   where user_id = v_user_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (public.current_society_id(), v_user_id, 'pin.set', 'profiles', v_user_id, '{}'::jsonb);
end;
$$;

grant execute on function public.mark_pin_set() to authenticated;

-- ---------------------------------------------------------------------------
-- reset_member_pin — the chairman's recovery path for a forgotten PIN.
--
-- Clears the flag so that resident may sign in with the society code once more
-- and choose a new PIN. Chairman-only and audited, because it briefly reopens
-- the weaker credential for that person: it must be a decision someone made and
-- can be held to, not a self-service loop an attacker can drive.
-- ---------------------------------------------------------------------------
create or replace function public.reset_member_pin(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
begin
  if v_actor_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;
  if public.current_membership_role() <> 'secretary' then
    raise exception 'ONLY_SECRETARY_CAN_RESET_PIN';
  end if;

  -- Target must be an active member of the CALLER'S society (threat T-04.1-01).
  if not exists (
    select 1 from public.society_memberships
    where user_id = p_target_user_id and society_id = v_society_id and status = 'active'
  ) then
    raise exception 'TARGET_NOT_IN_SOCIETY';
  end if;

  update public.profiles
     set pin_set = false, pin_set_at = null
   where user_id = p_target_user_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_society_id, v_actor_id, 'pin.reset', 'profiles', p_target_user_id,
          jsonb_build_object('target_user_id', p_target_user_id));
end;
$$;

grant execute on function public.reset_member_pin(uuid) to authenticated;

comment on function public.reset_member_pin(uuid) is
  'Chairman-only. Reopens society-code sign-in for one resident who forgot their PIN. Audited, because it temporarily restores the weaker credential.';
