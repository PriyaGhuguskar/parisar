# Society Onboarding: Backend API

The contract for the onboarding screens. Migrations `20261106000058` to `20261106000074`, wrappers in
`packages/api-client/src`, enums in `packages/shared-types/src/enums.js`. Everything here was applied
to the local database and exercised by `tests/isolation/onboarding-*.test.js` (see the last section).

---

## 1. Conventions

### Calling

Call RPCs through the `@parisar/api-client` wrappers. Each wrapper is `fn(supabase, input)` and returns
**one of two things**:

- the RPC's JSON on success, or
- `{ error: "CODE" }` for every expected failure.

A wrapper **throws** only when the failure is not one of our codes (network down, missing function,
gateway error). Never show a throw as a business result; show a generic "Something went wrong, try again".

The RPCs report failures two ways, and the wrappers fold both into `{ error }`:

- a raised Postgres error whose message is the code (for example `NOT_SOCIETY_MANAGER`). A few add
  detail after a colon (`FLAT_EXISTS: 101`); the wrapper keeps just the code.
- a normal return of `{ "error": "CODE" }`. This is used where a failed attempt must still count
  against a rate limit (bad society codes, bad invite tokens, lookups), because a raised error would
  roll the count back.

If you call `supabase.rpc` directly, handle both. `onboardingErrorCode(error)` extracts the code.

### Who may call

| Term | Meaning (always checked live against the database, never from the JWT) |
|---|---|
| **anon** | No session. Only `submit_connect_request` and `get_connect_request_status`. |
| **signed in** | Any session. |
| **verified phone** | The caller's `auth.users.phone` with `phone_confirmed_at` set, i.e. proven by OTP. Email-only or unconfirmed accounts match nothing. |
| **staff** | Platform admin or sales (`is_platform_admin_or_sales()`). |
| **manager** | Active membership in **that** society with role `secretary` or `co_secretary` (Chairman, Secretary, Treasurer titles). |
| **manager or staff** | Either of the above. |
| **owner of the flat** | Active membership on that flat with `resident_type = 'owner'`. |

Platform staff deliberately have **no** access to resident names, phones, imports, records, proofs,
tenants or staff details. Those are manager-only. Staff get society-level and request-level data.

"Not your society" and "does not exist" always return the **same** code, so ids cannot be probed.

### Session refresh

The JWT carries `society_id` and `role` from the Auth Hook, and only learns about a new membership on
refresh. Any result with `refresh_required: true` means call `supabase.auth.refreshSession()` before
navigating. Results that create memberships: `claim_authority_for_society`, `resident_confirm_record`,
`family_invite_accept`, `tenant_activate` (for the tenant), and the requester after
`household_decide_request` or `tenant_admin_decide` (they are told on next sign-in; poll
`my_onboarding_state` on their side).

### Common codes

| Code | When |
|---|---|
| `AUTH_REQUIRED` | No session. |
| `NOT_PLATFORM_STAFF` | Staff-only RPC. |
| `NOT_SOCIETY_MANAGER` | Manager-only RPC (or manager-or-staff RPC called by neither). |
| `SOCIETY_SERVICE_STOPPED` | Any write into a paused or blocked society by a non-staff user (existing trigger). |
| `SOCIETY_BLOCKED` | Joining a blocked society. |
| `INVALID_CODE`, `CODE_PAUSED`, `TOO_MANY_CODE_ATTEMPTS` | Society code typed by a person with no membership yet. 5 failures in 15 minutes locks that user out of every code RPC for 15 minutes (shared with `onboard_resident`). |
| `RATE_LIMITED` and `*_RATE_LIMITED` | See each RPC. |

### Pagination

List RPCs take `p_limit` (1 to 100, default 25, clamped) and `p_offset` (default 0) and return
`{ items, total, limit, offset }`. `total` is the count after filters.

### Phones

Every RPC accepts `9876543210`, `+91 98765 43210`, `09876543210` and `9876543210.0` (Excel) and stores
the bare 10 digits. Returned phones are 10 digits.

---

## 2. Data model

Three separate fields. One person can hold one of each.

| Field | Where | Values |
|---|---|---|
| Resident type | `society_memberships.resident_type` | `owner`, `tenant`, `family_member` |
| Society title | `society_memberships.society_title` | `resident`, `chairman`, `secretary`, `treasurer`, `committee_member` (NULL = default for role) |
| Staff role | `society_staff.category` | `security`, `plumber`, `electrician`, `cleaner`, `gardener`, `maintenance_staff`, `other` (older: `maid`, `driver`, `cook`) |

The title maps onto `membership_role`, which still drives every permission and the JWT hook:

| Title | Role it grants |
|---|---|
| resident | member |
| committee_member | board_member |
| treasurer | co_secretary |
| secretary | secretary |
| chairman | secretary |

A staff record grants nothing: no login, no membership, no role. Gate guards still come from
`secretary_add_guard` / `claim_guard`.

Enums for every value list in this document are exported from `@parisar/shared-types`:
`RESIDENT_TYPE`, `SOCIETY_TITLE`, `SOCIETY_TITLE_ROLE`, `STAFF_ROLE`, `CONNECT_REQUEST_STATUS`,
`SOCIETY_TYPE`, `SETUP_STATE`, `SETUP_STEP`, `SETUP_REQUIRED_STEPS`, `FLAT_TYPE`, `FLAT_STATUS`,
`RESIDENT_RECORD_STATUS`, `IMPORT_ROW_STATUS`, `TENANT_STATUS`, `POLICE_VERIFICATION_STATUS`,
`FAMILY_RELATIONSHIP`, `HOUSEHOLD_REQUEST_STATUS`, `STAFF_SHIFT`, `ID_PROOF_TYPE`, `PROOF_DOC_TYPE`.

---

## 3. Connect With Us requests

Lifecycle (`CONNECT_REQUEST_STATUS`):

```
submit (call now)   -> new
submit (with slot)  -> call_scheduled
staff reschedule    -> call_scheduled (first slot on a "call now" request) | rescheduled
staff mark called   -> contacted          (can still be rescheduled)
staff reject        -> rejected           (closed)
staff register      -> registered         (closed; legacy rows with 'approved' are reported as 'registered')
```

Open = `new`, `call_scheduled`, `rescheduled`, `contacted`. One open request per phone.

### `submit_connect_request` (anon)
Wrapper `submitConnectRequest(sb, { societyName, contactName, phone, email?, authorityNumbers?, preferredAt?, callNow?, alternateAt?, message? })`

| Param | Type | Rule |
|---|---|---|
| `p_society_name` | text | 2 to 120 chars |
| `p_contact_name` | text | 2 to 80 chars. Becomes the first authority number with `phone`. |
| `p_phone` | text | Indian mobile |
| `p_email` | text, null | valid email, lowercased |
| `p_authority_numbers` | jsonb, default `[]` | up to 5 `{ phone, name? }`; duplicates of each other or of `p_phone` are dropped silently |
| `p_preferred_at` | timestamptz, null | required unless `p_call_now`. Not more than 2 min in the past, not more than 90 days ahead. |
| `p_call_now` | boolean, default false | |
| `p_alternate_at` | timestamptz, null | same window, must differ from `p_preferred_at`; ignored when `p_call_now` |
| `p_message` | text, null | up to 1000 chars |

Returns only:
```json
{ "request_code": "PR-8K9M-6K43", "status": "call_scheduled", "call_now": false,
  "preferred_at": "...", "preferred_slot": "Sat, 07 Nov 2026, 04:30 PM", "alternate_at": "...",
  "scheduled_at": "...", "created_at": "..." }
```
`preferred_slot` is IST text. For call now: `status: "new"`, `preferred_slot: "Call me now"`, times null.

Errors: `INVALID_SOCIETY_NAME`, `INVALID_CONTACT_NAME`, `INVALID_PHONE`, `INVALID_EMAIL`,
`INVALID_MESSAGE`, `INVALID_AUTHORITY_NUMBERS` (not an array, more than 5, item not an object, name
over 80), `INVALID_AUTHORITY_NUMBER` (bad phone), `SLOT_REQUIRED`, `SLOT_IN_PAST`, `SLOT_TOO_FAR`,
`INVALID_ALTERNATE_SLOT`, `RATE_LIMITED`. Returned (not raised): `{ error: "REQUEST_ALREADY_OPEN" }`
when that phone already has an open request; no code is revealed. Show "We already have your request".

Rate limits: 10/hour per client address, 3/hour per phone, plus the table trigger (60/hour total,
5/hour per phone prefix). The address comes from proxy headers and is best effort.

### `get_connect_request_status` (anon)
Wrapper `getConnectRequestStatus(sb, { requestCode, phone })`. Needs the code **and** the submitting
phone. Same return shape as submit, with the current status. A wrong pair returns
`{ error: "REQUEST_NOT_FOUND" }`, identical to a missing code. Errors: `RATE_LIMITED` (30 per 10 min per
address, 10 per 10 min per code).

### Request object (staff RPCs below)
```json
{ "id", "request_code", "society_name", "contact_name", "phone": "+919876543210", "email",
  "authority_numbers": [{ "name": "Asha Patil", "phone": "9876543210" }, { "name": null, "phone": "..." }],
  "status", "call_now", "preferred_at", "preferred_slot", "alternate_at", "scheduled_at", "message",
  "called_at", "rejected_reason", "rejected_at", "registered_at", "reschedule_count", "society_id",
  "created_at", "updated_at" }
```
`authority_numbers[0]` is always the contact. Rows from the older form have `authority_numbers: []`.

### `admin_list_connect_requests` (staff)
Wrapper `adminListConnectRequests(sb, { search?, status?, from?, to?, limit?, offset? })`

- `p_search`: matches request code, society name, contact name, email (case-insensitive, literal). If
  the text is phone-shaped (only digits, spaces, `+ ( ) -`, at least 3 digits) it also matches phones.
- `p_status`: one of the statuses above, or `open`. `registered` includes legacy `approved`.
- `p_from`, `p_to`: on `created_at`.

Order: open first, then call-now, then soonest slot, then newest. Returns `{ items: [Request], total,
limit, offset }`. Errors: `NOT_PLATFORM_STAFF`, `INVALID_STATUS`.

### `admin_get_connect_request` (staff)
`adminGetConnectRequest(sb, requestId)`. Request object plus `notes`, `society: { id, name, code } | null`,
and `history: [{ action, actor_name, payload, at }]` (actions `connect.submitted`, `connect.rescheduled`,
`connect.called`, `connect.rejected`, `connect.registered`). Errors: `NOT_PLATFORM_STAFF`, `REQUEST_NOT_FOUND`.

### `admin_reschedule_connect_request` (staff)
`adminRescheduleConnectRequest(sb, { requestId, scheduledAt, note? })`. Returns the Request. Errors:
`NOT_PLATFORM_STAFF`, `REQUEST_NOT_FOUND`, `REQUEST_CLOSED`, `SLOT_REQUIRED`, `SLOT_IN_PAST`,
`SLOT_TOO_FAR`, `INVALID_NOTE` (over 500).

### `admin_mark_connect_called` (staff)
`adminMarkConnectCalled(sb, { requestId, note? })`. Sets `contacted`, `called_at`. Returns the Request.
Errors: `NOT_PLATFORM_STAFF`, `REQUEST_NOT_FOUND`, `REQUEST_CLOSED`, `INVALID_NOTE`.

### `admin_reject_connect_request` (staff)
`adminRejectConnectRequest(sb, { requestId, reason })`. Reason 3 to 500 chars. Returns the Request.
Errors: `NOT_PLATFORM_STAFF`, `REQUEST_NOT_FOUND`, `REQUEST_CLOSED`, `INVALID_REASON`.

### `admin_onboarding_metrics` (staff)
`adminOnboardingMetrics(sb)` returns
`{ total_societies, active_societies, pending_requests, pending_calls, total_residents }`.
`active_societies` = service status active. `pending_requests` = open requests.
`pending_calls` = `new` + `call_scheduled` + `rescheduled` (not yet called). `total_residents` =
distinct users with an active membership.

`admin_stats` (existing) now counts the new open statuses too; its shape is unchanged.

Registration from a request is `admin_register_society` with `p_request_id` (section 4).

---

## 4. Registration and features

### `admin_register_society` (staff)
Wrapper `adminRegisterSociety(sb, input)`. Use this instead of `admin_create_society` for new screens
(the old RPC still works).

| Param | Wrapper key | Rule |
|---|---|---|
| `p_name` | name | 3 to 100 |
| `p_address_line` | addressLine | at least 5 |
| `p_city`, `p_state` | city, state | at least 2 |
| `p_pincode` | pincode | 6 digits, not starting 0 |
| `p_landmark` | landmark | optional |
| `p_authorities` | authorities | `[{ name, phone }]`; may be empty only when `p_request_id` is given |
| `p_request_id` | requestId | optional; the request must still be open |
| `p_registration_number` | registrationNumber | 1 to 60; unique per state, case-insensitive |
| `p_society_type` | societyType | `SOCIETY_TYPE` |
| `p_registration_date` | registrationDate | `YYYY-MM-DD`, not in the future |
| `p_official_email` | officialEmail | valid email |
| `p_official_phone` | officialPhone | 6 to 20 of `0-9 + ( ) -` and spaces (landlines allowed) |
| `p_country` | country | default `India`, 2 to 60 |
| `p_features` | features | catalogue keys to switch on; each must have a real module |

With a request: authorities are `p_authorities` plus every number on the request (contact's name for
the contact, the given name or `"Authority"` otherwise; `p_authorities` wins for a phone in both). The
request becomes `registered` and links `society_id`.

Returns `{ society_id, code, authority_count, request_id, features }`. Errors: `NOT_PLATFORM_STAFF`,
`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_CITY`, `INVALID_STATE`, `INVALID_PINCODE`,
`AUTHORITY_REQUIRED`, `INVALID_AUTHORITY_NAME`, `INVALID_AUTHORITY_PHONE`, `DUPLICATE_AUTHORITY_PHONE`,
`INVALID_REGISTRATION_NUMBER`, `DUPLICATE_REGISTRATION_NUMBER`, `INVALID_SOCIETY_TYPE`,
`INVALID_REGISTRATION_DATE`, `INVALID_OFFICIAL_EMAIL`, `INVALID_OFFICIAL_PHONE`, `INVALID_COUNTRY`,
`UNKNOWN_FEATURE`, `REQUEST_NOT_FOUND`, `REQUEST_ALREADY_REGISTERED`, `REQUEST_REJECTED`.

### `admin_update_society_registration` (staff)
`adminUpdateSocietyRegistration(sb, { societyId, registrationNumber?, societyType?, registrationDate?, officialEmail?, officialPhone?, country? })`.
A key left out (null) is unchanged; a field cannot be cleared through this RPC. Returns the
registration object below. Errors: as above plus `SOCIETY_NOT_FOUND`.

### `get_society_registration` (active member of the society, or staff)
`getSocietyRegistration(sb, societyId)` returns
`{ id, name, registration_number, society_type, registration_date, official_email, official_phone,
address_line, landmark, city, state, pincode, country, service_status, setup_completed_at, code }`.
Errors: `NOT_A_MEMBER`.

### `admin_feature_catalogue` (staff)
`adminFeatureCatalogue(sb)` returns
```json
{ "features": [{ "key", "name", "description", "price_monthly", "is_core", "has_module": true }],
  "unavailable": [{ "key": "parking", "name": "Parking", "reason": "...", "has_module": false }] }
```
`unavailable` is `parking`, `accounting`, `vendors`, `events`: listed in the brief, no module exists.
Show them disabled with "Not available yet", or not at all. They cannot be granted (`UNKNOWN_FEATURE`).
New catalogue keys with real modules: `visitors`, `sos` (core), `staff_directory`,
`facility_calendar` (switched on for every existing society; price 0 placeholder).

Note: `admin_set_feature` and `admin_society_detail` (existing) still work on the catalogue.

### `my_society_features` (active member or active guard of the society, or staff)
`mySocietyFeatures(sb, societyId)` returns `[{ key, name, is_core, enabled }]` for real modules only.
Use it to hide navigation. Errors: `NOT_A_MEMBER`.

---

## 5. Authority login

An Authority Number is a mobile on the society's authority list. OTP proves it. No RPC takes a phone
number, so a number alone never reveals a society. Flow after OTP:

1. `my_authority_societies()`. Empty list: not an authority (continue to resident flows).
2. One society: claim it. Several: let them pick, then claim.
3. `claim_authority_for_society(id)`, then `refreshSession()`.
4. Route by `setup_state`.

`setup_state` (`SETUP_STATE`):

| Value | Meaning | Go to |
|---|---|---|
| `needs_setup` | `setup_complete` has not run for the society | setup wizard |
| `needs_personal_onboarding` | structure done; this authority has no flat and has not skipped | pick own flat (`onboard_resident`) or skip |
| `complete` | nothing pending | dashboard |

Societies that already had flats before this migration count as set up.

### `my_authority_societies` (verified phone)
`myAuthoritySocieties(sb)` returns
```json
{ "societies": [{ "authority_id", "society_id", "society_name", "society_code", "service_status",
  "claimed": false, "setup_state", "setup_completed_at", "has_flat",
  "membership": { "id", "role", "status", "flat_id", "society_title" } | null }] }
```
Only rows whose phone equals the caller's verified phone and that are unclaimed or claimed by them.

### `claim_authority_for_society` (verified phone on that society's list)
`claimAuthorityForSociety(sb, societyId)`. Idempotent. Links the authority, upgrades an existing active
or pending membership to `secretary` (one person, one membership) or creates a flat-less one, and
makes it the active society. Returns `{ society_id, setup_state, refresh_required: true }`.
Errors: `NO_PHONE`, `NOT_AN_AUTHORITY`, `SOCIETY_BLOCKED`.

### `authority_skip_personal_onboarding` (claimed authority of the society)
`authoritySkipPersonalOnboarding(sb, societyId)` for an authority who does not live there. Returns
`{ society_id, setup_state }`. Errors: `NOT_AN_AUTHORITY`.

The existing `claim_society_authority()` and `my_login_state()` are unchanged.

### `set_member_society_title` (live `secretary` of the society)
`setMemberSocietyTitle(sb, { societyId, targetUserId, title })`. Sets title and the mapped role.
Granting chairman/secretary adds or links the person on the authority list; taking it away removes
their authority row so the office does not come back on next sign-in. You may change your own title
only if your role stays the same. Returns `{ user_id, society_title, role }`.
Errors: `ONLY_SECRETARY_CAN_SET_TITLE`, `INVALID_TITLE`, `TARGET_NOT_IN_SOCIETY`,
`CANNOT_CHANGE_OWN_ROLE`, `TARGET_HAS_NO_PHONE`, `ALREADY_AUTHORITY`.
`set_membership_role` / `transfer_secretary_role` still work; a title that no longer fits the new role
is cleared automatically.

### `my_onboarding_state` (signed in)
`myOnboardingState(sb)`: one call after OTP. Returns
`{ authority_societies, resident_records, tenant_registrations, household_requests }`, each the same
shape as `my_authority_societies().societies`, `my_resident_records()`, `my_tenant_registrations()` and
`household_my_requests()`.

---

## 6. Setup

All setup RPCs: **manager or staff** of the society. Writes take a per-society lock so two tabs cannot
create duplicates. Wing names and flat numbers are unique case-insensitively (flats per wing); wing
codes per society; floor numbers per wing.

### Objects
- Wing: `{ id, society_id, name, code }`. `code` is uppercased, `A-Z 0-9 -`, 1 to 10.
- Floor: `{ id, society_id, wing_id, number, name, flat_count }`. `number` -10 to 300 (0 = ground,
  negative = basement). `name` optional label up to 40 ("Ground"). `flat_count` 0 to 500 is a planning
  number only; it is not enforced against real flats.
- Flat:
```json
{ "id", "wing_id", "floor_id", "number", "flat_type", "area_sqft", "bedrooms", "parking_slot",
  "status", "effective_status" }
```
`flat_type` `FLAT_TYPE` or null; `area_sqft` 1 to 1000000; `bedrooms` 0 to 20; `parking_slot` text up to
40 (a label only, there is no parking module); `status` `FLAT_STATUS`, default `vacant`.
`effective_status` is what dashboards count: an active resident makes a `vacant` flat `occupied`;
`under_construction` and `maintenance` always win.

Flats from the older wizard (`bootstrap_society_structure`, `secretary_add_wing`) have `floor_id: null`
and appear under `unassigned_flats`.

Direct reads: `floors` is readable with RLS by members of the society (`select * from floors`), as are
the new `flats` and `wings` columns. No client can write either table directly.

### `setup_get_state`
`setupGetState(sb, societyId)` returns
```json
{ "society": { "id", "name", "setup_completed_at", "code" },
  "counts": { "wings", "floors", "flats" },
  "can_complete": true,
  "steps": [{ "key", "required", "status": "pending|draft|completed|skipped", "draft", "updated_at" }],
  "wings": [{ "id", "name", "code",
              "floors": [{ "id", "number", "name", "flat_count", "flats": [Flat] }],
              "unassigned_flats": [Flat] }] }
```
`steps` always lists, in order: `society_details`, `authorities`, `wings`*, `floors`*, `flats`*,
`amenities`, `staff`, `guards`, `residents_import` (* required).

### `setup_upsert_wing`
`setupUpsertWing(sb, { societyId, name, code?, wingId? })`. No `wingId` creates. Returns Wing.
Errors: `INVALID_WING_NAME` (1 to 40), `INVALID_WING_CODE`, `WING_NAME_EXISTS`, `WING_CODE_EXISTS`,
`WING_NOT_FOUND`.

### `setup_delete_wing`
`setupDeleteWing(sb, wingId)` deletes the wing with its floors and flats. Returns `{ deleted }`.
Errors: `WING_NOT_FOUND`, `WING_IN_USE` (a flat in it is referenced by a member, complaint, etc.).

### `setup_upsert_floor`
`setupUpsertFloor(sb, { societyId, wingId, number, name?, flatCount?, floorId? })`. Returns Floor.
Errors: `WING_NOT_FOUND`, `INVALID_FLOOR_NUMBER`, `INVALID_FLOOR_NAME`, `INVALID_FLAT_COUNT`,
`FLOOR_EXISTS`, `FLOOR_NOT_FOUND`, `FLOOR_HAS_FLATS` (moving a floor that has flats to another wing).

### `setup_delete_floor`
`setupDeleteFloor(sb, floorId)`. Errors: `FLOOR_NOT_FOUND`, `FLOOR_HAS_FLATS`.

### `setup_upsert_flat`
`setupUpsertFlat(sb, { societyId, wingId, floorId?, number, flatType?, areaSqft?, bedrooms?, parkingSlot?, status?, flatId? })`.
Returns Flat. Errors: `WING_NOT_FOUND`, `FLOOR_NOT_FOUND` (floor not in that wing),
`INVALID_FLAT_NUMBER` (1 to 20), `INVALID_FLAT_TYPE`, `INVALID_FLAT_STATUS`, `INVALID_PARKING_SLOT`,
`INVALID_FLAT_DETAILS` (area/bedrooms not numbers), `INVALID_AREA`, `INVALID_BEDROOMS`, `FLAT_EXISTS`,
`FLAT_NOT_FOUND`.

### `setup_bulk_create_flats`
`setupBulkCreateFlats(sb, { societyId, floorId, flats: [{ number, flat_type?, area_sqft?, bedrooms?, parking_slot?, status? }] })`.
1 to 500 flats, **all or nothing**. Returns `{ created, flats: [Flat] }`. Errors: as upsert, plus
`INVALID_FLATS`, `TOO_MANY_FLATS`; `FLAT_EXISTS: <number>` names the first duplicate (in the list or
already in the wing).

### `setup_delete_flat`
`setupDeleteFlat(sb, flatId)`. Errors: `FLAT_NOT_FOUND`, `FLAT_IN_USE`.

### `setup_save_draft`
`setupSaveDraft(sb, { societyId, step, draft })`. Autosave any JSON up to 256 KB for a step. Saving a
draft on a completed or skipped step reopens it. Returns `{ step, status: "draft" }`.
Errors: `INVALID_STEP`, `INVALID_DRAFT`.

### `setup_complete_step`
`setupCompleteStep(sb, { societyId, step })`. Returns `{ step, status: "completed" }`. Errors:
`INVALID_STEP`, `STEP_INCOMPLETE` (wings/floors/flats with no real rows).

### `setup_skip_step`
`setupSkipStep(sb, { societyId, step })`. Optional steps only. Returns `{ step, status: "skipped" }`.
Errors: `INVALID_STEP`, `STEP_NOT_SKIPPABLE`.

### `setup_complete`
`setupComplete(sb, societyId)`. Needs at least one real wing, floor and flat; step statuses do not count
on their own. Idempotent. Marks wings/floors/flats completed. Returns
`{ society_id, setup_completed_at, counts: { wings, floors, flats }, setup_state }` (`setup_state` for
the caller). Errors: `SETUP_NEEDS_WING`, `SETUP_NEEDS_FLOOR`, `SETUP_NEEDS_FLAT`.

---

## 7. Excel import (manager only)

The browser parses the sheet with `exceljs` and sends rows. The server re-checks everything. Nothing is
created by validation; confirmation imports valid and warning rows only, after checking each one again.

Row (send strings; numbers are accepted):
```json
{ "row_number": 2, "society_code": "ABCD-EF23", "wing": "A", "floor": "1", "flat": "101",
  "full_name": "Riya Sharma", "resident_type": "Owner", "mobile": "9876543210", "email": "" }
```
`row_number` is the sheet row (defaults to position + 1, as row 1 is the header). `wing` matches a wing
name or code; `floor` matches floor number or floor name; `resident_type` accepts `owner`, `tenant`,
`family`, `family member`, `family_member` in any case.

Row codes (`errors` block import; `warnings` do not). Each is `{ code, field }`:

| Errors | Warnings |
|---|---|
| `SOCIETY_CODE_REQUIRED`, `SOCIETY_CODE_MISMATCH` | `FLAT_HAS_NO_FLOOR` (older flat with no floor; floor not checked) |
| `NAME_REQUIRED`, `INVALID_NAME` | `INVALID_EMAIL_IGNORED` (email dropped) |
| `RESIDENT_TYPE_REQUIRED`, `INVALID_RESIDENT_TYPE` | `PRE_REGISTERED_FAMILY` (phone already pre-entered as family) |
| `WING_REQUIRED`, `WING_NOT_FOUND` | `IS_AUTHORITY` (phone is on the authority list) |
| `FLAT_REQUIRED`, `FLAT_NOT_FOUND` | `FLAT_NOT_READY` (under construction / maintenance) |
| `FLOOR_REQUIRED`, `FLOOR_NOT_FOUND`, `FLAT_FLOOR_MISMATCH` | `FLAT_HAS_OWNER` (owner row on a flat that has an owner) |
| `MOBILE_REQUIRED`, `INVALID_MOBILE` | |
| `DUPLICATE_MOBILE_IN_FILE` (every row sharing the mobile) | |
| `DUPLICATE_IN_DB` (record exists on this flat), `MOBILE_ON_OTHER_FLAT` | |
| `ALREADY_MEMBER` (already a resident on a flat here) | |
| `INVALID_ROW` (not an object or over 4 KB) | |

Batch summary: `{ batch_id, society_id, file_name, status: "validated|confirmed|cancelled", total_rows,
valid_rows, warning_rows, error_rows, imported_rows, created_at, confirmed_at }`.
Row: `{ row_number, status: "valid|warning|error|imported", errors, warnings, normalized, raw, record_id }`
where `normalized` is `{ full_name, resident_type, mobile, email, wing, floor, flat }`.

### `import_validate_rows`
`importValidateRows(sb, { societyId, fileName?, rows })`. 1 to 2000 rows, up to 2 MB. Returns batch
summary plus `rows: [Row]` (all rows). Errors: `NOT_SOCIETY_MANAGER`, `IMPORT_EMPTY`,
`IMPORT_TOO_LARGE`, `IMPORT_RATE_LIMITED` (30 per hour per user).

### `import_confirm_batch`
`importConfirmBatch(sb, batchId)`. One transaction. Creates `resident_records` with status `pending`
(source `import`) for valid and warning rows. A row that became invalid since validation (for example,
the mobile was added meanwhile) is marked error and listed. Returns batch summary plus
`{ imported, newly_invalid: [{ row_number, errors }] }`. Errors: `BATCH_NOT_FOUND` (also for another
society's batch), `BATCH_ALREADY_CONFIRMED`, `BATCH_CANCELLED`, `IMPORT_NOTHING_VALID` (nothing was
created; the batch stays open).

### `import_cancel_batch`
`importCancelBatch(sb, batchId)`. Deletes the batch's rows (they hold names and mobiles) and marks it
cancelled. Returns `{ batch_id, status: "cancelled" }`. Errors: `BATCH_NOT_FOUND`, `BATCH_ALREADY_CONFIRMED`.

### `import_list_batches`
`importListBatches(sb, { societyId, limit?, offset? })` returns `{ items: [batch summary], total, limit, offset }`.

### `import_get_batch`
`importGetBatch(sb, { batchId, status?, limit? (default 100), offset? })` returns batch summary plus
`{ rows: [Row], rows_total, limit, offset }`, filtered by row `status`. Use it to download an error
report. Errors: `BATCH_NOT_FOUND`, `INVALID_STATUS`.

A downloadable template is a frontend concern: columns as in the row above.

---

## 8. Resident verification

A resident record is the society's claim about a person. It grants nothing until that person signs in
with OTP on the same mobile and confirms it. Statuses (`RESIDENT_RECORD_STATUS`):

```
pending -> verified           (resident confirms; membership created)
pending -> needs_correction   (resident proposes edits or reports incorrect)
needs_correction -> pending   (manager applies changes or reopens; resident confirms again)
any open -> rejected          (manager); rejected -> pending (manager reopens)
```
A rejected record frees the phone for re-import.

Resident view of a record:
```json
{ "id", "society_id", "flat_id", "flat_label": "A-101", "wing", "floor", "flat", "full_name", "email",
  "resident_type", "status", "source": "import|manual", "proposed_changes", "correction_note",
  "reported_incorrect", "rejection_reason", "verified_at", "created_at" }
```
Manager view adds `phone, batch_id, user_id, invite_prepared_at, reviewed_at`.

### `my_resident_records` (signed in)
`myResidentRecords(sb)` returns `[record + { society_name, service_status }]` for non-rejected records on
the caller's **verified** phone. Empty for anyone else, including unconfirmed phones.

### `resident_confirm_record` (the record's phone)
`residentConfirmRecord(sb, recordId)`. Creates (or reuses) the caller's single membership on that flat
with the record's resident type, and the matching detail row: owner row for owners, active tenant row
(chain answered by the society) for tenants, claimed family row for family. Idempotent. Returns
`{ record_id, status: "verified", society_id, flat_id, membership_id, refresh_required }`.
Errors: `RECORD_NOT_FOUND` (also someone else's), `RECORD_UNDER_REVIEW`, `RECORD_REJECTED`, `NO_PHONE`,
`ALREADY_MEMBER_OTHER_FLAT`, `MEMBERSHIP_REMOVED`, `SOCIETY_BLOCKED`, `FLAT_NOT_IN_SOCIETY`.

### `resident_submit_correction` (the record's phone)
`residentSubmitCorrection(sb, { recordId, changes, note? })`. `changes` may contain only `full_name`,
`email`, `resident_type`, `flat_label` (free text, for the manager to read; the manager picks the flat).
Nothing changes until a manager applies it. Returns the resident view. Errors: `RECORD_NOT_FOUND`,
`RECORD_NOT_EDITABLE`, `INVALID_CHANGES`, `INVALID_NAME`, `INVALID_EMAIL`, `INVALID_RESIDENT_TYPE`,
`INVALID_NOTE`.

### `resident_report_incorrect` (the record's phone)
`residentReportIncorrect(sb, { recordId, reason })`, reason 3 to 500. Sets `needs_correction`,
`reported_incorrect: true`. Errors: `RECORD_NOT_FOUND`, `RECORD_NOT_EDITABLE`, `INVALID_REASON`.

### `manager_list_resident_records` (manager)
`managerListResidentRecords(sb, { societyId, status?, residentType?, search?, flatId?, batchId?, limit?, offset? })`.
`search` matches name, or phone when phone-shaped. Returns
`{ items: [manager view], total, limit, offset, counts: { all, pending, verified, rejected, needs_correction } }`
(`counts` ignore filters). Errors: `INVALID_STATUS`, `INVALID_RESIDENT_TYPE`.

### `manager_review_resident_record` (manager)
`managerReviewResidentRecord(sb, { recordId, action, changes?, flatId?, reason? })`

- `apply_changes`: applies `changes` if given, else the resident's proposal; `flatId` moves the record.
  Back to `pending`.
- `reject`: reason 3 to 500.
- `reopen`: back to `pending`, clearing proposal and flags.

Returns manager view. Errors: `RECORD_NOT_FOUND`, `RECORD_ALREADY_VERIFIED`, `INVALID_ACTION`,
`NO_CHANGES_TO_APPLY`, `INVALID_CHANGES`, `INVALID_NAME`, `INVALID_EMAIL`, `INVALID_RESIDENT_TYPE`,
`FLAT_NOT_IN_SOCIETY`, `INVALID_REASON`, `DUPLICATE_IN_DB` (reopening while another live record has the phone).

### `manager_add_resident_record` (manager)
`managerAddResidentRecord(sb, { societyId, flatId, fullName, phone, residentType, email? })`. Source
`manual`. Returns manager view. Errors: `FLAT_NOT_IN_SOCIETY`, `INVALID_NAME`, `INVALID_MOBILE`,
`INVALID_RESIDENT_TYPE`, `INVALID_EMAIL`, `ALREADY_MEMBER`, `DUPLICATE_IN_DB`.

### `manager_prepare_resident_invite` (manager)
`managerPrepareResidentInvite(sb, recordId)` records that the manager took an invitation and returns
`{ record_id, phone, full_name, flat_label, sent: false }`. **Nothing is sent.** Build a copyable
message from it ("Sign in at <site> with this number to confirm your details") and say plainly that it
was not sent automatically. Errors: `RECORD_NOT_FOUND`, `RECORD_REJECTED`.

---

## 9. Owners, tenants, proofs

### Owner object
`{ id, flat_id, user_id, full_name, is_primary, ownership_start_date, membership_number, verified, verified_at, phone }`.
`phone` is null except for managers. Several owners per flat; at most one primary; membership number
unique per society (case-insensitive). Owner rows are created automatically when someone joins as an
owner through the new flows.

### `owner_save_my_details` (owner of the flat)
`ownerSaveMyDetails(sb, { flatId, fullName, isPrimary?, startDate?, membershipNumber? })`. Creates or
updates the caller's own owner row. Self-declared (`verified: false`) until a manager verifies.
Errors: `NOT_FLAT_OWNER`, `INVALID_NAME`, `INVALID_START_DATE` (future), `INVALID_MEMBERSHIP_NUMBER`
(over 40), `MEMBERSHIP_NUMBER_TAKEN`, `PRIMARY_OWNER_EXISTS`, `OWNER_ALREADY_ON_FLAT`.

### `manager_save_flat_owner` (manager)
`managerSaveFlatOwner(sb, { flatId, fullName, phone?, isPrimary?, startDate?, membershipNumber?, ownerId? })`
records an owner who may not use the app (co-owner, NRI). Same errors plus `NOT_SOCIETY_MANAGER`,
`INVALID_PHONE`, `OWNER_NOT_FOUND`.

### `list_flat_owners` (active member of the flat, or manager)
`listFlatOwners(sb, flatId)` returns `[Owner]`, primary first. Errors: `NOT_ALLOWED`.

### `manager_verify_flat_owner` / `manager_remove_flat_owner` (manager)
`managerVerifyFlatOwner(sb, { ownerId, verified? = true })` returns Owner;
`managerRemoveFlatOwner(sb, ownerId)` returns `{ deleted }` and removes its proof records (delete the
files with `removeProof` first if you want them gone from storage). Errors: `OWNER_NOT_FOUND`.

### Tenant chain

```
tenant_register      -> registered        (no membership exists yet)
tenant_owner_decide  -> owner_approved | rejected      (owner of the flat)
tenant_admin_decide  -> active, or admin_approved when agreement_start is in the future | rejected
tenant_activate      -> active            (manager any time; tenant once the start date arrives)
```
A manager may decide a `registered` request only when the flat has no active owner; this is recorded
as `owner_step_skipped: true`. Otherwise `OWNER_APPROVAL_REQUIRED`. After rejection the person may
register again.

Tenant object:
```json
{ "id", "society_id", "flat_id", "flat_label", "full_name", "status", "agreement_start", "agreement_end",
  "police_status", "police_reference", "owner_step_skipped", "owner_approved_at", "admin_approved_at",
  "activated_at", "rejected_at", "rejected_reason", "rejected_stage": "owner|admin|null", "created_at",
  "owner_name", "owner_phone", "phone" }
```
`owner_name`, `owner_phone` (what the tenant typed) and `phone` (tenant's) are null for the owner's view.

### `tenant_register` (signed in, not yet a resident of that society)
`tenantRegister(sb, { code, flatId, fullName, agreementStart?, agreementEnd?, ownerName?, ownerPhone?, policeStatus?, policeReference? })`.
Use `onboard_flats_for_code(code)` (existing) to show the flat picker. `policeStatus` may be only
`not_submitted` or `submitted`. Returns Tenant (full view). Returned errors: `INVALID_CODE`,
`CODE_PAUSED`, `SOCIETY_BLOCKED`, `FLAT_NOT_IN_SOCIETY`. Raised: `TOO_MANY_CODE_ATTEMPTS`,
`INVALID_NAME`, `INVALID_DATES`, `INVALID_OWNER_NAME`, `INVALID_OWNER_PHONE`, `INVALID_POLICE_STATUS`,
`INVALID_POLICE_REFERENCE`, `ALREADY_A_RESIDENT`, `MEMBERSHIP_REMOVED`, `TENANT_REGISTRATION_EXISTS`,
`TENANT_RATE_LIMITED` (5 per hour).

### `tenant_save_my_details` (the tenant)
`tenantSaveMyDetails(sb, { societyId, fullName, agreementStart?, agreementEnd?, ownerName?, ownerPhone?, policeStatus?, policeReference? })`.
Edits the open registration, or the active tenancy (creating the details row for tenants who joined
through older flows). Never overwrites a manager's `verified`/`rejected` police status. Errors:
`NOT_A_TENANT` and the field errors above.

### `my_tenant_registrations` (signed in)
`myTenantRegistrations(sb)` returns `[Tenant + { society_name }]`, newest first.

### `owner_list_tenant_requests` (signed in)
`ownerListTenantRequests(sb)` returns `[Tenant (owner view)]` in `registered` on flats the caller owns.

### `tenant_owner_decide` (owner of the flat)
`tenantOwnerDecide(sb, { tenantId, approve, reason? })`; reason 3 to 500 required to reject. Returns
Tenant (owner view). Errors: `TENANT_NOT_FOUND`, `INVALID_TENANT_STATE`, `INVALID_DECISION`, `INVALID_REASON`.

### `tenant_admin_decide` (manager; not on your own request)
`tenantAdminDecide(sb, { tenantId, approve, reason? })`. Returns Tenant. Errors: `TENANT_NOT_FOUND`,
`CANNOT_DECIDE_OWN_REQUEST`, `INVALID_TENANT_STATE`, `INVALID_DECISION`, `INVALID_REASON`,
`OWNER_APPROVAL_REQUIRED`, plus joining errors `ALREADY_MEMBER_OTHER_FLAT`, `MEMBERSHIP_REMOVED`,
`SOCIETY_BLOCKED`, `NO_PHONE`.

### `tenant_activate` (manager, or the tenant on/after the start date)
`tenantActivate(sb, tenantId)` from `admin_approved`. Returns Tenant + `refresh_required` (true for the
tenant). Errors: `TENANT_NOT_FOUND`, `INVALID_TENANT_STATE`, `TENANCY_NOT_STARTED`, joining errors.

### `manager_set_tenant_police_status` (manager)
`managerSetTenantPoliceStatus(sb, { tenantId, status, reference? })`, status in
`POLICE_VERIFICATION_STATUS`. Errors: `TENANT_NOT_FOUND`, `INVALID_POLICE_STATUS`, `INVALID_POLICE_REFERENCE`.

### `manager_list_tenants` (manager)
`managerListTenants(sb, { societyId, status?, limit?, offset? })` returns paged Tenant list.
Errors: `INVALID_STATUS`.

### Proofs

Private bucket `parisar-proofs` (`PROOFS_BUCKET`): 10 MB, JPEG/PNG/WebP/HEIC/HEIF/PDF only.
Object path must be exactly `{society_id}/{your_user_id}/{file}` where file is
`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. Build it with `buildProofPath`.

| Who | Upload | Read / sign URL / delete |
|---|---|---|
| The uploader | own folder, while an active member or holding an open tenant registration in that society | yes |
| Manager of that society | own folder | every proof in the society |
| Anyone else, including platform staff | no | no |

Flow: `uploadProofFile(sb, { societyId, userId, file })` returns `{ path }` or
`{ error: "PROOF_UPLOAD_FAILED", message }`; then `attachProof(sb, { subjectKind, subjectId, docType, storagePath: path, fileName? })`.
View with `createProofSignedUrl(sb, path, seconds?)` returning `{ url }` or `{ error: "PROOF_NOT_ACCESSIBLE" }`.

### `attach_proof` (subject itself, or manager)
`subjectKind`: `owner` (flat_owners id), `tenant` (flat_tenants id), `staff` (society_staff id, manager
only). `docType`: `PROOF_DOC_TYPE`. The file must already be uploaded at your own path in the subject's
society. Max 10 per subject. Returns `{ id, storage_path }`. Errors: `INVALID_SUBJECT`,
`SUBJECT_NOT_FOUND`, `INVALID_PROOF_PATH`, `PROOF_NOT_UPLOADED`, `TOO_MANY_PROOFS`,
`PROOF_ALREADY_ATTACHED`, `INVALID_DOC_TYPE`.

### `list_proofs` (subject itself, or manager)
`listProofs(sb, { subjectKind, subjectId })` returns
`[{ id, doc_type, storage_path, file_name, mime_type, byte_size, uploaded_by_me, created_at }]`.

### `remove_proof` (uploader or manager)
`removeProof(sb, documentId)` removes the record and then the file. Returns `{ deleted, storage_path }`,
`{ error: "PROOF_NOT_FOUND" }`, or `{ error: "PROOF_FILE_NOT_REMOVED" }` (record gone, file stuck).

---

## 10. Family invites and same-flat household

Invitations are **not sent**. Show the link and say so.

### `family_invite_create` (active owner or tenant on a flat in the society)
`familyInviteCreate(sb, { societyId, fullName, relationship, phone? })`. `relationship`:
`FAMILY_RELATIONSHIP`. With `phone`, only that verified number can accept. Expires in 14 days.
Returns `{ invite_id, token, expires_at, sent: false }`. **`token` is shown once**; only its hash is
stored. The accept page and its URL belong to web; pass the token to `family_invite_preview` / `family_invite_accept`. Errors: `NOT_ALLOWED`, `INVALID_NAME`,
`INVALID_RELATIONSHIP`, `INVALID_PHONE`, `CANNOT_INVITE_SELF`, `INVITE_ALREADY_PENDING`,
`INVITE_RATE_LIMITED` (20 per day).

### `family_invite_list` (active member with a flat)
`familyInviteList(sb, societyId)` returns
`[{ id, full_name, relationship, phone, status: "pending|accepted|revoked|expired", expires_at, accepted_at, created_at, mine }]`
for the caller's flat. Never returns tokens.

### `family_invite_revoke` (inviter or manager)
`familyInviteRevoke(sb, inviteId)` returns `{ invite_id, status: "revoked" }`. Errors:
`INVITE_NOT_FOUND`, `INVITE_USED`.

### `family_invite_preview` (signed in)
`familyInvitePreview(sb, token)` returns `{ society_name, flat_label, invited_by (masked), full_name, relationship, expires_at }`.
Returned errors: `INVITE_NOT_FOUND`, `INVITE_REVOKED`, `INVITE_USED`, `INVITE_EXPIRED`,
`INVITE_PHONE_MISMATCH`. Raised: `INVITE_RATE_LIMITED` (20 token checks per 10 min, shared with accept).

### `family_invite_accept` (signed in; the invited phone if one was set)
`familyInviteAccept(sb, token)` links the caller to the flat as `family_member` (one membership, no
duplicate family row). Returns `{ society_id, flat_id, membership_id, refresh_required: true }`.
Returned errors: those of preview plus `INVITER_INACTIVE`, `CANNOT_INVITE_SELF`. Raised:
`ALREADY_MEMBER_OTHER_FLAT`, `MEMBERSHIP_REMOVED`, `SOCIETY_BLOCKED`, `NO_PHONE`, `INVITE_RATE_LIMITED`.

### Same-flat household

Knowing a flat number never grants access. The lookup shows at most masked names and a count.

### `household_lookup` (signed in)
`householdLookup(sb, { code, wing, floor?, flat })`. `wing` is a name or code; `floor` (number or name)
is checked only when the flat has a floor. Returns
```json
{ "society_id", "society_name", "flat_id", "flat_label": "A-101", "member_count": 2,
  "masked_members": ["R**** S****", "N****"], "already_on_flat": false }
```
No phones, no unmasked names. Returned errors: `INVALID_CODE`, `CODE_PAUSED`, `SOCIETY_BLOCKED`,
`FLAT_NOT_FOUND`. Raised: `TOO_MANY_CODE_ATTEMPTS`, `HOUSEHOLD_RATE_LIMITED` (30 per hour).

### `household_request_access` (signed in)
`householdRequestAccess(sb, { code, flatId, fullName, relationship, residentType? = "family_member", message? })`.
`residentType`: `family_member` or `owner` (co-owner). Tenants use `tenant_register`. Grants nothing.
Returns `{ request_id, status: "pending", society_id, flat_id }`. Returned errors: `INVALID_CODE`,
`CODE_PAUSED`, `SOCIETY_BLOCKED`, `FLAT_NOT_IN_SOCIETY`. Raised: `TOO_MANY_CODE_ATTEMPTS`,
`INVALID_NAME`, `INVALID_RELATIONSHIP`, `INVALID_RESIDENT_TYPE`, `USE_TENANT_REGISTRATION`,
`INVALID_MESSAGE`, `ALREADY_ON_FLAT`, `ALREADY_MEMBER_OTHER_FLAT`, `MEMBERSHIP_REMOVED`,
`HOUSEHOLD_REQUEST_EXISTS` (one pending per society), `HOUSEHOLD_RATE_LIMITED` (5 per hour).

### `household_my_requests` (signed in)
`householdMyRequests(sb)` returns
`[{ id, society_id, society_name, flat_id, flat_label, relationship, resident_type, status, decision_reason, decided_at, created_at }]`.

### `household_cancel_request` (the requester)
`householdCancelRequest(sb, requestId)` returns `{ request_id, status: "cancelled" }`. Errors: `REQUEST_NOT_FOUND`.

### Who decides
An owner of the flat decides any request on it; a tenant of the flat decides `family_member` requests;
a family member decides nothing; a manager decides anything in the society. Nobody decides their own.

### `household_pending_for_me` (signed in)
`householdPendingForMe(sb)` returns
`[{ id, society_id, flat_id, flat_label, full_name, relationship, resident_type, message, phone_last4, created_at }]`
for requests the caller may decide. `full_name` is what the requester typed; `phone_last4` helps
recognise them. Never the full phone.

### `household_decide_request` (see Who decides)
`householdDecideRequest(sb, { requestId, approve, reason? })`; reason 3 to 500 required to reject. On
approval the requester gets one membership on the flat plus an owner or family row; a matching pending
resident record becomes verified. Returns `{ request_id, status: "approved|rejected", membership_id }`.
Errors: `REQUEST_NOT_FOUND`, `CANNOT_DECIDE_OWN_REQUEST`, `REQUEST_CLOSED`, `INVALID_DECISION`,
`INVALID_REASON`, `ALREADY_MEMBER_OTHER_FLAT`, `MEMBERSHIP_REMOVED`, `SOCIETY_BLOCKED`, `NO_PHONE`.

The existing `pending_review` review queue (`approve_pending_membership`, `reject_pending_membership`)
still works for people who picked a taken flat through `onboard_resident`.

---

## 11. Staff details (manager only)

`society_staff` stays the shared directory any member can read (`name, phone, category, added_by_name,
added_by_flat`) and any member can add to with `add_society_staff` (existing). Private fields live in
`society_staff_details`, which no client can read directly.

Staff object:
```json
{ "id", "society_id", "name", "last_name", "phone", "category", "email", "joining_date", "employee_id",
  "vendor_name", "shift", "emergency_contact_name", "emergency_contact_phone", "id_proof_type",
  "created_at", "updated_at" }
```
`category`: `STAFF_ROLE`; `shift`: `STAFF_SHIFT`; `id_proof_type`: `ID_PROOF_TYPE` (the document itself
is an `attach_proof` with `subjectKind: "staff"`). `vendor_name` is text; there is no vendor module.

### `manager_save_staff`
`managerSaveStaff(sb, { societyId, name, category, phone?, lastName?, email?, joiningDate?, employeeId?, vendorName?, shift?, emergencyContactName?, emergencyContactPhone?, idProofType?, staffId? })`.
No `staffId` creates. Every optional field is replaced on update (send current values). Returns Staff.
Errors: `NOT_SOCIETY_MANAGER`, `INVALID_NAME`, `INVALID_CATEGORY`, `INVALID_PHONE`, `INVALID_EMAIL`,
`INVALID_JOINING_DATE` (over a year ahead), `INVALID_EMPLOYEE_ID`, `EMPLOYEE_ID_TAKEN`, `INVALID_VENDOR`,
`INVALID_SHIFT`, `INVALID_EMERGENCY_CONTACT`, `INVALID_ID_PROOF_TYPE`, `STAFF_NOT_FOUND`.

### `manager_list_staff`
`managerListStaff(sb, { societyId, category?, search?, limit?, offset? })`; `search` matches name, last
name, employee id, vendor. Returns paged Staff.

### `manager_get_staff`
`managerGetStaff(sb, staffId)` returns Staff. Errors: `STAFF_NOT_FOUND`.

---

## 12. Dashboards

Real data only. "Today" is the Asia/Kolkata calendar day.

### `society_admin_dashboard` (manager or staff)
`societyAdminDashboard(sb, societyId)` returns
```json
{ "flats", "occupied", "vacant", "under_construction", "maintenance", "residents",
  "pending_requests": { "memberships", "household", "tenants" },
  "pending_verification", "open_complaints", "todays_visitors" }
```
- flat counts use `effective_status`, so they always add up to `flats`;
- `residents`: distinct users with an active membership on a flat;
- `pending_requests.memberships`: `pending_review` claims; `household`: pending household requests;
  `tenants`: tenant registrations in `registered` or `owner_approved`;
- `pending_verification`: resident records `pending` or `needs_correction`;
- `open_complaints`: complaints not `resolved`;
- `todays_visitors`: visitor entries created today.

### `resident_dashboard` (active member)
`residentDashboard(sb, societyId?)`; omitted = the caller's active society. Returns
```json
{ "society_id", "society_name", "role", "society_title", "resident_type", "flat_id", "flat_label",
  "household_members", "my_open_complaints", "pending_visitors", "upcoming_bookings", "open_polls",
  "notices_last_7_days", "pending_household_requests", "pending_tenant_approvals" }
```
`pending_visitors` = pending gate entries for my flat from the last 30 min (they expire);
`pending_household_requests` / `pending_tenant_approvals` = ones the caller may decide.
Errors: `NOT_A_MEMBER`.

### `security_dashboard` (active guard)
`securityDashboard(sb, societyId?)` returns
`{ society_id, society_name, todays_visitors, pending, approved, denied, active_sos }` where `active_sos`
= unresolved SOS alerts addressed to guards. Errors: `NOT_A_GUARD`.

### Metrics deliberately absent

No module exists, so these are not returned and must not be shown: maintenance dues / collections,
accounting balances, parking occupancy, vendor counts and payments, event RSVPs, staff attendance.
Record them in `REPORT.md` as gaps.

---

## 13. Compatibility notes and handoffs

- `society_enrollment_requests`: the public form still inserts directly (column grant kept). Those
  rows get a request code and status `new`. **Web**: switch `EnrollForm.jsx` to
  `submitConnectRequest`, then the direct anon insert grant should be revoked in a later migration.
- **Web admin console** (`app/c/[routeId]/page.jsx`) reads leads with `.in("status", ["new","contacted"])`.
  Requests from the new RPC start in `call_scheduled`, so that filter must become the open set or use
  `adminListConnectRequests({ status: "open" })`.
- Staff can no longer UPDATE `society_enrollment_requests` directly (no client did); use the RPCs.
- `admin_create_society(..., p_request_id)` still marks a request `approved`; reads report it as `registered`.
- Flats created by older RPCs have no floor and status `vacant` (occupied if someone lives there).
- Removing a member (`remove_member`) now also deletes what these tables hold about them in that
  society (owner/tenant rows, proof records, household requests, resident records, import rows). Proof
  **files** stay in storage: Postgres cannot delete storage objects. A manager can remove them with
  `removeProof` before removing the member.

---

## 14. What was verified against the running database

Applied with `supabase migration up --local --include-all` (058 to 074, no reset). Existing data kept:
3 societies, 1 enrollment request and all prior users are still there after the test runs.

`tests/isolation/onboarding-*.test.js`, 9 files, 108 tests, all passing against the local stack. They
create users on random `96xxxxxxxx` numbers (never the fixed test numbers that hold your data) and
delete everything they created. Covered: public submit and lookup (including anon cannot read the
table), per-phone and per-address limits, staff-only refusals, the lifecycle, registration seeding
authorities from a request, the honest catalogue, authority setup states, multi-society claim, title
mapping and revocation, setup refusals for other societies and plain members, duplicate prevention,
completion rules, every import error code, atomic confirm with re-check, cross-society batch access,
2000-row validation, verification visibility by verified phone only, proposals not applied until a
manager acts, one membership per person, removed members kept out, owner and tenant rules, every chain
step and every refusal, invite token hashing and phone binding, household masking, approval rules, the
proofs bucket policies (private, own folder, managers only, no platform staff), staff details privacy,
dashboards against real rows, and three older flows (`onboard_resident` tenant authority,
`remove_member` cleanup, review queue approval).

Not run here: the older isolation suites that sign in the fixed test numbers `9000000001`-`13`, because
their helper deletes and recreates those accounts, which hold your manual test data. Four older suites
that use unused numbers (`society-authorities`, `society-insights`, `society-service-status`,
`otp-phone-flow`) were run and pass (38 tests).
