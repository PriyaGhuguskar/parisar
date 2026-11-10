# Parisar: API and Database Testing

Area key: `roles`. Last updated: 2026-11-10 10:02 UTC. Test cases: 165. Passed: 162. Failed: 3. Blocked: 0. Not tested: 0.

## 1. API surface

There is no API server. Clients call PostgREST directly:

| Kind | URL | Auth |
|---|---|---|
| RPC | `POST http://127.0.0.1:54321/rest/v1/rpc/<name>` with JSON named args | `apikey: <anon key>` and `Authorization: Bearer <user JWT>` |
| Table | `GET/POST/PATCH/DELETE /rest/v1/<table>` | same; row-level security decides |
| Auth | `POST /auth/v1/otp`, `POST /auth/v1/verify` (`type: sms`), `POST /auth/v1/token?grant_type=refresh_token`, `POST /auth/v1/logout` | anon key |

Inventory (read from `pg_proc` on the running DB, 10 Nov 2026): 404 functions in `public`; 186 are executable by `authenticated` only; the only application functions executable by `anon` are `submit_connect_request` and `get_connect_request_status` (the other anon-executable ones are `btree_gist` extension internals). 27 are executable by neither (internal helpers, hooks). Full list: `docs/qa/scripts/api/rpcs.txt`.

Error convention (verified): a raised business error returns HTTP **400** with `{"code":"P0001","message":"<CODE>"}`; a returned error is HTTP **200** with `{"error":"<CODE>"}`; a missing grant returns **401** `42501 permission denied for function`. There are no 403/404/409 statuses: "not found" and "conflict/duplicate" are 400 or 200 with a code. Note: local Kong does not require the `apikey` header; a request with no key and no token runs as `anon` and is refused by grants (TC-API-001).

## 2. Harness

`docs/qa/scripts/api/lib.mjs` (Node 18+, plain `fetch`). Keys are read at runtime from `supabase status -o env`; none are stored. `login(phone)` does OTP `123456` sign-in and caches sessions in the scratchpad (GoTrue allows only 10 sign-ins per 5 minutes per IP, shared with other testers). `sql()` refuses anything but a single SELECT. Each `sNN_*.mjs` script is one workflow and appends to `results-roles.jsonl`; `gen.mjs` builds these documents. Run: `node s02_connect_register.mjs` from a copy of the folder.

## 3. Test cases

### Authentication (no token / no key)

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-001 | No apikey and no token: protected RPC | 401 (request runs as anon and is refused) | 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function admin_list_connect_requests"} | Pass |
| TC-API-001b | No apikey and no token: table read society_memberships | 401 or empty | 200 [] | Pass |

### Connect request and admin request actions, register society

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-002 | submit: society name 1 char | INVALID_SOCIETY_NAME | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_SOCIETY_NAME"} | Pass |
| TC-API-003 | submit: bad phone | INVALID_PHONE | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_PHONE"} | Pass |
| TC-API-004 | submit: no slot and not call-now | SLOT_REQUIRED | 400 {"code":"P0001","details":null,"hint":null,"message":"SLOT_REQUIRED"} | Pass |
| TC-API-005 | submit: slot in past | SLOT_IN_PAST | 400 {"code":"P0001","details":null,"hint":null,"message":"SLOT_IN_PAST"} | Pass |
| TC-API-006 | submit: bad email | INVALID_EMAIL | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_EMAIL"} | Pass |
| TC-API-007 | submit: valid request (anon) | 200 with request_code, status call_scheduled | 200 {"status":"call_scheduled","call_now":false,"created_at":"2026-11-10T09:17:19.229927+00:00","alternate_at":null,"preferred_at":"2026-11-12T09:17:17.632+00:00","request_code":"PR-DF64-PC9E","scheduled_at":"2026-11-12T09:1... | Pass |
| TC-API-008 | submit: response does not expose id/phone | only public fields | ["status","call_now","created_at","alternate_at","preferred_at","request_code","scheduled_at","preferred_slot"] | Pass |
| TC-API-009 | submit: duplicate open request same phone (other format) | {error: REQUEST_ALREADY_OPEN} | 200 {"error":"REQUEST_ALREADY_OPEN"} | Pass |
| TC-DB-001 | DB: exactly one open request for phone | 1 | 1 | Pass |
| TC-DB-002 | DB: duplicate authority number of contact dropped | 1 entry | [{"name": "QA-T Chairman Lotus", "phone": "9000000027"}] | Pass |
| TC-API-010 | status lookup with code+phone | 200 status call_scheduled | 200 {"status":"call_scheduled","call_now":false,"created_at":"2026-11-10T09:17:19.229927+00:00","alternate_at":null,"preferred_at":"2026-11-12T09:17:17.632+00:00","request_code":"PR-DF64-PC9E","scheduled_at":"2026-11-12T09:1... | Pass |
| TC-API-011 | status lookup with wrong phone | REQUEST_NOT_FOUND | 200 {"error":"REQUEST_NOT_FOUND"} | Pass |
| TC-API-012 | anon direct select on society_enrollment_requests | no rows / 401 | 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for table society_enrollment_requests"} | Pass |
| TC-API-013 | admin_list_connect_requests as plain user | NOT_PLATFORM_STAFF | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_PLATFORM_STAFF"} | Pass |
| TC-API-014 | admin_list_connect_requests as anon | 401/permission denied | 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function admin_list_connect_requests"} | Pass |
| TC-API-015 | admin list search by request code | 1 item | 200 {"items":[{"id":"d69ad157-caae-4efc-97f6-85c0fe1091ff","email":"qa-t-lotus@example.com","phone":"+919000000027","status":"call_scheduled","message":"QA-T roles test","call_now":false,"called_at":null,"created_at":"2026-1... | Pass |
| TC-API-016 | admin list invalid status filter | INVALID_STATUS | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_STATUS"} | Pass |
| TC-API-017 | admin get unknown id | REQUEST_NOT_FOUND | 400 {"code":"P0001","details":null,"hint":null,"message":"REQUEST_NOT_FOUND"} | Pass |
| TC-API-018 | admin reschedule | 200 status rescheduled | 200 {"id":"d69ad157-caae-4efc-97f6-85c0fe1091ff","email":"qa-t-lotus@example.com","phone":"+919000000027","status":"rescheduled","message":"QA-T roles test","call_now":false,"called_at":null,"created_at":"2026-11-10T09:17:19... | Pass |
| TC-API-019 | admin reschedule into past | SLOT_IN_PAST | 400 {"code":"P0001","details":null,"hint":null,"message":"SLOT_IN_PAST"} | Pass |
| TC-API-020 | admin mark called | 200 status contacted | 200 {"id":"d69ad157-caae-4efc-97f6-85c0fe1091ff","email":"qa-t-lotus@example.com","phone":"+919000000027","status":"contacted","message":"QA-T roles test","call_now":false,"called_at":"2026-11-10T09:17:19.902497+00:00","crea... | Pass |
| TC-API-021 | admin reject with 1-char reason | INVALID_REASON | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_REASON"} | Pass |
| TC-API-022 | admin get shows history | submitted, rescheduled, called | ["connect.submitted","connect.rescheduled","connect.called"] | Pass |
| TC-API-023 | admin_register_society as non-staff | NOT_PLATFORM_STAFF | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_PLATFORM_STAFF"} | Pass |
| TC-API-024 | register: pincode starting 0 | INVALID_PINCODE | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_PINCODE"} | Pass |
| TC-API-025 | register: feature without module | UNKNOWN_FEATURE | 400 {"code":"P0001","details":null,"hint":null,"message":"UNKNOWN_FEATURE"} | Pass |
| TC-DB-003 | DB: failed registrations created no society (atomic) | 0 | 0 | Pass |
| TC-API-026 | register society from request | 200 society_id, code, authority_count 1 | 200 {"code":"2KRN-DFHB","features":["bookings","polls","directory","flat_actions","community","moderation","visitors","staff_directory","facility_calendar"],"request_id":"d69ad157-caae-4efc-97f6-85c0fe1091ff","society_id":"1... | Pass |
| TC-API-027 | register again from the same request | REQUEST_ALREADY_REGISTERED (or duplicate reg no.) | 400 {"code":"P0001","details":null,"hint":null,"message":"DUPLICATE_REGISTRATION_NUMBER"} | Pass |
| TC-DB-004 | DB: request registered and linked | registered\|<society_id> | registered\|1b4973c3-50a7-4de5-837b-28c140be2ded | Pass |
| TC-DB-005 | DB: authority row seeded from request contact | 1\|9000000027 | 1\|9000000027 | Pass |
| TC-API-027b | register again from same request, new reg number | REQUEST_ALREADY_REGISTERED, no 2nd society | 400 {"code":"P0001","details":null,"hint":null,"message":"REQUEST_ALREADY_REGISTERED"} | Pass |

### Authority login and claim

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-030 | my_authority_societies for new authority | 1 society, claimed false, needs_setup | 200 {"societies":[{"claimed":false,"has_flat":false,"membership":null,"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","setup_state":"needs_setup","authority_id":"e8336d5d-574d-4de7-afcf-d81f2733079d","society_code":"2KRN... | Pass |
| TC-API-031 | my_authority_societies for non-authority | empty list | 200 {"societies":[]} | Pass |
| TC-API-032 | claim_authority_for_society by non-authority | NOT_AN_AUTHORITY | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_AN_AUTHORITY"} | Pass |
| TC-API-033 | claim_authority_for_society by authority | 200 refresh_required true | 200 {"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","setup_state":"needs_setup","refresh_required":true} | Pass |
| TC-API-034 | claim again (idempotent) | 200, still one membership | 200 {"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","setup_state":"needs_setup","refresh_required":true} | Pass |
| TC-DB-010 | DB: one secretary membership after 2 claims | 1\|secretary/active | 1\|secretary/active | Pass |
| TC-API-035 | JWT after refresh carries society_id + role | society_id=1b4973c3-50a7-4de5-837b-28c140be2ded, role=secretary | {"s":"1b4973c3-50a7-4de5-837b-28c140be2ded","r":"secretary"} | Pass |

### Authority claim and setup

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-036 | setup_upsert_wing on society B by secretary of society A | NOT_SOCIETY_MANAGER | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-API-037 | setup_upsert_wing by non-member | NOT_SOCIETY_MANAGER | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-API-038 | setup_get_state as anon | 401 | 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function setup_get_state"} | Pass |
| TC-API-039 | setup_upsert_wing empty name | INVALID_WING_NAME | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_WING_NAME"} | Pass |
| TC-API-040 | setup_upsert_wing create | 200 Wing code A | 200 {"id":"2f519ebe-3316-4895-b6c6-a621d5ffed77","code":"A","name":"QA-T Wing A","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-API-041 | setup_upsert_wing duplicate name (case-insensitive) | WING_NAME_EXISTS | 400 {"code":"P0001","details":null,"hint":null,"message":"WING_NAME_EXISTS"} | Pass |
| TC-API-042 | setup_upsert_wing duplicate code | WING_CODE_EXISTS | 400 {"code":"P0001","details":null,"hint":null,"message":"WING_CODE_EXISTS"} | Pass |
| TC-API-043 | setup_upsert_floor number 999 | INVALID_FLOOR_NUMBER | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_FLOOR_NUMBER"} | Pass |
| TC-API-044 | setup_upsert_floor duplicate number in wing | FLOOR_EXISTS | 400 {"code":"P0001","details":null,"hint":null,"message":"FLOOR_EXISTS"} | Pass |
| TC-API-045 | setup_complete with no flats | SETUP_NEEDS_FLAT | 400 {"code":"P0001","details":null,"hint":null,"message":"SETUP_NEEDS_FLAT"} | Pass |
| TC-API-046 | bulk flats with duplicate in list | FLAT_EXISTS: 101, nothing created | 400 {"code":"P0001","details":null,"hint":null,"message":"FLAT_EXISTS: 101"} | Pass |
| TC-DB-011 | DB: bulk create is all-or-nothing | 0 flats | 0 | Pass |
| TC-API-047 | bulk flats valid | created 2 | 200 {"flats":[{"id":"2f3d4cb5-0b5e-49d2-8229-043079236ffa","number":"101","status":"vacant","wing_id":"2f519ebe-3316-4895-b6c6-a621d5ffed77","bedrooms":null,"floor_id":"d09e509d-7e18-465f-8b37-d27a001580f3","area_sqft":null,... | Pass |
| TC-API-048 | same flat number 101 in another wing | allowed (unique per wing) | 200 {"flats":[{"id":"b0ff90c8-9a54-43ae-8d7e-5a10e3fd02dc","number":"101","status":"vacant","wing_id":"27424f91-1ac0-4439-b256-3c35859fc535","bedrooms":null,"floor_id":"9e2c8269-37c0-441e-b447-a80854bcab5a","area_sqft":null,... | Pass |
| TC-API-049 | setup_upsert_flat duplicate number | FLAT_EXISTS | 400 {"code":"P0001","details":null,"hint":null,"message":"FLAT_EXISTS"} | Pass |
| TC-API-050 | setup_upsert_flat floor of another wing | FLOOR_NOT_FOUND | 400 {"code":"P0001","details":null,"hint":null,"message":"FLOOR_NOT_FOUND"} | Pass |
| TC-API-051 | skip a required step | STEP_NOT_SKIPPABLE | 400 {"code":"P0001","details":null,"hint":null,"message":"STEP_NOT_SKIPPABLE"} | Pass |
| TC-API-052 | setup_complete | 200 counts wings 2 floors 3 flats 5 | 200 {"counts":{"flats":5,"wings":2,"floors":3},"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","setup_state":"needs_personal_onboarding","setup_completed_at":"2026-11-10T09:18:57.072361+00:00"} | Pass |

### Resident onboarding (onboard_resident)

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-053 | authority onboards own flat | status active | 200 {"status":"active","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-DB-012 | DB: authority still one membership, now with flat | 1\|secretary/active/true | 1\|secretary/active/true | Pass |
| TC-API-054-03 | resident 9000000003 onboards A-102 as owner | status active | 200 {"status":"active","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-API-054-04 | resident 9000000004 onboards A-201 as owner | status active | 200 {"status":"active","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-API-054-07 | resident 9000000007 onboards A-202 as owner | status active | 200 {"status":"active","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-API-055 | onboard with wrong society code | {error: INVALID_CODE} | 200 {"error":"INVALID_CODE"} | Pass |
| TC-API-056 | onboard with flat not in society | {error: FLAT_NOT_IN_SOCIETY} | 200 {"error":"FLAT_NOT_IN_SOCIETY"} | Pass |

### Part 16: multi-society isolation

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-ISO-301 | chairman: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-302 | treasurer: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-303 | committee: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-304 | member: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-305 | guard: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-306 | A-secretary: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-307 | A-owner: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-308 | A-tenant: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-309 | A-family: read every society-scoped table (49) filtered to the other society | 0 rows from every table | 0 rows from all 49 tables | Pass |
| TC-ISO-310 | secretary of B calls setup_get_state with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-311 | secretary of B calls society_admin_dashboard with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-312 | secretary of B calls resident_dashboard with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_MEMBER"} | Pass |
| TC-ISO-313 | secretary of B calls manager_list_resident_records with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-314 | secretary of B calls manager_list_staff with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-315 | secretary of B calls manager_list_tenants with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-316 | secretary of B calls import_list_batches with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-317 | secretary of B calls get_society_registration with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_MEMBER"} | Pass |
| TC-ISO-318 | secretary of B calls my_society_features with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_MEMBER"} | Pass |
| TC-ISO-319 | secretary of B calls list_flat_owners with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_ALLOWED"} | Pass |
| TC-ISO-320 | secretary of B calls reveal_phone with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_FOUND_OR_CROSS_TENANT"} | Pass |
| TC-ISO-321 | secretary of B calls set_active_society with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_MEMBER"} | Pass |
| TC-ISO-322 | secretary of B calls family_invite_list with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_ALLOWED"} | Pass |
| TC-ISO-323 | secretary of B calls manager_resident_type_counts with society A ids | refused, no A data | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-324 | secretary of B calls add_complaint_response with society A ids | refused, no A data | 400 {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum complaint_status: \"in_progress\""} | Pass |
| TC-ISO-325 | secretary of A calls society_admin_dashboard on society B | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-326 | secretary of A calls manager_list_resident_records on society B | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-327 | secretary of A calls setup_get_state on society B | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SOCIETY_MANAGER"} | Pass |
| TC-ISO-328 | member PATCHes own society_memberships.role to secretary | denied, role unchanged | 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for table society_memberships"} / role=member | Pass |
| TC-ISO-329 | member INSERTs itself into platform_admins | denied | 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for table platform_admins"} | Pass |
| TC-ISO-330 | member PATCHes societies.name | denied | 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for table societies"} | Pass |
| TC-ISO-331 | member INSERTs society_features row (has table grant) | denied by RLS | 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"society_features\""} | Pass |
| TC-ISO-332 | member PATCHes platform_features price (has column grant) | 0 rows changed | 200 [] | Pass |
| TC-ISO-333 | member INSERTs itself as a guard | denied | 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for table society_guards"} | Pass |
| TC-ISO-334 | member PATCHes profiles.active_society_id to society A | denied (no column grant) | 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for table profiles"} | Pass |
| TC-ISO-335 | member set_active_society to a society it is not in | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_MEMBER"} | Pass |
| TC-ISO-336 | member JWT after those attempts | society_id=B, role=member | {"s":"1b4973c3-50a7-4de5-837b-28c140be2ded","r":"member"} | Pass |
| TC-ISO-337 | member reads profiles.phone directly | phone column not readable | 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for table profiles"} | Pass |
| TC-ISO-338 | member lists profiles: none belong to society A | 0 | 4 profiles visible, 0 in A | Pass |

### Complaints

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-401 | guard files a complaint | refused (no membership) | 400 {"code":"P0001","details":null,"hint":null,"message":"NO_SOCIETY"} | Pass |
| TC-API-402 | member files complaint for someone else's flat | INVALID_FLAT | 200 {"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","complaint_id":"fc45ddee-2899-4ced-8331-c588c82867a0"} | Fail |
| TC-API-403 | member files complaint (own flat) | 200 | 200 {"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","complaint_id":"0acccba5-3253-487c-a274-252e0dd00482"} | Pass |
| TC-API-404 | re-submit with same complaint id (idempotency) | still 1 row | 409 {"code":"23505","details":"Key (id)=(0acccba5-3253-487c-a274-252e0dd00482) already exists.","hint":n / rows=1 | Pass |
| TC-API-405 | member responds to a complaint | refused (board only) | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_OWNER"} | Pass |
| TC-API-406 | secretary of A responds to B complaint | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_OWNER"} | Pass |
| TC-API-407 | secretary of A reads B complaint directly | 0 rows | 200 [] | Pass |
| TC-API-408 | guard reads complaints table | 0 rows | 200 [] | Pass |
| TC-API-409 | committee member claims complaint | 200 | 200 {"id":"0acccba5-3253-487c-a274-252e0dd00482","kind":"society","status":"checking","owner_id":"e6f23b21-acfe-4c4f-abba-d7366b6b1cc7","claimed_at":"2026-11-10T09:52:00.783998+00:00","created_at":"2026-11-10T09:51:58.605303... | Pass |
| TC-API-410 | response kind 'open' | INVALID_RESPONSE_KIND | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_RESPONSE_KIND"} | Pass |
| TC-API-411 | treasurer resolves a complaint owned by committee member | observed | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_OWNER"} | Pass |
| TC-API-412 | owner (committee) resolves | status resolved | 200 / status=resolved | Pass |
| TC-DB-401 | DB: complaint_responses rows for the trail | >=2 | 2 | Pass |
| TC-API-413 | respond to unknown complaint id | not found code | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_OWNER"} | Pass |

### Notices

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-414 | member posts a notice | INSUFFICIENT_ROLE | 400 {"code":"P0001","details":null,"hint":null,"message":"INSUFFICIENT_ROLE"} | Pass |
| TC-API-415 | guard posts a notice | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NO_SOCIETY"} | Pass |
| TC-API-416 | committee member posts a notice | 200 | 200 {"poll_id":null,"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","notification_id":"369688e2-247a-4389-8690-ec02aa9d47cb"} | Pass |
| TC-API-417 | member of B reads the notice | 1 row | 200 [{"id":"369688e2-247a-4389-8690-ec02aa9d47cb","title":"QA-T Water cut Sunday"}] | Pass |
| TC-API-418 | owner of A reads B notice | 0 rows | 200 [] | Pass |
| TC-API-419 | member DELETEs the notice directly (table has DELETE grant) | row kept | 200 / rows=1 | Pass |

### Polls

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-420 | poll with one option | POLL_OPTIONS_RANGE | 400 {"code":"P0001","details":null,"hint":null,"message":"POLL_OPTIONS_RANGE"} | Pass |
| TC-API-421 | treasurer creates poll | 200 | 200 {"poll_id":"13c0b8d3-3f8a-41cf-9b49-0686016bced7","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","notification_id":"a646a55c-4fcd-4763-9165-a5b6f9a4528d"} | Pass |
| TC-API-422 | member votes | 200 | 200 {"tally":{"5841ed0c-470d-436a-bb5d-2d03df4898a3":1},"poll_id":"13c0b8d3-3f8a-41cf-9b49-0686016bced7","my_option":"5841ed0c-470d-436a-bb5d-2d03df4898a3"} | Pass |
| TC-API-423 | member votes again (change vote) | still 1 vote row | 200 / rows=1 | Pass |
| TC-API-424 | owner of A votes in B poll | POLL_NOT_FOUND | 400 {"code":"P0001","details":null,"hint":null,"message":"POLL_NOT_FOUND"} | Pass |
| TC-API-425 | guard votes | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NO_SOCIETY"} | Pass |
| TC-API-426 | member closes poll | INSUFFICIENT_ROLE | 400 {"code":"P0001","details":null,"hint":null,"message":"INSUFFICIENT_ROLE"} | Pass |
| TC-API-427 | member reads results | 200 | 200 {"tally":{"8d816831-5144-4690-8aa1-1a600b470d46":1},"total":1,"poll_id":"13c0b8d3-3f8a-41cf-9b49-0686016bced7","my_option":"8d816831-5144-4690-8aa1-1a600b470d46"} | Pass |
| TC-API-428 | treasurer closes poll | 200 | 200 {"status":"closed","poll_id":"13c0b8d3-3f8a-41cf-9b49-0686016bced7"} | Pass |
| TC-API-429 | vote after close | POLL_CLOSED | 400 {"code":"P0001","details":null,"hint":null,"message":"POLL_CLOSED"} | Pass |

### Bookings

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-430 | member creates an amenity | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SECRETARY"} | Pass |
| TC-API-431 | chairman creates an amenity | 200 | 200 {"id":"9c468816-44c8-491f-b61c-587f1e02bdf8","name":"QA-T Clubhouse","status":"working","closed_until":null} | Pass |
| TC-API-432 | end before start | TIME_ORDER | 400 {"code":"P0001","details":null,"hint":null,"message":"TIME_ORDER"} | Pass |
| TC-API-433 | 5-hour booking | DURATION | 400 {"code":"P0001","details":null,"hint":null,"message":"DURATION"} | Pass |
| TC-API-434 | guard books | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NO_SOCIETY"} | Pass |
| TC-API-435 | member books 10-11 | 200 pending | 200 {"booking_id":"4a999d18-8974-4b96-b3c5-69e8222bc3f2","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-API-436 | second request same slot while first pending | allowed as pending, or conflict code (observed) | 200 {"booking_id":"17ffcb74-3833-4d12-b9c7-a19d75ec84b0","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded"} | Pass |
| TC-API-437 | member approves own booking | INSUFFICIENT_ROLE | 400 {"code":"P0001","details":null,"hint":null,"message":"INSUFFICIENT_ROLE"} | Pass |
| TC-API-438 | secretary of A approves B booking | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"BOOKING_NOT_FOUND"} | Pass |
| TC-API-439 | committee member approves | 200 | 200 {"booking":{"id":"4a999d18-8974-4b96-b3c5-69e8222bc3f2","status":"approved","purpose":"QA-T birthday","amenity_id":"9c468816-44c8-491f-b61c-587f1e02bdf8","created_at":"2026-11-10T09:53:06.678251+00:00","society_id":"1b49... | Pass |
| TC-API-440 | approve overlapping booking | not approved (slot_taken) | 200 {"reason":"slot_taken","approved":false} | Pass |
| TC-DB-402 | DB: at most one approved booking for the slot | 1 | 1 | Pass |

### Visitors

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-441 | guard of B logs visit to a flat in A | FLAT_NOT_IN_SOCIETY | 400 {"code":"P0001","details":null,"hint":null,"message":"FLAT_NOT_IN_SOCIETY"} | Pass |
| TC-API-442 | member logs a visit (guard RPC) | NOT_GUARD | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_GUARD"} | Pass |
| TC-API-443 | guard logs visit to A-202 | 200 | 200 {"status":"pending","request_id":"8eed21c9-3c97-4eef-9f90-b26ac097e2cc"} | Pass |
| TC-API-444 | resident of another flat decides | NOT_YOUR_FLAT | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_YOUR_FLAT"} | Pass |
| TC-API-445 | treasurer (manager) reads the visit | observed (secretary read policy) | 200 [{"id":"8eed21c9-3c97-4eef-9f90-b26ac097e2cc","visitor_phone":"9876543210"}] | Pass |
| TC-API-446 | committee member of another flat reads the visit | 0 rows | 200 [{"id":"8eed21c9-3c97-4eef-9f90-b26ac097e2cc"}] | Fail |
| TC-API-447 | flat resident approves | 200 | 200 {"status":"approved","request_id":"8eed21c9-3c97-4eef-9f90-b26ac097e2cc"} | Pass |
| TC-API-448 | decide again | ALREADY_DECIDED | 400 {"code":"P0001","details":null,"hint":null,"message":"ALREADY_DECIDED"} | Pass |
| TC-API-449 | resident PATCHes visitor_requests.status directly (table has UPDATE grant) | unchanged approved | 200 / status=approved | Pass |
| TC-API-460 | plain member (A-202) reads a visit for flat A-201 | 0 rows (not my flat) | 200 [{"id":"bf6ff4ea-5021-4f3a-87f5-161ab58759d1","visitor_name":"QA-T Plumber visit","visitor_phone":"9876500000","flat_id":"68fc375f-e557-498c-9fd7-35ba46c2ba32"}] | Fail |

### SOS

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-API-450 | owner of A raises SOS in B | NOT_A_MEMBER | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_MEMBER"} | Pass |
| TC-API-451 | SOS with empty description | INVALID_DESC | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_DESC"} | Pass |
| TC-API-452 | member raises SOS to watchman | 200 | 200 {"id":"7ea99031-50e7-4e62-9164-dcf48e235116"} | Pass |
| TC-API-453 | guard dashboard shows active SOS | active_sos >= 1 | 200 {"denied":0,"pending":0,"approved":1,"active_sos":1,"society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","society_name":"QA-T Lotus Society","todays_visitors":1} | Pass |
| TC-API-454 | secretary of A reads B SOS | 0 rows | 200 [] | Pass |
| TC-API-455 | committee member (not raiser) resolves | NOT_ALLOWED | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_ALLOWED"} | Pass |
| TC-API-456 | secretary of A resolves B SOS | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_ALLOWED"} | Pass |
| TC-API-457 | guard resolves | observed | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_ALLOWED"} | Pass |
| TC-API-458 | treasurer (manager) resolves | resolved | 204 null / resolved=t | Pass |


## 4. Bugs found (API)

| ID | Severity | Title |
|---|---|---|
| API-001 | High | A member can file a complaint attributed to any other flat in the society |
| API-002 | Medium | Every resident can read every flat's visitor log, including visitor phone numbers |
| API-003 | Low | A guard cannot resolve an SOS addressed to guards |

