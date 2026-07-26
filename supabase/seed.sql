-- Phase 1 — Foundation: Seed two test societies for isolation testing.
-- Plan 04 will create authenticated users in each society and verify cross-tenant
-- queries via the JS SDK return zero rows (per PITFALLS.md Pitfall 1).
--
-- Deterministic UUIDs:
--   Society A: 00000000-0000-0000-0000-00000000000a
--   Society B: 00000000-0000-0000-0000-00000000000b

-- Idempotent: clean any prior seed state before inserting.
delete from public.society_memberships
  where society_id in (
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid
  );
delete from public.flats
  where society_id in (
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid
  );
delete from public.wings
  where society_id in (
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid
  );
delete from public.society_codes
  where society_id in (
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid
  );
delete from public.societies
  where id in (
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid
  );

-- ============== Society A ==============
insert into public.societies (id, name, address)
values (
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'Test Society Alpha',
  '101 Alpha Road, Pune 411001'
);

insert into public.society_codes (code, society_id)
values ('TEST-A001', '00000000-0000-0000-0000-00000000000a'::uuid);

insert into public.wings (id, society_id, name)
values (
  '00000000-0000-0000-0000-00000000a001'::uuid,
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'A'
);

insert into public.flats (id, society_id, wing_id, number)
values
  (
    '00000000-0000-0000-0000-00000000a101'::uuid,
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000a001'::uuid,
    '101'
  ),
  (
    '00000000-0000-0000-0000-00000000a102'::uuid,
    '00000000-0000-0000-0000-00000000000a'::uuid,
    '00000000-0000-0000-0000-00000000a001'::uuid,
    '102'
  );

-- ============== Society B ==============
insert into public.societies (id, name, address)
values (
  '00000000-0000-0000-0000-00000000000b'::uuid,
  'Test Society Beta',
  '202 Beta Avenue, Mumbai 400001'
);

insert into public.society_codes (code, society_id)
values ('TEST-B001', '00000000-0000-0000-0000-00000000000b'::uuid);

insert into public.wings (id, society_id, name)
values (
  '00000000-0000-0000-0000-00000000b001'::uuid,
  '00000000-0000-0000-0000-00000000000b'::uuid,
  'B'
);

insert into public.flats (id, society_id, wing_id, number)
values
  (
    '00000000-0000-0000-0000-00000000b101'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid,
    '00000000-0000-0000-0000-00000000b001'::uuid,
    '101'
  ),
  (
    '00000000-0000-0000-0000-00000000b102'::uuid,
    '00000000-0000-0000-0000-00000000000b'::uuid,
    '00000000-0000-0000-0000-00000000b001'::uuid,
    '102'
  );

-- Note: society_memberships rows are created by Plan 04's isolation test via the
-- admin JS SDK (adminClient.from('society_memberships').upsert(...)) AFTER it
-- creates auth.users via supabase.auth.admin.createUser. We deliberately do NOT
-- ship a separate cross_tenant_isolation_setup.sql helper — keeping setup in the
-- test file makes it self-contained, idempotent, and easier to maintain.
