# Parisar: Release Readiness Report

**Date:** 10 November 2026.
**Build:** branch `feat/saas-onboarding` (local, uncommitted).
**Environment:** local developer laptop with Next.js in development mode and local Supabase. There is no staging environment.

## 1. Executive summary

**Recommendation: not ready for production release.**

The core of the product works where it was tested. The complaint loop works end to end apart from live updates, and the API enforces roles and keeps societies apart: no cross-society leak was found in 38 isolation checks. The public website and Connect With Us flow pass.

Four things block release:

1. **Dev backdoors are still in the build** (SEC-002, Critical). These are the fixed OTP `123456` for 30 numbers, on-screen OTPs, `/dev-login` and a dev PIN fallback. Today they're switched off by environment settings, but they must be removed before any deployment.
2. **Two main pages crash.** `/notices` and `/polls` return HTTP 500 on load (CORE-001 and CORE-002).
3. **The core loop doesn't update live, and notifications aren't delivered.** New complaints and status changes appear only after a page reload (CORE-005 and CORE-006). Push notifications are queued but never sent, because no provider or worker is configured.
4. **A member can file a complaint under any other flat** in the society (API-001, High). Residents can also read every flat's visitor log, including visitor phone numbers (API-002).

Coverage is also incomplete:
- **Browser testing:** about a quarter of the screens got full screen-by-screen tests in this pass. Many of the rest were checked at the API level, and 105 browser cases are written and ready to run.
- **Performance:** not tested at the required scale.
- **Security:** several checks (XSS, SQL injection, CSRF, CORS, rate limits) are written but not yet run.

## 2. Summary metrics

| Metric | Value |
|---|---|
| Modules implemented | 17 (section 5 of the master plan) |
| Modules in the brief but not implemented | 12 |
| Screens (routes and console sections) | 61 |
| Features classified | 29 by the testers, plus the full list in section 3 |
| Test cases written | 396 |
| Passed | 268 |
| Failed | 20 |
| Blocked | 2 |
| Not tested | 106 (105 ready-to-run browser cases, plus 1 not verified) |
| Bugs logged | 24 |
| Critical bugs | 1 |
| High bugs | 7 |
| Medium bugs | 5 |
| Low bugs | 11 |
| Features ready for release (tested, no open High or Critical bug) | 9 |

Test cases by area:

| Area | Cases | Pass | Fail | Blocked | Not tested |
|---|---|---|---|---|---|
| Public website and authentication (browser) | 29 | 27 | 1 | 1 | 0 |
| Core modules (browser) | 34 | 24 | 8 | 1 | 1 |
| Roles, API and database | 208 | 205 | 3 | 0 | 0 |
| Security | 20 | 12 | 8 | 0 | 0 |
| Remaining screens (written, not run) | 105 | 0 | 0 | 0 | 105 |

The 3 role and API failures are test-script errors, not product defects (see the role document, section 4.2). The real defects found there are API-001 to API-003. The local load baseline is reported separately and isn't counted as pass or fail.

## 3. Complete feature inventory and classification

Classifications:
- **Fully Working:** tested, with no open High or Critical bug.
- **Partially Working:** works with open defects.
- **Backend Only:** tested at the API level, with no browser run in this pass.
- **Not Tested:** exists, but wasn't tested in this pass.

| Module | Feature | Classification | Evidence |
|---|---|---|---|
| Public website | Landing page | Fully Working | ONB-TC |
| Public website | Connect With Us (validation, several authority numbers, schedule, duplicates) | Fully Working | ONB-TC, API `connect` (32 of 33 pass; the 1 failure is a harness error) |
| Public website | Request success page and status lookup | Fully Working | ONB-TC |
| Public website | `/enroll` redirect | Fully Working | ONB-TC |
| Authentication | OTP login (dev stub) | Fully Working in dev; production SMS **Not Implemented** | ONB-TC, SEC |
| Authentication | PIN as second step | Partially Working | SEC-003, SEC-004, SEC-005 |
| Authentication | Signed-out protection and open-redirect protection | Fully Working | SEC section 4 |
| Authentication | `/verify` opened directly | Partially Working | ONB-001 (Low) |
| Platform admin | Request management, register society, society code, feature toggles | Backend Only | API `connect` and `authority`; ADM-TC Not Tested |
| Platform admin | Feature enablement enforced for users | Partially Working | Sidebar hides switched-off features, but the pages still open by URL (CORE-004) |
| Society setup | Wings, floors, flats, draft, completion | Backend Only | API `setup` (18 of 18 pass); SET-TC Not Tested |
| Excel import | Validate, preview, import | Backend Only | API workflows; IMP-TC Not Tested |
| Resident verification | Confirm, correct, report; admin review | Not Tested | VER-TC |
| Onboarding | Owner, tenant, family, household | Backend Only | API `onboard` (7 of 7 pass); ONBD, APR and HH cases Not Tested |
| Roles | Role-by-RPC authorization (each RPC called as anon, platform admin, chairman, treasurer, committee member, member, guard and a different society's users) | Fully Working | Role document 4.2 |
| Multi-society | Isolation across tables and RPCs | Fully Working | API `iso` (38 of 38 pass) |
| Dashboard | Home dashboard for an authority with no flat | Not Working | CORE-003 (redirects to onboarding) |
| Dashboard | Society Dashboard, society profile | Fully Working (loads) | CORE-TC-002 and 003 |
| Complaints | File with photo, board claim, respond, resolve | Fully Working | CORE-TC-017 to 027 |
| Complaints | Live updates to board and reporter | Partially Working | CORE-005, CORE-006 |
| Complaints | Resident notification | Blocked | CORE-TC-034: no push worker or provider |
| Complaints | Attribution to own flat only | Not Working | API-001 (High) |
| Complaints | Search, filter, pagination | Not Implemented | features-core |
| Notices | List page | Not Working | CORE-001 (HTTP 500) |
| Notices | Create and read (API) | Backend Only | API `notices` (6 of 6 pass) |
| Polls | List page | Not Working | CORE-002 (HTTP 500) |
| Polls | Vote, results (API) | Backend Only | API `polls` (10 of 10 pass) |
| Bookings | Request, approve, overlap refusal | Backend Only | API `bookings` (12 of 13 pass; overlap correctly refused) |
| Visitors | Guard logs visit, resident decides | Partially Working | API `visitors` (8 of 10 pass); API-002 (all residents read all visits) |
| SOS | Raise and resolve | Partially Working | API `sos` (9 of 9 pass); API-003 (guard cannot resolve guard SOS) |
| Facilities, community, flat actions | Pages load | Not Tested beyond route smoke | CORE-TC-010 to 016 |
| Staff | Staff management and directory | Not Tested | STF-TC |
| Directory, review queue, code rotation, role transfer, settings, profile | | Not Tested in browser | Section K cases |
| Vehicles, parking, maintenance billing, payments, accounting, events, vendors, documents, reports, deliveries, expected visitors, staff attendance | | **Not Implemented** | No routes; listed in `HIDDEN_NAV_ITEMS` |
| Staff logins (plumber, electrician, cleaner, other) | | **Not Implemented** by design (records only) | Role document section 2 |
| Performance at 100 to 5,000 users | | Not Tested | Performance document |

## 4. Screen inventory and user role matrix

See the master plan, section 6, for all 61 screens. The role-to-screen visibility matrix and the role-by-API matrix are in `PARISAR_ROLE_PERMISSION_TESTING.md`, section 4.

## 5. Test reports by type

| Report | Where | Headline |
|---|---|---|
| Screen-by-screen | `PARISAR_SCREEN_BY_SCREEN_TEST_CASES.md` | 63 executed browser cases, 105 ready to run |
| Field validation | `PARISAR_FIELD_AND_BUTTON_VALIDATION.xlsx`, Fields sheet | Executed rows for the public, auth and complaint forms; designed rows for the others |
| Button testing | Same workbook, Buttons sheet | |
| Navigation | Screen document, common checks C1 to C7 | Signed-out redirects pass; feature-gated pages reachable by URL (CORE-004); no unsaved-changes warning on complaints (CORE-009) |
| API | `PARISAR_API_DATABASE_TESTING.md` | 208 executed cases across 13 areas |
| Database | Same document | Rows verified after each workflow; no duplicates on double submit (CORE-TC-023) |
| Security | `PARISAR_SECURITY_TESTING.md` | 1 Critical, 1 High, 2 Medium, 5 Low; XSS, SQL injection, CSRF and CORS not yet run |
| Performance | `PARISAR_PERFORMANCE_TESTING.md` | Local API reached 500 to 1,000 requests per second with p99 230 to 520 ms at 10 to 50 connections. Laptop-bound; **not a capacity result** |

## 6. Critical and high issues

| ID | Severity | Issue | Required fix |
|---|---|---|---|
| SEC-002 | Critical | Dev backdoors in the build: `test_otp`, on-screen OTP hook, DevOtpHint, `/dev-login`, `/dev-preview`, dev PIN pepper fallback | Remove them, and check the CI guard (`scripts/check-no-dev-otp.mjs`) blocks a deploy that still has them |
| SEC-001 | High | Dev server and database listen on all network interfaces with dev auto-login on | Bind to localhost in development; never run dev routes on a shared network |
| API-001 | High | A member can file a complaint attributed to any flat in their society | Check in `file_complaint` that the flat is the caller's own unless the caller is a manager |
| CORE-001 | High | `/notices` returns HTTP 500 | Fix the server render error; add a render test |
| CORE-002 | High | `/polls` returns HTTP 500 | Same |
| CORE-003 | High | Authority with no flat cannot reach `/dashboard` | Let authorities without a flat into the dashboard, or offer an explicit choice |
| CORE-005 | High | New complaints don't appear live for the board | Fix the realtime subscription filter or channel |
| CORE-006 | High | The reporter's status badge doesn't update live | Update the status from the realtime event, not only the trail |

Medium issues to fix before release:
- **API-002:** visitor log readable by every resident.
- **CORE-004:** switched-off features reachable by URL; gate them server-side.
- **CORE-007:** orphaned and unvalidated uploads.
- **SEC-003:** PIN not enforced server-side.
- **SEC-004:** guessable legacy PIN credential.

## 7. Partially working features

- Complaint live updates
- Visitors (cross-flat read)
- SOS (guard resolve)
- PIN second step
- Feature enablement (UI only)
- `/verify` direct open

## 8. Features not implemented

- Vehicles, parking, maintenance billing and dues, payments, accounting, events, vendors, document library, reports, deliveries, expected visitors and staff attendance
- Complaint search, filter and pagination
- SMS provider and email
- Logins for plumber, electrician, cleaner and other staff (by design)
- Onboarding fields from the brief that aren't in the forms (middle name, profile photo, date of birth, gender, police verification as a separate field). Confirm with ONBD-TC.

## 9. Features ready for release

Ready means tested, with no open High or Critical issue in the feature:
1. Landing page
2. Connect With Us
3. Request status page
4. `/enroll` redirect
5. Signed-out route protection and open-redirect protection
6. Role-based API authorization
7. Multi-society isolation
8. Society Dashboard and society profile pages (load)
9. Filing a complaint with a photo, and the board's claim, response and resolve actions

Even these can only ship once SEC-002 is fixed, because it affects the whole build.

## 10. Features not ready for release

Everything else in section 3:
- **Not Working or Partially Working:** these items need the fixes in section 6.
- **Backend Only or Not Tested:** run the 105 ready cases in Part 3 of the screen document first.

## 11. Required fixes before release, in order

1. Remove the dev backdoors (SEC-002) and lock development binding (SEC-001).
2. Fix `/notices` and `/polls` (CORE-001, CORE-002) and the authority dashboard redirect (CORE-003).
3. Restrict complaint flat attribution (API-001) and the visitor log (API-002).
4. Fix realtime for complaints (CORE-005, CORE-006).
5. Choose and integrate the SMS provider, and run the push worker, so OTPs and notifications work outside development.
6. Gate switched-off features server-side (CORE-004).
7. Run the 105 ready browser cases and the security checks still to run (security document, section 7).
8. Set up staging and run the performance plan at 100, 500, 1,000, 2,000 and 5,000 users.
9. Re-run the full regression suite (master plan, section 23).

## 12. Final release recommendation

**Do not release yet.** Release after items 1 to 7 in section 11 are done and re-tested, and after a staging performance run shows the target load is met. A limited pilot with one friendly society is reasonable once items 1 to 5 are done, provided its expected load is small and someone watches the system during the pilot.

## 13. Testing limitations

- **Interruptions:** testing ran in several interrupted sessions on one laptop. Some planned browser coverage didn't run, and it is marked Not Tested rather than assumed.
- **Production configuration:** the web app ran in development mode, so production settings (HttpOnly cookies, headers, source maps) need a production-build re-check.
- **Notifications:** push and SMS couldn't be tested end to end locally.
- **Earlier evidence:** 143 screenshots of the onboarding screens from 7 November (`docs/onboarding/screenshots/`) predate this pass and aren't counted as passes here.
