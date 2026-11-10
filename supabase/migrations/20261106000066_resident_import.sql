-- ============================================================================
-- Migration 066: Excel import. Validate on the server, confirm separately.
--
-- The browser parses the file (exceljs) and sends rows. Nothing the browser
-- concluded is trusted: import_validate_rows checks every row against the
-- database, and import_confirm_batch re-checks the stored rows before creating
-- anything, because the database may have changed since validation. Clients cannot
-- alter stored rows. Rows with errors are never imported.
--
-- Row shape: { row_number, society_code, wing, floor, flat, full_name,
--              resident_type, mobile, email }
-- ============================================================================

create or replace function app_private.import_check_row(p_society uuid, p_code text, p_row jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_err    jsonb := '[]'::jsonb;
  v_warn   jsonb := '[]'::jsonb;
  v_code   text := upper(trim(coalesce(p_row ->> 'society_code', '')));
  v_wing_t text := trim(coalesce(p_row ->> 'wing', ''));
  v_flr_t  text := trim(coalesce(p_row ->> 'floor', ''));
  v_flat_t text := trim(coalesce(p_row ->> 'flat', ''));
  v_name   text := regexp_replace(trim(coalesce(p_row ->> 'full_name', '')), '\s+', ' ', 'g');
  v_type_t text := lower(trim(coalesce(p_row ->> 'resident_type', '')));
  v_mob_t  text := trim(coalesce(p_row ->> 'mobile', ''));
  v_email  text := nullif(lower(trim(coalesce(p_row ->> 'email', ''))), '');
  v_type   text;
  v_mobile text;
  v_wing   public.wings;
  v_floor  public.floors;
  v_flat   public.flats;
  v_rec    public.resident_records;
begin
  if v_code = '' then
    v_err := v_err || jsonb_build_object('code', 'SOCIETY_CODE_REQUIRED', 'field', 'society_code');
  elsif v_code <> coalesce(p_code, '') then
    v_err := v_err || jsonb_build_object('code', 'SOCIETY_CODE_MISMATCH', 'field', 'society_code');
  end if;

  if char_length(v_name) = 0 then
    v_err := v_err || jsonb_build_object('code', 'NAME_REQUIRED', 'field', 'full_name');
  elsif char_length(v_name) not between 2 and 80 then
    v_err := v_err || jsonb_build_object('code', 'INVALID_NAME', 'field', 'full_name');
  end if;

  v_type := case
    when v_type_t = 'owner' then 'owner'
    when v_type_t = 'tenant' then 'tenant'
    when v_type_t in ('family', 'family member', 'family_member') then 'family_member'
  end;
  if v_type_t = '' then
    v_err := v_err || jsonb_build_object('code', 'RESIDENT_TYPE_REQUIRED', 'field', 'resident_type');
  elsif v_type is null then
    v_err := v_err || jsonb_build_object('code', 'INVALID_RESIDENT_TYPE', 'field', 'resident_type');
  end if;

  -- Structure: wing -> flat -> floor.
  if v_wing_t = '' then
    v_err := v_err || jsonb_build_object('code', 'WING_REQUIRED', 'field', 'wing');
  else
    select * into v_wing from public.wings w
     where w.society_id = p_society and (lower(w.name) = lower(v_wing_t) or w.code = upper(v_wing_t))
     order by (lower(w.name) = lower(v_wing_t)) desc
     limit 1;
    if v_wing.id is null then
      v_err := v_err || jsonb_build_object('code', 'WING_NOT_FOUND', 'field', 'wing');
    end if;
  end if;

  if v_flat_t = '' then
    v_err := v_err || jsonb_build_object('code', 'FLAT_REQUIRED', 'field', 'flat');
  elsif v_wing.id is not null then
    select * into v_flat from public.flats f
     where f.wing_id = v_wing.id and lower(trim(f.number)) = lower(v_flat_t)
     limit 1;
    if v_flat.id is null then
      v_err := v_err || jsonb_build_object('code', 'FLAT_NOT_FOUND', 'field', 'flat');
    end if;
  end if;

  if v_wing.id is not null then
    if v_flr_t <> '' then
      select * into v_floor from public.floors fl
       where fl.wing_id = v_wing.id
         and (fl.number::text = v_flr_t or lower(coalesce(fl.name, '')) = lower(v_flr_t))
       order by (fl.number::text = v_flr_t) desc
       limit 1;
    end if;
    if v_flat.id is not null and v_flat.floor_id is null then
      -- Flats from the older wizard have no floor; do not invent one.
      v_warn := v_warn || jsonb_build_object('code', 'FLAT_HAS_NO_FLOOR', 'field', 'floor');
    elsif v_flr_t = '' then
      v_err := v_err || jsonb_build_object('code', 'FLOOR_REQUIRED', 'field', 'floor');
    elsif v_floor.id is null then
      v_err := v_err || jsonb_build_object('code', 'FLOOR_NOT_FOUND', 'field', 'floor');
    elsif v_flat.id is not null and v_flat.floor_id <> v_floor.id then
      v_err := v_err || jsonb_build_object('code', 'FLAT_FLOOR_MISMATCH', 'field', 'floor');
    end if;
  end if;

  -- Mobile and duplicates against the database.
  if v_mob_t = '' then
    v_err := v_err || jsonb_build_object('code', 'MOBILE_REQUIRED', 'field', 'mobile');
  else
    v_mobile := app_private.norm_mobile(v_mob_t);
    if v_mobile is null then
      v_err := v_err || jsonb_build_object('code', 'INVALID_MOBILE', 'field', 'mobile');
    else
      select * into v_rec from public.resident_records r
       where r.society_id = p_society and r.phone10 = v_mobile and r.status <> 'rejected'
       limit 1;
      if v_rec.id is not null then
        v_err := v_err || jsonb_build_object(
          'code', case when v_rec.flat_id = v_flat.id then 'DUPLICATE_IN_DB' else 'MOBILE_ON_OTHER_FLAT' end,
          'field', 'mobile');
      end if;

      if exists (
        select 1 from public.society_memberships m
          join auth.users u on u.id = m.user_id
         where m.society_id = p_society and m.status in ('active', 'pending_review')
           and u.phone in ('91' || v_mobile, '+91' || v_mobile)
           and (m.flat_id is not null)
      ) then
        v_err := v_err || jsonb_build_object('code', 'ALREADY_MEMBER', 'field', 'mobile');
      end if;

      if exists (select 1 from public.family_members fm
                  where fm.society_id = p_society and fm.phone10 = v_mobile and fm.claimed_user_id is null) then
        v_warn := v_warn || jsonb_build_object('code', 'PRE_REGISTERED_FAMILY', 'field', 'mobile');
      end if;
      if exists (select 1 from public.society_authorities a
                  where a.society_id = p_society and a.phone = v_mobile) then
        v_warn := v_warn || jsonb_build_object('code', 'IS_AUTHORITY', 'field', 'mobile');
      end if;
    end if;
  end if;

  if v_email is not null and not app_private.valid_email(v_email) then
    v_warn := v_warn || jsonb_build_object('code', 'INVALID_EMAIL_IGNORED', 'field', 'email');
    v_email := null;
  end if;

  if v_flat.id is not null then
    if v_flat.status in ('under_construction', 'maintenance') then
      v_warn := v_warn || jsonb_build_object('code', 'FLAT_NOT_READY', 'field', 'flat');
    end if;
    if v_type = 'owner' and (
         exists (select 1 from public.resident_records r
                  where r.flat_id = v_flat.id and r.resident_type = 'owner' and r.status <> 'rejected')
         or exists (select 1 from public.society_memberships m
                     where m.flat_id = v_flat.id and m.status = 'active' and m.resident_type = 'owner')) then
      v_warn := v_warn || jsonb_build_object('code', 'FLAT_HAS_OWNER', 'field', 'resident_type');
    end if;
  end if;

  return jsonb_build_object(
    'errors', v_err,
    'warnings', v_warn,
    'mobile', v_mobile,
    'flat_id', v_flat.id,
    'normalized', jsonb_build_object(
      'full_name', v_name, 'resident_type', v_type, 'mobile', v_mobile, 'email', v_email,
      'wing', coalesce(v_wing.name, v_wing_t),
      'floor', coalesce(v_floor.name, v_floor.number::text, v_flr_t),
      'flat', coalesce(v_flat.number, v_flat_t))
  );
end;
$$;
revoke all on function app_private.import_check_row(uuid, text, jsonb) from public, anon, authenticated;

create or replace function app_private.import_refresh_counts(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.resident_import_batches;
begin
  update public.resident_import_batches b
     set total_rows    = c.total,
         valid_rows    = c.valid,
         warning_rows  = c.warning,
         error_rows    = c.error,
         imported_rows = c.imported
    from (
      select count(*) as total,
             count(*) filter (where status = 'valid') as valid,
             count(*) filter (where status = 'warning') as warning,
             count(*) filter (where status = 'error') as error,
             count(*) filter (where status = 'imported') as imported
        from public.resident_import_rows where batch_id = p_batch
    ) c
   where b.id = p_batch
  returning b.* into v_row;

  return jsonb_build_object(
    'batch_id', v_row.id, 'society_id', v_row.society_id, 'file_name', v_row.file_name,
    'status', v_row.status, 'total_rows', v_row.total_rows, 'valid_rows', v_row.valid_rows,
    'warning_rows', v_row.warning_rows, 'error_rows', v_row.error_rows,
    'imported_rows', v_row.imported_rows, 'created_at', v_row.created_at,
    'confirmed_at', v_row.confirmed_at);
end;
$$;
revoke all on function app_private.import_refresh_counts(uuid) from public, anon, authenticated;

create or replace function app_private.import_row_json(r public.resident_import_rows)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'row_number', r.row_number, 'status', r.status, 'errors', r.errors, 'warnings', r.warnings,
    'normalized', r.normalized, 'raw', r.raw, 'record_id', r.record_id)
$$;
revoke all on function app_private.import_row_json(public.resident_import_rows) from public, anon, authenticated;

create or replace function public.import_validate_rows(
  p_society_id uuid,
  p_file_name  text,
  p_rows       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_batch uuid;
  v_item  jsonb;
  v_ord   bigint;
  v_num   int;
  v_chk   jsonb;
  v_sum   jsonb;
begin
  perform app_private.assert_manager(p_society_id);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'IMPORT_EMPTY';
  end if;
  if jsonb_array_length(p_rows) > 2000 or pg_column_size(p_rows) > 2097152 then
    raise exception 'IMPORT_TOO_LARGE';
  end if;
  perform app_private.assert_rate('rpc:import_validate', v_uid::text, 30, 3600, 'IMPORT_RATE_LIMITED');

  select c.code into v_code from public.society_codes c
   where c.society_id = p_society_id and c.revoked_at is null limit 1;

  insert into public.resident_import_batches (society_id, file_name, created_by)
  values (p_society_id, left(nullif(trim(coalesce(p_file_name, '')), ''), 200), v_uid)
  returning id into v_batch;

  for v_item, v_ord in select e.value, e.ordinality from jsonb_array_elements(p_rows) with ordinality e loop
    v_num := v_ord::int + 1;   -- +1: row 1 of a sheet is the header
    if jsonb_typeof(v_item) = 'object' and (v_item ->> 'row_number') ~ '^[0-9]{1,7}$' then
      v_num := (v_item ->> 'row_number')::int;
    end if;

    if jsonb_typeof(v_item) <> 'object' or pg_column_size(v_item) > 4096 then
      insert into public.resident_import_rows (batch_id, society_id, row_number, raw, status, errors)
      values (v_batch, p_society_id, v_num, '{}'::jsonb, 'error',
              jsonb_build_array(jsonb_build_object('code', 'INVALID_ROW', 'field', null)));
      continue;
    end if;

    v_chk := app_private.import_check_row(p_society_id, v_code, v_item);
    insert into public.resident_import_rows
      (batch_id, society_id, row_number, raw, status, errors, warnings, mobile, flat_id, normalized)
    values (
      v_batch, p_society_id, v_num, v_item,
      case when jsonb_array_length(v_chk -> 'errors') > 0 then 'error'
           when jsonb_array_length(v_chk -> 'warnings') > 0 then 'warning'
           else 'valid' end,
      v_chk -> 'errors', v_chk -> 'warnings', v_chk ->> 'mobile',
      (v_chk ->> 'flat_id')::uuid, v_chk -> 'normalized');
  end loop;

  -- Every occurrence of a mobile repeated in the file is an error: we cannot tell
  -- which row is right, so none of them goes in.
  update public.resident_import_rows r
     set status = 'error',
         errors = r.errors || jsonb_build_object('code', 'DUPLICATE_MOBILE_IN_FILE', 'field', 'mobile')
   where r.batch_id = v_batch
     and r.mobile in (select d.mobile from public.resident_import_rows d
                       where d.batch_id = v_batch and d.mobile is not null
                       group by d.mobile having count(*) > 1);

  v_sum := app_private.import_refresh_counts(v_batch);

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_uid, 'import.validated', 'resident_import_batches', v_batch,
          jsonb_build_object('total', v_sum -> 'total_rows', 'errors', v_sum -> 'error_rows'));

  return v_sum || jsonb_build_object('rows', (
    select coalesce(jsonb_agg(app_private.import_row_json(r) order by r.row_number), '[]'::jsonb)
      from public.resident_import_rows r where r.batch_id = v_batch));
end;
$$;
revoke all on function public.import_validate_rows(uuid, text, jsonb) from public, anon;
grant execute on function public.import_validate_rows(uuid, text, jsonb) to authenticated;

-- Atomic. Rows that went bad since validation are marked error and reported.
create or replace function public.import_confirm_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_batch   public.resident_import_batches;
  v_code    text;
  v_row     public.resident_import_rows;
  v_chk     jsonb;
  v_n       jsonb;
  v_id      uuid;
  v_done    int := 0;
  v_stale   jsonb := '[]'::jsonb;
  v_sum     jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_batch from public.resident_import_batches where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  begin
    perform app_private.assert_manager(v_batch.society_id);
  exception when others then
    raise exception 'BATCH_NOT_FOUND';   -- not your society = does not exist
  end;
  if v_batch.status = 'confirmed' then raise exception 'BATCH_ALREADY_CONFIRMED'; end if;
  if v_batch.status = 'cancelled' then raise exception 'BATCH_CANCELLED'; end if;

  -- Two batches confirming at once must not race the duplicate checks.
  perform pg_advisory_xact_lock(hashtext('import:' || v_batch.society_id::text));

  select c.code into v_code from public.society_codes c
   where c.society_id = v_batch.society_id and c.revoked_at is null limit 1;

  for v_row in
    select * from public.resident_import_rows r
     where r.batch_id = p_batch_id and r.status in ('valid', 'warning')
     order by r.row_number
  loop
    v_chk := app_private.import_check_row(v_batch.society_id, v_code, v_row.raw);
    if jsonb_array_length(v_chk -> 'errors') > 0 then
      update public.resident_import_rows
         set status = 'error', errors = v_chk -> 'errors', warnings = v_chk -> 'warnings'
       where id = v_row.id;
      v_stale := v_stale || jsonb_build_object('row_number', v_row.row_number, 'errors', v_chk -> 'errors');
      continue;
    end if;

    v_n := v_chk -> 'normalized';
    v_id := null;
    insert into public.resident_records
      (society_id, flat_id, full_name, phone10, email, resident_type, source, batch_id, created_by)
    values (v_batch.society_id, (v_chk ->> 'flat_id')::uuid, v_n ->> 'full_name', v_n ->> 'mobile',
            v_n ->> 'email', v_n ->> 'resident_type', 'import', p_batch_id, v_uid)
    on conflict (society_id, phone10) where status <> 'rejected' do nothing
    returning id into v_id;

    if v_id is null then
      update public.resident_import_rows
         set status = 'error',
             errors = jsonb_build_array(jsonb_build_object('code', 'DUPLICATE_IN_DB', 'field', 'mobile'))
       where id = v_row.id;
      v_stale := v_stale || jsonb_build_object('row_number', v_row.row_number,
        'errors', jsonb_build_array(jsonb_build_object('code', 'DUPLICATE_IN_DB', 'field', 'mobile')));
      continue;
    end if;

    update public.resident_import_rows set status = 'imported', record_id = v_id where id = v_row.id;
    v_done := v_done + 1;
  end loop;

  if v_done = 0 then
    -- Raising undoes the row updates above too, which is right: nothing happened.
    raise exception 'IMPORT_NOTHING_VALID';
  end if;

  update public.resident_import_batches
     set status = 'confirmed', confirmed_by = v_uid, confirmed_at = now()
   where id = p_batch_id;

  v_sum := app_private.import_refresh_counts(p_batch_id);

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_batch.society_id, v_uid, 'import.confirmed', 'resident_import_batches', p_batch_id,
          jsonb_build_object('imported', v_done, 'newly_invalid', jsonb_array_length(v_stale)));

  return v_sum || jsonb_build_object('imported', v_done, 'newly_invalid', v_stale);
end;
$$;
revoke all on function public.import_confirm_batch(uuid) from public, anon;
grant execute on function public.import_confirm_batch(uuid) to authenticated;

create or replace function public.import_cancel_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.resident_import_batches;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_batch from public.resident_import_batches where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  begin
    perform app_private.assert_manager(v_batch.society_id);
  exception when others then
    raise exception 'BATCH_NOT_FOUND';
  end;
  if v_batch.status = 'confirmed' then raise exception 'BATCH_ALREADY_CONFIRMED'; end if;
  update public.resident_import_batches set status = 'cancelled' where id = p_batch_id;
  return jsonb_build_object('batch_id', p_batch_id, 'status', 'cancelled');
end;
$$;
revoke all on function public.import_cancel_batch(uuid) from public, anon;
grant execute on function public.import_cancel_batch(uuid) to authenticated;

create or replace function public.import_list_batches(
  p_society_id uuid,
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
begin
  perform app_private.assert_manager(p_society_id);
  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'batch_id', b.id, 'file_name', b.file_name, 'status', b.status,
               'total_rows', b.total_rows, 'valid_rows', b.valid_rows, 'warning_rows', b.warning_rows,
               'error_rows', b.error_rows, 'imported_rows', b.imported_rows,
               'created_at', b.created_at, 'confirmed_at', b.confirmed_at) order by b.created_at desc), '[]'::jsonb)
        from (select * from public.resident_import_batches
               where society_id = p_society_id
               order by created_at desc limit v_limit offset v_offset) b),
    'total', (select count(*) from public.resident_import_batches where society_id = p_society_id),
    'limit', v_limit, 'offset', v_offset);
end;
$$;
revoke all on function public.import_list_batches(uuid, int, int) from public, anon;
grant execute on function public.import_list_batches(uuid, int, int) to authenticated;

create or replace function public.import_get_batch(
  p_batch_id uuid,
  p_status   text default null,
  p_limit    int default 100,
  p_offset   int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch  public.resident_import_batches;
  v_limit  int := app_private.page_limit(p_limit);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_batch from public.resident_import_batches where id = p_batch_id;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  begin
    perform app_private.assert_manager(v_batch.society_id);
  exception when others then
    raise exception 'BATCH_NOT_FOUND';
  end;
  if p_status is not null and p_status not in ('valid', 'warning', 'error', 'imported') then
    raise exception 'INVALID_STATUS';
  end if;

  return jsonb_build_object(
    'batch_id', v_batch.id, 'society_id', v_batch.society_id, 'file_name', v_batch.file_name,
    'status', v_batch.status, 'total_rows', v_batch.total_rows, 'valid_rows', v_batch.valid_rows,
    'warning_rows', v_batch.warning_rows, 'error_rows', v_batch.error_rows,
    'imported_rows', v_batch.imported_rows, 'created_at', v_batch.created_at,
    'confirmed_at', v_batch.confirmed_at,
    'rows', (
      select coalesce(jsonb_agg(app_private.import_row_json(r) order by r.row_number), '[]'::jsonb)
        from (select * from public.resident_import_rows x
               where x.batch_id = p_batch_id and (p_status is null or x.status = p_status)
               order by x.row_number limit v_limit offset v_offset) r),
    'rows_total', (select count(*) from public.resident_import_rows x
                    where x.batch_id = p_batch_id and (p_status is null or x.status = p_status)),
    'limit', v_limit, 'offset', v_offset);
end;
$$;
revoke all on function public.import_get_batch(uuid, text, int, int) from public, anon;
grant execute on function public.import_get_batch(uuid, text, int, int) to authenticated;
