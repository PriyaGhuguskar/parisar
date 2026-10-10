-- Migration 053: my_login_state() — one answer to "where does this signed-in
-- person go?", shared by the website and the mobile app.
--
-- The website decided this in a server action with the service-role key
-- (apps/web/app/actions/codeLogin.js lookupPhone); the app could not hold that
-- key and kept its own, smaller copy of the rules — which is how staff, guards
-- and family members ended up on the app's onboarding screen. This function
-- reads only rows that belong to the caller (by auth.uid() and the phone on
-- their auth account), so any client can call it right after OTP.
--
-- Returns facts, in the same precedence the website uses:
--   staff            platform admin / sales / staff
--   guard            'claimed' | 'unclaimed' | null   (active gate guard)
--   authority        true when the phone is on an authority list not yet linked
--                    to another account, or the caller is a flat-less authority
--   membership       newest active / pending membership {society_id, role,
--                    flat_id, status} or null
--   flats_in_society flat count of that membership's society (for setup)
--   family           true when a resident pre-entered this phone as family
--   pin_set          profiles.pin_set
--   service          my_society_service_status()->>'status' (or null)

create or replace function public.my_login_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;                 -- 10-digit Indian mobile
  v_mem   record;
  v_guard record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
    into v_phone
    from auth.users u where u.id = v_uid;

  select m.society_id, m.role, m.flat_id, m.status
    into v_mem
    from public.society_memberships m
   where m.user_id = v_uid and m.status in ('active', 'pending_review')
   order by (m.flat_id is not null) desc, m.joined_at desc
   limit 1;

  select g.user_id, g.society_id
    into v_guard
    from public.society_guards g
   where g.status = 'active'
     and (g.user_id = v_uid or (g.user_id is null and g.phone = v_phone))
   order by (g.user_id = v_uid) desc nulls last
   limit 1;

  return jsonb_build_object(
    'staff', public.is_platform_admin_or_sales()
             or exists (select 1 from public.platform_admins pa where pa.user_id = v_uid),
    'guard', case
               when v_guard is null then null
               when v_guard.user_id = v_uid then 'claimed'
               else 'unclaimed'
             end,
    'authority',
      (v_mem.society_id is null and exists (
         select 1 from public.society_authorities a
          where a.phone = v_phone and (a.user_id is null or a.user_id = v_uid)))
      or (v_mem.society_id is not null and v_mem.flat_id is null
          and v_mem.role in ('secretary', 'co_secretary')),
    'membership', case when v_mem.society_id is null then null else jsonb_build_object(
                    'society_id', v_mem.society_id, 'role', v_mem.role,
                    'flat_id', v_mem.flat_id, 'status', v_mem.status) end,
    'flats_in_society', case when v_mem.society_id is null then null else
                          (select count(*) from public.flats f
                            where f.society_id = v_mem.society_id) end,
    'family', v_mem.society_id is null and v_phone <> '' and exists (
                select 1 from public.family_members fm
                 where fm.claimed_user_id is null and fm.phone like '%' || v_phone),
    'pin_set', coalesce((select p.pin_set from public.profiles p where p.user_id = v_uid), false),
    'service', (public.my_society_service_status() ->> 'status')
  );
end;
$$;

revoke execute on function public.my_login_state() from public, anon;
grant execute on function public.my_login_state() to authenticated, service_role;
