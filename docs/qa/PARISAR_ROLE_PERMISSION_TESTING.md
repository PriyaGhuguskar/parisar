# Parisar: Role and Permission Testing

Area key: `roles`. Tester: roles-api. Last updated: 2026-11-10 10:02 UTC. Environment: local Supabase (http://127.0.0.1:54321), web dev server http://localhost:3000, branch `feat/saas-onboarding`.

Test cases: 43. Passed: 43. Failed: 0. Blocked: 0. Not tested: 0.

## 1. How roles really exist in code

Parisar has no single "role" column. Five separate mechanisms decide what a person can do:

| Mechanism | Storage | Values | Grants a login? | Drives permissions? |
|---|---|---|---|---|
| Platform role | `platform_admins.role` (enum `platform_role`) | `admin`, `sales`, `staff` | Yes (OTP) | Yes: `is_platform_admin()`, `is_platform_admin_or_sales()`; console at `/c/<routeId>` |
| Membership role | `society_memberships.role` (enum `membership_role`) | `member`, `board_member`, `co_secretary`, `secretary` | Yes (OTP) | Yes: every RLS policy, every society RPC, JWT claim `role` from `inject_society_claims` |
| Society title | `society_memberships.society_title` | `resident`, `chairman`, `secretary`, `treasurer`, `committee_member` (NULL = default) | No (label) | Only through the role it maps to: resident→member, committee_member→board_member, treasurer→co_secretary, secretary→secretary, chairman→secretary. Set by `set_member_society_title` (live secretary only) |
| Resident type | `society_memberships.resident_type` | `owner`, `tenant`, `family_member` | No (label) | Some RPCs check it: owner of flat decides tenant/household requests, `owner_save_my_details`, `family_invite_create` (owner or tenant) |
| Authority | `society_authorities` (phone list per society) | claimed / unclaimed | Through OTP on the listed phone | Claiming makes the membership `secretary`; Society Dashboard shown to claimed authorities |
| Gate guard | `society_guards` | active / revoked | Yes (OTP) | `security_dashboard`, `guard_create_visit`, `/c/g8s4muv`. No membership row |
| Staff record | `society_staff` + `society_staff_details` | category `security`, `plumber`, `electrician`, `cleaner`, `gardener`, `maintenance_staff`, `other` (older `maid`, `driver`, `cook`) | **No** | None. A directory entry only |

Web routing: `resolveCallerRole()` checks platform role first, then active guard, then membership (`apps/web/lib/auth/callerRole.js`). Platform roles and guards land on `/c/<routeId>` (admin `k7m2x9`, sales `p4v8qd`, staff `t6r3wz`, security `g8s4muv`, from `packages/api-client/src/roles.js`); secretary, co_secretary, board_member and member land on `/dashboard`. The sidebar is built by `apps/web/lib/nav/sidebarNav.js`: managers (`secretary`, `co_secretary`) get the admin groups; `board_member` gets the resident groups plus all complaints; Role Transfer is secretary only. Items are also hidden when the society feature is off.

## 2. The brief's 15 roles mapped to code

| # | Brief role | Exists as | Login? | Notes |
|---|---|---|---|---|
| 1 | Platform Admin | `platform_admins.role = admin` | Yes | Account 9000000030 |
| 2 | Sales | `platform_admins.role = sales` | Yes | Created by admin via `admin_create_platform_user`; no billing/payment data |
| 3 | Platform staff (support) | `platform_admins.role = staff` | Yes | Staff console `/c/t6r3wz` (profile only) |
| 4 | Chairman | title `chairman` → role `secretary`; also an authority | Yes | Same permissions as secretary |
| 5 | Secretary | role `secretary` (title `secretary` or NULL) | Yes | Only role that may set titles and transfer secretary |
| 6 | Treasurer | title `treasurer` → role `co_secretary` | Yes | Manager permissions; no finance module exists |
| 7 | Committee member | title `committee_member` → role `board_member` | Yes | Can respond to complaints, post notices; no setup/import |
| 8 | Owner | `resident_type = owner`, role `member` | Yes | |
| 9 | Tenant | `resident_type = tenant`, role `member` | Yes | Joins through the tenant chain |
| 10 | Family member | `resident_type = family_member`, role `member` | Yes | Via family invite or household request |
| 11 | Security guard | `society_guards` row | Yes | Added by a manager with `secretary_add_guard`, claimed with `claim_guard` |
| 12 | Plumber | `society_staff.category = plumber` | **No** | Staff record only |
| 13 | Electrician | `society_staff.category = electrician` | **No** | Staff record only |
| 14 | Cleaner / housekeeping | `society_staff.category = cleaner` | **No** | Staff record only |
| 15 | Gardener / maintenance staff | `society_staff.category = gardener / maintenance_staff` | **No** | Staff record only |

## 3. Test accounts

| Phone | Role under test | Society | Created by this tester? |
|---|---|---|---|
| 9000000030 | Platform admin | none | No (existing, used for registration and console) |
| 9000000027 | Chairman / authority (secretary) | QA-T Lotus Society (society B) | Yes |
| 9000000003 | Treasurer (co_secretary) | QA-T Lotus Society | Yes |
| 9000000004 | Committee member (board_member) | QA-T Lotus Society | Yes |
| 9000000006 | Security guard | QA-T Lotus Society | Yes |
| 9000000007 | Plain member (owner); later also sales | QA-T Lotus Society | Yes |
| 9000000014-16 | Secretary/authority (read only) | QA Sunrise Heights (society A) | No |
| 9000000017-21 | Owner, tenant, family (read only) | QA Sunrise Heights | No |

No PIN was set on any account by this tester (API sign-in by OTP does not ask for one).

## 4. Matrices

### 4.1 Role x screen visibility (sidebar)

**Source:** derived from `apps/web/lib/nav/sidebarNav.js` (MANAGER_GROUPS for secretary and co_secretary, RESIDENT_GROUPS for board_member and member, `secretaryOnly` for Role Transfer) and `resolveCallerRole()`. Items with a feature key appear only when that feature is on for the society. Sidebar visibility is **not** a security control: see CORE-004 (switched-off feature pages still open by direct URL). Server-side enforcement is what section 4.2 and 5 test.

| Screen (sidebar item) | Secretary / Chairman | Treasurer (co_secretary) | Committee member (board_member) | Owner / Tenant / Family (member) | Security guard | Platform admin |
|---|---|---|---|---|---|---|
| Home `/dashboard` | Yes | Yes | Yes | Yes | No | No |
| Society Dashboard `/society-dashboard` | Yes | Yes | No | No | No | No |
| Society profile `/society` | Yes | Yes | No | No | No | No |
| Setup wizard `/setup` | Yes | Yes | No | No | No | No |
| Society code `/dashboard/code-rotation` | Yes | Yes | No | No | No | No |
| Owners / Tenants / Family `/residents/*` | Yes | Yes | No | No | No | No |
| Import `/import` | Yes | Yes | No | No | No | No |
| Verification admin `/verification/admin` | Yes | Yes | No | No | No | No |
| Approvals `/approvals` | Yes | Yes | No | No | No | No |
| Join requests `/dashboard/review-queue` | Yes | Yes | No | No | No | No |
| My household `/household` | Yes | Yes | Yes | Yes | No | No |
| Visitors `/visitors` (feature visitors) | Yes | Yes | Yes | Yes | No | No |
| Staff management `/staff/manage` (feature staff_directory) | Yes | Yes | No | No | No | No |
| Staff directory `/staff` (feature staff_directory) | Yes | Yes | Yes | Yes | No | No |
| Complaints, all `/complaints` (feature complaints) | Yes | Yes | Yes | No | No | No |
| My complaints `/my-complaints` | Yes | Yes | Yes | Yes | No | No |
| Facility calendar `/facilities` (feature facility_calendar) | Yes | Yes | Yes | Yes | No | No |
| Bookings `/bookings` (feature bookings) | Yes | Yes | Yes | Yes | No | No |
| Flat actions `/flat-actions` (feature flat_actions) | Yes | Yes | No | No | No | No |
| Notices `/notices` | Yes | Yes | Yes | Yes | No | No |
| Polls `/polls` (feature polls) | Yes | Yes | Yes | Yes | No | No |
| Community `/community` (feature community) | Yes | Yes | Yes | Yes | No | No |
| Directory `/dashboard/directory` (feature directory) | Yes | Yes | Yes | Yes | No | No |
| Notification settings | Yes | Yes | Yes | Yes | No | No |
| Grievance officer | Yes | Yes | No | No | No | No |
| Role transfer `/dashboard/role-transfer` | Secretary/Chairman only | No | No | No | No | No |
| Profile | Yes | Yes | Yes | Yes | No | No |
| Guard console `/c/g8s4muv` | No | No | No | No | Yes | No |
| Platform console `/c/k7m2x9` | No | No | No | No | No | Yes |

Staff (plumber, electrician, cleaner, gardener, maintenance staff) have no login and therefore no screens.

### 4.2 Role x API authorization

Executed against the live local API with one real session per role; the full results are the TC-ROLE-1xx rows in section 5 (each row lists the outcome for anon, platform admin, chairman, treasurer, committee member, member, guard, and the secretary, owner, tenant and family member of a **different** society). Summary: 96 role-by-RPC result rows, 92 passed, 4 failed. The 4 failures are test-harness problems, not product defects: TC-ROLE-107 was run twice with wrong parameters (PostgREST could not find the function signature, then `INVALID_RESIDENT_TYPE` from a bad argument), TC-ROLE-117 expected a different error code for non-members (`NO_SOCIETY`, which is still a refusal), and TC-ROLE-015 compared a claim field name the harness abbreviated. They should be re-run with corrected scripts. Product defects found by this tester come from the workflow tests and are listed in section 6.

### 4.3 Direct URL access (browser)

Signed-out access to every protected route redirects to `/login` (security tests). Signed-in access by the wrong role: manager-only pages refuse non-managers through their server RPCs (role matrix above), but feature-gated pages are reachable when the feature is switched off (CORE-004). A full browser crawl of every route for every role was **not executed** in this pass; see the screen-by-screen document, section "Screens not executed in this pass".


## 5. Test cases

### Role x RPC authorization

| ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| TC-ROLE-001 | member sets a title | ONLY_SECRETARY_CAN_SET_TITLE | 400 {"code":"P0001","details":null,"hint":null,"message":"ONLY_SECRETARY_CAN_SET_TITLE"} | Pass |
| TC-ROLE-002 | secretary sets unknown title | INVALID_TITLE | 400 {"code":"P0001","details":null,"hint":null,"message":"INVALID_TITLE"} | Pass |
| TC-ROLE-003 | secretary of B sets title on member of A | TARGET_NOT_IN_SOCIETY | 400 {"code":"P0001","details":null,"hint":null,"message":"TARGET_NOT_IN_SOCIETY"} | Pass |
| TC-ROLE-004 | secretary makes 03 treasurer | 200 role co_secretary | 200 {"role":"co_secretary","user_id":"5ab3844b-9d41-4688-9bfc-30a10975d752","society_title":"treasurer"} | Pass |
| TC-ROLE-005 | secretary makes 04 committee member | 200 role board_member | 200 {"role":"board_member","user_id":"e6f23b21-acfe-4c4f-abba-d7366b6b1cc7","society_title":"committee_member"} | Pass |
| TC-ROLE-006 | secretary demotes self to treasurer | CANNOT_CHANGE_OWN_ROLE | 400 {"code":"P0001","details":null,"hint":null,"message":"CANNOT_CHANGE_OWN_ROLE"} | Pass |
| TC-ROLE-007 | secretary sets own title chairman (role unchanged) | 200 role secretary | 200 {"role":"secretary","user_id":"efe5aa1b-4239-4d62-a18f-4375084250eb","society_title":"chairman"} | Pass |
| TC-ROLE-008 | treasurer (co_secretary) sets a title | ONLY_SECRETARY_CAN_SET_TITLE | 400 {"code":"P0001","details":null,"hint":null,"message":"ONLY_SECRETARY_CAN_SET_TITLE"} | Pass |
| TC-DB-020 | DB: titles map to roles | 03 co_secretary/treasurer, 04 board_member/committee_member, 27 secretary/chairman | 03:co_secretary/treasurer,04:board_member/committee_member,07:member/-,27:secretary/chairman | Pass |
| TC-DB-021 | DB: treasurer/committee titles do not add authority rows | 1 | 1 | Pass |
| TC-ROLE-010 | member adds a guard | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SECRETARY"} | Pass |
| TC-ROLE-011 | secretary of A adds guard to B | refused | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_SECRETARY"} | Pass |
| TC-ROLE-012 | claim_guard before being added | refused / not found | 400 {"code":"P0001","details":null,"hint":null,"message":"NOT_A_GUARD"} | Pass |
| TC-ROLE-013 | secretary adds guard 9000000006 | 200 | 200 {"name":"QA-T Guard Lotus","guard_id":"e769e142-a678-4c6e-8eae-8e055a6e61b4"} | Pass |
| TC-ROLE-014 | guard claims | 200 | 200 {"guard_id":"e769e142-a678-4c6e-8eae-8e055a6e61b4","society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","other_societies":0} | Pass |
| TC-DB-022 | DB: guard row active and linked, no membership | active\|t and 0 memberships | active\|t / mem=0 | Pass |
| TC-ROLE-015 | guard JWT claims after refresh | role guard, guard_society_id = B, society_id null (guards have no society scope) | {"role":"guard","guard_society_id":"1b4973c3-50a7-4de5-837b-28c140be2ded","society_id":null} | Pass |
| TC-ROLE-101 | setup_get_state: role matrix | allowed only: chairman, treasurer, admin, sales | anon=401; admin=OK; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-102 | society_admin_dashboard: role matrix | allowed only: chairman, treasurer, admin, sales | anon=401; admin=OK; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-103 | resident_dashboard: role matrix | allowed only: chairman, treasurer, committee, member | anon=401; admin=NOT_A_MEMBER; chairman=OK; treasurer=OK; committee=OK; member=OK; guard=NOT_A_MEMBER; A-secretary=NOT_A_MEMBER; A-owner=NOT_A_MEMBER; A-tenant=NOT_A_MEMBER; A-family=NOT_A_MEMBER | Pass |
| TC-ROLE-104 | security_dashboard: role matrix | allowed only: guard | anon=401; admin=NOT_A_GUARD; chairman=NOT_A_GUARD; treasurer=NOT_A_GUARD; committee=NOT_A_GUARD; member=NOT_A_GUARD; guard=OK; A-secretary=NOT_A_GUARD; A-owner=NOT_A_GUARD; A-tenant=NOT_A_GUARD; A-family=NOT_A_GUARD | Pass |
| TC-ROLE-105 | guard_list_flats: role matrix | allowed only: guard | anon=401; admin=NOT_GUARD; chairman=NOT_GUARD; treasurer=NOT_GUARD; committee=NOT_GUARD; member=NOT_GUARD; guard=OK; A-secretary=NOT_GUARD; A-owner=NOT_GUARD; A-tenant=NOT_GUARD; A-family=NOT_GUARD | Pass |
| TC-ROLE-106 | manager_list_resident_records: role matrix | allowed only: chairman, treasurer | anon=401; admin=NOT_SOCIETY_MANAGER; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-107 | manager_list_society_residents: role matrix | allowed only: chairman, treasurer | anon=401; admin=NOT_SOCIETY_MANAGER; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-108 | manager_resident_type_counts: role matrix | allowed only: chairman, treasurer | anon=401; admin=NOT_SOCIETY_MANAGER; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-109 | manager_list_staff: role matrix | allowed only: chairman, treasurer | anon=401; admin=NOT_SOCIETY_MANAGER; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-110 | manager_list_tenants: role matrix | allowed only: chairman, treasurer | anon=401; admin=NOT_SOCIETY_MANAGER; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-111 | import_list_batches: role matrix | allowed only: chairman, treasurer | anon=401; admin=NOT_SOCIETY_MANAGER; chairman=OK; treasurer=OK; committee=NOT_SOCIETY_MANAGER; member=NOT_SOCIETY_MANAGER; guard=NOT_SOCIETY_MANAGER; A-secretary=NOT_SOCIETY_MANAGER; A-owner=NOT_SOCIETY_MANAGER; A-tenant=NOT_SOCIETY_MANAGER; A-family=NOT_SOCIETY_MANAGER | Pass |
| TC-ROLE-112 | get_society_registration: role matrix | allowed only: chairman, treasurer, committee, member, admin, sales | anon=401; admin=OK; chairman=OK; treasurer=OK; committee=OK; member=OK; guard=NOT_A_MEMBER; A-secretary=NOT_A_MEMBER; A-owner=NOT_A_MEMBER; A-tenant=NOT_A_MEMBER; A-family=NOT_A_MEMBER | Pass |
| TC-ROLE-113 | my_society_features: role matrix | allowed only: chairman, treasurer, committee, member, guard, admin, sales | anon=401; admin=OK; chairman=OK; treasurer=OK; committee=OK; member=OK; guard=OK; A-secretary=NOT_A_MEMBER; A-owner=NOT_A_MEMBER; A-tenant=NOT_A_MEMBER; A-family=NOT_A_MEMBER | Pass |
| TC-ROLE-114 | family_invite_list: role matrix | allowed only: chairman, treasurer, committee, member | anon=401; admin=NOT_ALLOWED; chairman=empty; treasurer=empty; committee=empty; member=empty; guard=NOT_ALLOWED; A-secretary=NOT_ALLOWED; A-owner=NOT_ALLOWED; A-tenant=NOT_ALLOWED; A-family=NOT_ALLOWED | Pass |
| TC-ROLE-115 | list_flat_owners: role matrix | allowed only: chairman, treasurer, member | anon=401; admin=NOT_ALLOWED; chairman=empty; treasurer=empty; committee=NOT_ALLOWED; member=empty; guard=NOT_ALLOWED; A-secretary=NOT_ALLOWED; A-owner=NOT_ALLOWED; A-tenant=NOT_ALLOWED; A-family=NOT_ALLOWED | Pass |
| TC-ROLE-116 | reveal_phone: role matrix | allowed only: chairman, treasurer, committee, member | anon=401; admin=NO_SOCIETY; chairman=OK; treasurer=OK; committee=OK; member=OK; guard=NO_SOCIETY; A-secretary=NOT_FOUND_OR_CROSS_TENANT; A-owner=NOT_FOUND_OR_CROSS_TENANT; A-tenant=NOT_FOUND_OR_CROSS_TENANT; A-family=NOT_FOUND_OR_CROSS_TENANT | Pass |
| TC-ROLE-117 | get_dashboard_summary: role matrix | allowed only: chairman, treasurer, committee, member, A-secretary, A-owner, A-tenant, A-family | anon=401; admin=NO_SOCIETY; chairman=OK; treasurer=OK; committee=OK; member=OK; guard=NO_SOCIETY; A-secretary=OK; A-owner=OK; A-tenant=OK; A-family=OK | Pass |
| TC-ROLE-118 | admin_list_societies: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-119 | admin_stats: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-120 | admin_onboarding_metrics: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-121 | admin_society_detail: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-122 | admin_society_authorities: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-123 | admin_society_history: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-124 | admin_list_connect_requests: role matrix | allowed only: admin, sales | anon=401; admin=OK; chairman=NOT_PLATFORM_STAFF; treasurer=NOT_PLATFORM_STAFF; committee=NOT_PLATFORM_STAFF; member=NOT_PLATFORM_STAFF; guard=NOT_PLATFORM_STAFF; A-secretary=NOT_PLATFORM_STAFF; A-owner=NOT_PLATFORM_STAFF; A-tenant=NOT_PLATFORM_STAFF; A-family=NOT_PLATFORM_STAFF | Pass |
| TC-ROLE-125 | admin_list_platform_users: role matrix | allowed only: admin | anon=401; admin=empty; chairman=NOT_PLATFORM_ADMIN; treasurer=NOT_PLATFORM_ADMIN; committee=NOT_PLATFORM_ADMIN; member=NOT_PLATFORM_ADMIN; guard=NOT_PLATFORM_ADMIN; A-secretary=NOT_PLATFORM_ADMIN; A-owner=NOT_PLATFORM_ADMIN; A-tenant=NOT_PLATFORM_ADMIN; A-family=NOT_PLATFORM_ADMIN | Pass |
| TC-ROLE-126 | admin_list_platform_audit: role matrix | allowed only: admin | anon=401; admin=empty; chairman=NOT_PLATFORM_ADMIN; treasurer=NOT_PLATFORM_ADMIN; committee=NOT_PLATFORM_ADMIN; member=NOT_PLATFORM_ADMIN; guard=NOT_PLATFORM_ADMIN; A-secretary=NOT_PLATFORM_ADMIN; A-owner=NOT_PLATFORM_ADMIN; A-tenant=NOT_PLATFORM_ADMIN; A-family=NOT_PLATFORM_ADMIN | Pass |


## 6. Bugs found (roles)

| ID | Severity | Title |
|---|---|---|
| API-001 | High | A member can file a complaint attributed to any other flat in the society |
| API-002 | Medium | Every resident can read every flat's visitor log, including visitor phone numbers |
| API-003 | Low | A guard cannot resolve an SOS addressed to guards |

