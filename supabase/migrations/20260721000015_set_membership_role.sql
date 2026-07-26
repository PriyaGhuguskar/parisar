-- ============================================================================
-- set_membership_role — let the chairman appoint (and un-appoint) office holders
-- ----------------------------------------------------------------------------
-- GAP THIS CLOSES: the only role-mutating RPCs were transfer_secretary_role
-- (which GIVES AWAY the chairman's own role) and remove_member. Roles were
-- otherwise fixed at /setup/board and then frozen, so a chairman could not
-- appoint a second chairman or a board member after setup — which is exactly
-- what running a society requires as people join, move out and rotate.
--
-- Maps to the product's language:
--   secretary     = society chairman        (one per society, always)
--   co_secretary  = second chairman
--   board_member  = other office holder
--   member        = resident
--
-- SECURITY DECISIONS, and why:
--
--  1. ONLY the chairman may call this. co_secretary is deliberately excluded:
--     if a second chairman could appoint further second chairmen, the office
--     self-propagates and the society loses a single accountable head.
--
--  2. This RPC CANNOT grant 'secretary'. A society has exactly one chairman, and
--     handing over is a two-sided swap that transfer_secretary_role already does
--     atomically. Allowing it here would let a chairman create a second
--     secretary and leave the society with two heads and ambiguous authority.
--
--  3. A chairman cannot change their OWN role. Otherwise they could demote
--     themselves to member and leave the society with no chairman at all and no
--     one able to appoint one — an unrecoverable state without support.
--
--  4. Target must be an ACTIVE member of the CALLER'S society. society_id comes
--     from the JWT via current_society_id(), never from a parameter, so a
--     chairman cannot reach into another society (threat T-04.1-01).
--
--  5. Every change is written to audit_log with both the old and new role, so
--     "who made them a board member, and when" is always answerable — the same
--     attribution promise the rest of the product makes.
-- ============================================================================

create or replace function public.set_membership_role(
  p_target_user_id uuid,
  p_role           public.membership_role
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_society_id uuid := public.current_society_id();
  v_old_role   public.membership_role;
begin
  if v_actor_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_society_id is null then raise exception 'NO_SOCIETY'; end if;

  -- (1) only the chairman appoints
  if public.current_membership_role() <> 'secretary' then
    raise exception 'ONLY_SECRETARY_CAN_SET_ROLE';
  end if;

  -- (2) the chairman's own office is transferred, never granted
  if p_role = 'secretary' then
    raise exception 'USE_TRANSFER_SECRETARY_ROLE';
  end if;

  -- (3) no self-demotion: a society must never be left headless
  if p_target_user_id = v_actor_id then
    raise exception 'CANNOT_CHANGE_OWN_ROLE';
  end if;

  -- (4) target must be an active member of THIS society
  select role into v_old_role
  from public.society_memberships
  where user_id = p_target_user_id
    and society_id = v_society_id
    and status = 'active';

  if v_old_role is null then
    raise exception 'TARGET_NOT_IN_SOCIETY';
  end if;

  if v_old_role = p_role then
    return; -- idempotent: no write, no audit noise
  end if;

  update public.society_memberships
     set role = p_role
   where user_id = p_target_user_id
     and society_id = v_society_id
     and status = 'active';

  -- (5) attribution: who changed whom, from what, to what
  insert into public.audit_log (society_id, actor_id, action, target_table, payload)
  values (
    v_society_id,
    v_actor_id,
    'role.changed',
    'society_memberships',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'from', v_old_role,
      'to',   p_role
    )
  );
end;
$$;

grant execute on function public.set_membership_role(uuid, public.membership_role) to authenticated;

comment on function public.set_membership_role(uuid, public.membership_role) is
  'Chairman-only. Appoints/removes co_secretary and board_member within the caller''s own society. Cannot grant secretary (use transfer_secretary_role) and cannot change the caller''s own role.';
