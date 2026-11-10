-- ============================================================================
-- Migration 071: staff details.
--
-- society_staff stays the shared contact directory every member can read, so the
-- private fields live in their own table with no client access at all. A staff
-- record grants no permissions: no login, no membership, no role. Gate guards still
-- come from secretary_add_guard; category 'security' here is a directory entry only.
-- ============================================================================

create table if not exists public.society_staff_details (
  staff_id                uuid primary key references public.society_staff(id) on delete cascade,
  society_id              uuid not null references public.societies(id) on delete cascade,
  last_name               text,
  email                   text,
  joining_date            date,
  employee_id             text,
  vendor_name             text,
  shift                   text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  id_proof_type           text,
  updated_by              uuid references auth.users(id) on delete set null,
  updated_at              timestamptz not null default now(),
  constraint staff_details_last_name_len check (last_name is null or char_length(last_name) <= 80),
  constraint staff_details_email_len check (email is null or char_length(email) <= 254),
  constraint staff_details_employee_id_len check (employee_id is null or char_length(employee_id) <= 40),
  constraint staff_details_vendor_len check (vendor_name is null or char_length(vendor_name) <= 120),
  constraint staff_details_shift check (shift is null or shift in ('morning', 'afternoon', 'evening', 'night', 'general', 'rotational')),
  constraint staff_details_contact_name_len check (emergency_contact_name is null or char_length(emergency_contact_name) <= 80),
  constraint staff_details_contact_phone check (emergency_contact_phone is null or emergency_contact_phone ~ '^[6-9][0-9]{9}$'),
  constraint staff_details_id_proof_type check (id_proof_type is null or id_proof_type in ('aadhaar', 'pan', 'voter_id', 'driving_licence', 'passport', 'other'))
);
create unique index if not exists staff_details_employee_id_key
  on public.society_staff_details (society_id, lower(employee_id)) where employee_id is not null;
create index if not exists idx_staff_details_society on public.society_staff_details (society_id);

alter table public.society_staff_details enable row level security;
revoke all on public.society_staff_details from anon, authenticated;

drop trigger if exists guard_society_service on public.society_staff_details;
create trigger guard_society_service before insert or update or delete on public.society_staff_details
  for each row execute function public.guard_society_service_write();

create or replace function app_private.staff_json(s public.society_staff, d public.society_staff_details)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'society_id', s.society_id, 'name', s.name, 'last_name', d.last_name,
    'phone', s.phone, 'category', s.category, 'email', d.email, 'joining_date', d.joining_date,
    'employee_id', d.employee_id, 'vendor_name', d.vendor_name, 'shift', d.shift,
    'emergency_contact_name', d.emergency_contact_name,
    'emergency_contact_phone', d.emergency_contact_phone,
    'id_proof_type', d.id_proof_type, 'created_at', s.created_at, 'updated_at', d.updated_at)
$$;
revoke all on function app_private.staff_json(public.society_staff, public.society_staff_details)
  from public, anon, authenticated;

-- Creates (p_staff_id NULL) or updates a staff record and its details, atomically.
create or replace function public.manager_save_staff(
  p_society_id              uuid,
  p_name                    text,
  p_category                text,
  p_phone                   text default null,
  p_last_name               text default null,
  p_email                   text default null,
  p_joining_date            date default null,
  p_employee_id             text default null,
  p_vendor_name             text default null,
  p_shift                   text default null,
  p_emergency_contact_name  text default null,
  p_emergency_contact_phone text default null,
  p_id_proof_type           text default null,
  p_staff_id                uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := trim(coalesce(p_name, ''));
  v_cat     public.staff_category;
  v_phone   text := nullif(trim(coalesce(p_phone, '')), '');
  v_email   text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_emp     text := nullif(trim(coalesce(p_employee_id, '')), '');
  v_contact text := nullif(trim(coalesce(p_emergency_contact_phone, '')), '');
  v_staff   public.society_staff;
  v_det     public.society_staff_details;
begin
  perform app_private.assert_manager(p_society_id);

  if char_length(v_name) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  begin
    v_cat := p_category::public.staff_category;
  exception when others then
    raise exception 'INVALID_CATEGORY';
  end;
  if v_cat is null then raise exception 'INVALID_CATEGORY'; end if;
  if v_phone is not null then
    v_phone := app_private.norm_mobile(v_phone);
    if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  end if;
  if v_email is not null and not app_private.valid_email(v_email) then raise exception 'INVALID_EMAIL'; end if;
  if p_joining_date is not null and p_joining_date > current_date + 365 then raise exception 'INVALID_JOINING_DATE'; end if;
  if char_length(coalesce(p_last_name, '')) > 80 then raise exception 'INVALID_NAME'; end if;
  if char_length(coalesce(v_emp, '')) > 40 then raise exception 'INVALID_EMPLOYEE_ID'; end if;
  if char_length(coalesce(p_vendor_name, '')) > 120 then raise exception 'INVALID_VENDOR'; end if;
  if p_shift is not null and p_shift not in ('morning', 'afternoon', 'evening', 'night', 'general', 'rotational') then
    raise exception 'INVALID_SHIFT';
  end if;
  if char_length(coalesce(p_emergency_contact_name, '')) > 80 then raise exception 'INVALID_EMERGENCY_CONTACT'; end if;
  if v_contact is not null then
    v_contact := app_private.norm_mobile(v_contact);
    if v_contact is null then raise exception 'INVALID_EMERGENCY_CONTACT'; end if;
  end if;
  if p_id_proof_type is not null and p_id_proof_type not in
     ('aadhaar', 'pan', 'voter_id', 'driving_licence', 'passport', 'other') then
    raise exception 'INVALID_ID_PROOF_TYPE';
  end if;
  if v_emp is not null and exists (
    select 1 from public.society_staff_details d
     where d.society_id = p_society_id and lower(d.employee_id) = lower(v_emp)
       and d.staff_id is distinct from p_staff_id) then
    raise exception 'EMPLOYEE_ID_TAKEN';
  end if;

  if p_staff_id is null then
    insert into public.society_staff (society_id, name, phone, category, added_by, added_by_name)
    values (p_society_id, v_name, v_phone, v_cat, v_uid,
            (select p.full_name from public.profiles p where p.user_id = v_uid))
    returning * into v_staff;
  else
    update public.society_staff
       set name = v_name, phone = v_phone, category = v_cat
     where id = p_staff_id and society_id = p_society_id
    returning * into v_staff;
    if v_staff.id is null then raise exception 'STAFF_NOT_FOUND'; end if;
  end if;

  insert into public.society_staff_details as d
    (staff_id, society_id, last_name, email, joining_date, employee_id, vendor_name, shift,
     emergency_contact_name, emergency_contact_phone, id_proof_type, updated_by, updated_at)
  values (v_staff.id, p_society_id, nullif(trim(coalesce(p_last_name, '')), ''), v_email, p_joining_date, v_emp,
          nullif(trim(coalesce(p_vendor_name, '')), ''), p_shift,
          nullif(trim(coalesce(p_emergency_contact_name, '')), ''), v_contact, p_id_proof_type, v_uid, now())
  on conflict (staff_id) do update
    set last_name = excluded.last_name, email = excluded.email, joining_date = excluded.joining_date,
        employee_id = excluded.employee_id, vendor_name = excluded.vendor_name, shift = excluded.shift,
        emergency_contact_name = excluded.emergency_contact_name,
        emergency_contact_phone = excluded.emergency_contact_phone,
        id_proof_type = excluded.id_proof_type, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_det;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'staff.saved', 'society_staff', v_staff.id, jsonb_build_object('category', v_cat));

  return app_private.staff_json(v_staff, v_det);
end;
$$;
revoke all on function public.manager_save_staff(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.manager_save_staff(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid) to authenticated;

create or replace function public.manager_list_staff(
  p_society_id uuid,
  p_category   text default null,
  p_search     text default null,
  p_limit      int default 25,
  p_offset     int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  int := app_private.page_limit(p_limit);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_like   text;
begin
  perform app_private.assert_manager(p_society_id);
  v_like := '%' || app_private.like_escape(v_search) || '%';
  return (
    with f as (
      select s as st, d as de, s.created_at as created_at
        from public.society_staff s
        left join public.society_staff_details d on d.staff_id = s.id
       where s.society_id = p_society_id
         and (p_category is null or s.category::text = p_category)
         and (v_search is null or s.name ilike v_like or coalesce(d.last_name, '') ilike v_like
              or coalesce(d.employee_id, '') ilike v_like or coalesce(d.vendor_name, '') ilike v_like)
    )
    select jsonb_build_object(
      'items', (select coalesce(jsonb_agg(app_private.staff_json(p.st, p.de) order by p.created_at desc), '[]'::jsonb)
                  from (select * from f order by f.created_at desc limit v_limit offset v_offset) p),
      'total', (select count(*) from f),
      'limit', v_limit, 'offset', v_offset)
  );
end;
$$;
revoke all on function public.manager_list_staff(uuid, text, text, int, int) from public, anon;
grant execute on function public.manager_list_staff(uuid, text, text, int, int) to authenticated;

create or replace function public.manager_get_staff(p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.society_staff;
  v_det   public.society_staff_details;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_staff from public.society_staff where id = p_staff_id;
  if v_staff.id is null or not app_private.is_society_manager(v_staff.society_id) then
    raise exception 'STAFF_NOT_FOUND';
  end if;
  select * into v_det from public.society_staff_details where staff_id = p_staff_id;
  return app_private.staff_json(v_staff, v_det);
end;
$$;
revoke all on function public.manager_get_staff(uuid) from public, anon;
grant execute on function public.manager_get_staff(uuid) to authenticated;
