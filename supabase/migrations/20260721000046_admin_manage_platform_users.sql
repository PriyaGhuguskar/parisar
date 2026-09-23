-- ============================================================================
-- Let an admin appoint staff and sales — but never another admin
-- ----------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY GIVES UP, AND WHAT IT KEEPS.
-- …016 set a hard rule: platform_admins is service-role only, "an admin cannot
-- see the admin list, and crucially cannot add another admin — that stays a
-- deliberate act performed out of band. Self-service privilege escalation is
-- the failure mode this prevents."
--
-- Admins now need to appoint staff and sales from the console, so that rule is
-- relaxed — but only as far as it has to be. The escalation path stays shut:
--
--   an admin MAY    create, list and revoke role='staff' and role='sales'
--   an admin MAY NOT create an admin, revoke an admin, or see admin rows
--
-- So a compromised admin account can hand out sales and staff access, which is
-- recoverable — every grant is written to audit_log, readable through
-- admin_list_platform_audit() below, and any admin can revoke it. What it
-- cannot do is mint a second permanent admin, which is the move that survives
-- losing control of the first account. Creating an admin still means running
-- scripts/create-admin.mjs with the service-role key.
--
-- WHY p_user_id AND NOT p_phone. A row in auth.users cannot be created from
-- SQL — it has to go through the Auth admin API. The caller (a server action on
-- web, an Edge Function on mobile) creates or finds the auth user first, then
-- calls this with the resulting id. The FK to auth.users rejects a bad one.
--
-- WHY THE GUARDS LIVE IN THE WRITE'S OWN WHERE CLAUSE. An earlier draft read the
-- target's current role with a plain SELECT and then wrote unconditionally. That
-- is a check-then-act race: under READ COMMITTED the row can become role='admin'
-- between the two statements, and the write would then demote or delete a
-- freshly minted admin. No attacker can time it (the only path to role='admin'
-- is the out-of-band script), but a guard that protects the most sensitive row
-- in the schema should not depend on nobody being unlucky. Both writes now
-- carry `role <> 'admin'` in the statement itself and check ROW_COUNT.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Appoint. Upsert so re-running with a different role moves someone between
-- staff and sales, which is the common correction.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_platform_user(
  p_user_id uuid, p_role public.platform_role, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_actor uuid := auth.uid(); v_existing public.platform_role; v_rows integer;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_role is null then raise exception 'INVALID_ROLE'; end if;

  -- The escalation guard. A literal comparison, before any table access, so no
  -- upsert or conflict path can reach role='admin'.
  if p_role = 'admin' then raise exception 'CANNOT_CREATE_ADMIN'; end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- Read only for the audit trail's previous_role. The real protection is the
  -- WHERE on the DO UPDATE below, which the database evaluates against the
  -- locked conflicting row inside this one statement.
  select role into v_existing from public.platform_admins where user_id = p_user_id;

  insert into public.platform_admins (user_id, role, note)
  values (p_user_id, p_role, nullif(trim(coalesce(p_note,'')),''))
  on conflict (user_id) do update
    set role = excluded.role,
        note = coalesce(excluded.note, public.platform_admins.note)
    where public.platform_admins.role <> 'admin';

  -- Zero rows means the conflict target was an admin and the WHERE refused it.
  -- Never let an appointment silently DEMOTE a sitting admin: that is
  -- escalation's mirror image and just as much a way to seize control.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'CANNOT_MODIFY_ADMIN'; end if;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (null, v_actor, 'platform_user.appointed', 'platform_admins', p_user_id,
          jsonb_build_object('role', p_role, 'previous_role', v_existing));

  return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'was', v_existing);
end; $$;
grant execute on function public.admin_create_platform_user(uuid, public.platform_role, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke. Deleting the row is the revocation — every helper reads the table
-- live, so access ends on their next call rather than at their next login.
-- ---------------------------------------------------------------------------
create or replace function public.admin_revoke_platform_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_actor uuid := auth.uid(); v_role public.platform_role; v_rows integer;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  select role into v_role from public.platform_admins where user_id = p_user_id;

  delete from public.platform_admins
   where user_id = p_user_id and role <> 'admin';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- Distinguish "was an admin, refused" from "no such platform user". Telling
    -- an admin that a specific known user_id is an admin discloses nothing they
    -- can act on — every write path against that row is already shut.
    if exists (select 1 from public.platform_admins where user_id = p_user_id) then
      raise exception 'CANNOT_MODIFY_ADMIN';
    end if;
    raise exception 'NOT_FOUND';
  end if;

  -- Also end any support-impersonation session they had open, so revocation is
  -- immediate rather than lasting until the 60-minute window lapses.
  delete from public.admin_view_sessions where admin_id = p_user_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (null, v_actor, 'platform_user.revoked', 'platform_admins', p_user_id,
          jsonb_build_object('role', v_role));
end; $$;
grant execute on function public.admin_revoke_platform_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- List. Staff and sales only — admin rows stay invisible, preserving the half
-- of the …016 rule that still applies.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_platform_users()
returns table (user_id uuid, role public.platform_role, note text, phone text,
               full_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  return query
  select a.user_id, a.role, a.note, u.phone::text, p.full_name, a.created_at
  from public.platform_admins a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.user_id = a.user_id
  where a.role in ('staff','sales')
  order by a.created_at desc;
end; $$;
grant execute on function public.admin_list_platform_users() to authenticated;

-- ---------------------------------------------------------------------------
-- Read the platform audit trail.
--
-- WHY THIS IS NEEDED AT ALL. The two functions above write audit_log rows with
-- society_id = NULL, because a platform appointment belongs to no society. They
-- are the only rows in the entire schema shaped that way, and the sole SELECT
-- policy on audit_log (secretary_select_audit_log, from …006) matches on
-- `society_id = current_society_id()` — which can never be true for NULL. So
-- without this function the grants would be written and then unreadable by
-- anyone but the service role, and "every grant is audited" would be a claim
-- with no way to check it. An audit trail nobody can read is not an audit trail.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_platform_audit(p_limit integer default 100)
returns table (id bigint, actor_id uuid, action text, target_id uuid,
               payload jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  return query
  select a.id, a.actor_id, a.action, a.target_id, a.payload, a.created_at
  from public.audit_log a
  where a.society_id is null
    and a.action like 'platform_user.%'
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end; $$;
grant execute on function public.admin_list_platform_audit(integer) to authenticated;

comment on function public.admin_create_platform_user(uuid, public.platform_role, text) is
  'Admin appoints a staff or sales user. Raises CANNOT_CREATE_ADMIN for p_role=admin and CANNOT_MODIFY_ADMIN if the target is already an admin. Both guards are enforced in the write statement, not by a prior read.';
comment on function public.admin_revoke_platform_user(uuid) is
  'Admin revokes a staff or sales user and closes any open support-view session. Refuses to touch admin rows.';
comment on function public.admin_list_platform_users() is
  'Staff and sales rows only. Admin rows remain unenumerable, per the original platform_admins rule.';
comment on function public.admin_list_platform_audit(integer) is
  'Platform-level appointment/revocation history. These audit_log rows have society_id NULL and are unreachable through the society-scoped audit policy.';
