# Parisar: Screen-by-Screen Test Cases

This document holds every screen-level test case for Parisar. It has three parts:

1. **Public website and authentication**, executed in the browser in this pass (`ONB-TC-*`).
2. **Core society modules**, executed in the browser in this pass: route smoke for every core route, plus the complaints module end to end (`CORE-TC-*`).
3. **Screens not executed in this pass**: ready-to-run cases with status Not Tested (`ADM`, `AUTH`, `SET`, `IMP`, `VER`, `ONBD`, `APR`, `HH`, `RES`, `STF` and the core-module rows).

Evidence screenshots are under `docs/qa/evidence/<area>/`. Field and button details for the executed screens are in `PARISAR_FIELD_AND_BUTTON_VALIDATION.xlsx`. Bugs are in `PARISAR_BUG_TRACKER.xlsx`.

## Part 1: Onboarding and Public Website: Screen Tests

Area key: `onboarding`. Tester: QA agent (onboarding). Environment: Local dev: Next.js 15 dev server http://localhost:3000, local Supabase, Chrome headless (Playwright), 2026-11-10.

Counts: 29 test cases, 27 Pass, 1 Fail, 1 Blocked, 0 Not Tested. Bugs: 1 (see `docs/qa/data/bugs-onboarding.json`).

## Accounts and test data used

- Group 1 (public pages): signed-out browser, no account. Note: in this dev environment `ENABLE_DEV_ROUTES=1`, so a signed-out visit to a protected route is sent to `/dev-login`, which silently signs in as 9000000005 (not a QA-owned number; no data was written). Production behaviour (redirect to `/login?next=`) cannot be observed here.
- Group 2 (Connect): created requests PR-JM3K-TPQA "QA-T Lotus Society" (contact 9000000001, extra authority 9000000002 "QA-T Ravi Second", slot 11 Nov 11:00 IST, alternative 12 Nov 15:00) and PR-P9DP-PUEF "QA-T Reject Society" (contact 9000000024, As soon as possible). Another tester separately created PR-DF64-PC9E also named "QA-T Lotus Society" (contact 9000000027).

## 1. Screen inventory

| # | Module | Screen | Route | Role | Purpose | Entry point | Previous | Next | Tested |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Public website | Landing page | `/` | Public (signed out) | Introduce Parisar and route visitors to Connect With Us or Log in | Direct URL / home link | None | /connect or /login | Yes |
| 2 | Public website | Connect With Us form | `/connect` | Public (signed out) | Society requests a call from Parisar; lists authority numbers and a call slot | Landing CTA, /enroll redirect | / | /connect/success?code=PR-XXXX-XXXX | Yes |
| 3 | Public website | Connect request success / status lookup | `/connect/success` | Public (signed out) | Show the request ID after submission; otherwise look up a request by ID + mobile | Redirect after Send request; direct URL | /connect | / (Back to home) or /connect (Send a new request) | Yes |
| 4 | Public website | Enroll (legacy) | `/enroll` | Public | Old enrollment route, now redirects | Direct URL | n/a | /connect | Yes |
| 5 | Authentication | Login | `/login` | Resident / Society authority (signed out) | Enter mobile number and request OTP; toggle Resident vs Society authority | Landing "Log in", middleware redirect | / | /verify | Yes |
| 6 | Authentication | Verify OTP / PIN | `/verify` | Signed out, OTP pending | Enter 6-digit OTP, then society picker (authority), set/enter PIN | /login Send OTP | /login | /setup, /onboarding, /dashboard or console depending on account | Yes |
| 7 | Family invite | Household invitation (public) | `/invite/[token]` | Public / invitee | Landing for a family invite link; asks invitee to sign in | Shared invite link | n/a | /login then /join/invite/[token] | Yes |

## 2. Screen-by-screen tests

### Landing page (`/`)

**Screen information.** Module: Public website. Role: Public (signed out). Purpose: Introduce Parisar and route visitors to Connect With Us or Log in. Entry point: Direct URL / home link. Previous screen: None. Next screen: /connect or /login.

**Field testing.** No input fields.

**Button testing.** Header "Log in" and "Connect with us", hero "Connect with us" and "Log in" links present.

**Navigation testing.** Header links render; page is public so refresh keeps the page.

**UI checks.** 1280px and 375px render with no horizontal overflow and no console errors.

#### ONB-TC-001: Landing page renders at 1280px

- Preconditions: None
- Steps: Open http://localhost:3000/ at 1280x900.
- Test data: n/a
- Expected: Hero, benefits, feature overview, CTAs, footer render; no console errors; no horizontal scroll.
- Actual: Rendered with "Bring your whole society together", Connect with us and Log in CTAs; no console errors; no overflow.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/landing-1280.png

#### ONB-TC-002: Landing page renders at 375px

- Preconditions: None
- Steps: Open / at 375x812.
- Test data: n/a
- Expected: Responsive layout, no horizontal scroll.
- Actual: Responsive, scrollWidth equals viewport.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/landing-375.png


### Connect With Us form (`/connect`)

**Screen information.** Module: Public website. Role: Public (signed out). Purpose: Society requests a call from Parisar; lists authority numbers and a call slot. Entry point: Landing CTA, /enroll redirect. Previous screen: /. Next screen: /connect/success?code=PR-XXXX-XXXX.

**Field testing.** Society name (2-120), Your name (2-80), Mobile (+91, 10 digits starting 6-9, non-digits stripped), Email (optional), Authority numbers (extra rows, max 5), Call time radio (At a time I choose / As soon as possible), Preferred date + time, Alternative date + time (optional), Message (optional, max 1000).

**Button testing.** Send request, Add another number, Remove number (per row), Back to home.

**Navigation testing.** "Back to home" link. /enroll redirects here.

**UI checks.** 1280px and 375px render with no horizontal overflow. Required asterisks, "Optional" tags and helper text present.

#### ONB-TC-003: Connect form renders at 1280px and 375px

- Preconditions: None
- Steps: Open /connect at both widths.
- Test data: n/a
- Expected: All sections visible, no overflow.
- Actual: Society, Your details, Authority numbers, When should we call, Anything else, Send request all visible; no overflow at either width.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-1280.png, docs/qa/evidence/onboarding/connect-375.png

#### ONB-TC-004: Empty submit shows all required-field errors and focuses first invalid field

- Preconditions: None
- Steps: Open /connect, click Send request without typing.
- Test data: n/a
- Expected: Inline errors for society name, name, mobile, date, time; focus on first invalid field.
- Actual: Errors: "Enter your society's name (2 to 120 characters)", "Enter your name (2 to 80 characters)", "Enter a 10-digit mobile number starting with 6, 7, 8 or 9", "Choose a date", "Choose a time". Focus moved to #connect-society.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-empty-errors-1280.png

#### ONB-TC-005: One-character names and invalid email rejected

- Preconditions: None
- Steps: Society "Q", name "A", email "abc@", submit.
- Test data: Q / A / abc@
- Expected: Length errors and email error.
- Actual: Length errors shown; "Enter a valid email address, or leave it blank."
- Status: **Pass**
- Evidence: n/a (console log)

#### ONB-TC-006: Mobile validation: short number and number starting with 5

- Preconditions: None
- Steps: Enter 12345, submit; then 5123456789, submit.
- Test data: n/a
- Expected: Mobile error both times.
- Actual: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9." shown both times.
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-007: Mobile input strips letters and caps at 10 digits

- Preconditions: None
- Steps: Type "98ab76543210123" in mobile.
- Test data: n/a
- Expected: Only digits kept, max 10.
- Actual: Value became 9876543210.
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-014: Authority numbers: add up to 5 extra rows, then limit message

- Preconditions: None
- Steps: Enter contact mobile, click "Add another number" until it disappears.
- Test data: n/a
- Expected: Max 5 extra rows; button replaced by limit text.
- Actual: 5 rows added; button replaced with "You can add up to 5 more numbers. Add others after your society is set up."
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-authority-limit-1280.png

#### ONB-TC-015: Authority number duplicate of contact and invalid number rejected

- Preconditions: None
- Steps: Contact 9000000001; row 1 = 9000000001, row 2 = 12, other rows blank; submit.
- Test data: n/a
- Expected: Duplicate and invalid errors on the rows.
- Actual: Row 1 "This number is already on the list."; row 2 and blank rows "Enter a 10-digit mobile number...". Blank added rows are errors rather than ignored.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-authority-dup-1280.png

#### ONB-TC-016: Remove authority rows

- Preconditions: None
- Steps: Click the trash button on each extra row.
- Test data: n/a
- Expected: Rows removed, Add button returns.
- Actual: All rows removed; Add another number shown again.
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-017: Message over 1000 characters

- Preconditions: None
- Steps: Type 1005 characters in Message, submit.
- Test data: n/a
- Expected: Counter and error.
- Actual: Field accepts 1005 characters (no maxLength) and shows "Keep the message under 1,000 characters." on submit.
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-018: Date picker disables past dates

- Preconditions: None
- Steps: Open preferred Date picker on 10 Nov 2026.
- Test data: n/a
- Expected: 1-9 Nov disabled, today onward enabled, max today+89.
- Actual: Calendar opened; 9 past days disabled.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-datepicker-open-1280.png

#### ONB-TC-019: Preferred slot in the past rejected

- Preconditions: None
- Steps: Pick today (10 Nov), time 00:05, submit.
- Test data: n/a
- Expected: Past-slot error.
- Actual: "This time has already passed. Choose a later time."
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-020: Alternative slot equal to preferred slot rejected

- Preconditions: None
- Steps: Preferred 11 Nov 11:00, alternative 11 Nov 11:00, submit.
- Test data: n/a
- Expected: Error asking for a different time.
- Actual: "Choose a different time from your preferred one."
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-021: Valid request with extra authority, schedule and alternative slot is saved

- Preconditions: None
- Steps: Fill all fields (see data), submit. Verify with SQL select on society_enrollment_requests.
- Test data: QA-T Lotus Society / QA-T Asha Lotus / 9000000001 / qa-t-lotus@example.com / authority 9000000002 / 11 Nov 11:00 / 12 Nov 15:00 / message with <b>bold</b>
- Expected: Row created with request code, both authority numbers, slots in IST, status new/scheduled.
- Actual: Row PR-JM3K-TPQA, status call_scheduled, authority_numbers [9000000001, 9000000002], preferred_at 2026-11-11 05:30 UTC (11:00 IST), alternate_at 2026-11-12 09:30 UTC (15:00 IST), message stored as plain text. First submission took >4 s on a freshly restarted dev server (button showed "Sending…").
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-filled-1280.png

#### ONB-TC-022: Duplicate open request from same mobile

- Preconditions: None
- Steps: Submit a second request with mobile 9000000001 while PR-JM3K-TPQA is open.
- Test data: n/a
- Expected: Clear "already have your request" notice, no new row.
- Actual: Notice "We already have your request" with a link to check it; no new row in DB.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-duplicate-1280.png

#### ONB-TC-023: "As soon as possible" request redirects to success

- Preconditions: None
- Steps: QA-T Reject Society, 9000000024, choose As soon as possible, Send request.
- Test data: n/a
- Expected: Redirect to /connect/success?code=...
- Actual: Redirected in 1.3 s to /connect/success?code=PR-P9DP-PUEF.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-asap-1280.png


### Connect request success / status lookup (`/connect/success`)

**Screen information.** Module: Public website. Role: Public (signed out). Purpose: Show the request ID after submission; otherwise look up a request by ID + mobile. Entry point: Redirect after Send request; direct URL. Previous screen: /connect. Next screen: / (Back to home) or /connect (Send a new request).

#### ONB-TC-009: Direct visit with no stored request shows status lookup

- Preconditions: None
- Steps: Open /connect/success in a fresh browser.
- Test data: n/a
- Expected: Lookup form (Request ID + mobile) rather than a broken page.
- Actual: "Check your request" form with Request ID, Mobile number, Check status, Send a new request, Back to home.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-success-empty-1280.png, docs/qa/evidence/onboarding/connect-success-empty-375.png

#### ONB-TC-024: Success page shows request ID, society, status, schedule and next steps

- Preconditions: None
- Steps: After submission view the success page.
- Test data: n/a
- Expected: Request ID, copy button, society, status, scheduled call.
- Actual: Shows PR-P9DP-PUEF, "Copy request ID", QA-T Reject Society, Status New, Scheduled call "As soon as possible", 3 next steps.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-success-1280.png

#### ONB-TC-025: Copy request ID button

- Preconditions: None
- Steps: Click "Copy request ID", read clipboard.
- Test data: n/a
- Expected: Clipboard holds the code.
- Actual: Clipboard = PR-P9DP-PUEF.
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-026: Refresh success page keeps the data

- Preconditions: None
- Steps: Reload /connect/success?code=PR-P9DP-PUEF.
- Test data: n/a
- Expected: Same details shown.
- Actual: Same details shown after reload (session storage).
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-027: Status lookup: invalid code format

- Preconditions: None
- Steps: Fresh browser at 375px, Request ID "XYZ", mobile 9000000001, Check status.
- Test data: n/a
- Expected: Format error.
- Actual: "Enter the request ID in the form PR-XXXX-XXXX."
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-028: Status lookup: right code, wrong mobile

- Preconditions: None
- Steps: PR-JM3K-TPQA + 9000000099.
- Test data: n/a
- Expected: Generic not-found message (no leak).
- Actual: "We couldn't find a request with that ID and mobile number. Check both and try again."
- Status: **Pass**
- Evidence: n/a

#### ONB-TC-029: Status lookup: valid code (lower case) and mobile at 375px

- Preconditions: None
- Steps: pr-jm3k-tpqa + 9000000001.
- Test data: n/a
- Expected: Request status shown; no overflow at 375px.
- Actual: "Your request" status card shown; code normalised to upper case; no overflow.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/connect-status-lookup-375.png


### Enroll (legacy) (`/enroll`)

**Screen information.** Module: Public website. Role: Public. Purpose: Old enrollment route, now redirects. Entry point: Direct URL. Previous screen: n/a. Next screen: /connect.

#### ONB-TC-008: /enroll redirects to /connect

- Preconditions: None
- Steps: Open /enroll.
- Test data: n/a
- Expected: Redirect to /connect.
- Actual: Landed on /connect (title "Connect with us | Parisar").
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/enroll-1280.png


### Login (`/login`)

**Screen information.** Module: Authentication. Role: Resident / Society authority (signed out). Purpose: Enter mobile number and request OTP; toggle Resident vs Society authority. Entry point: Landing "Log in", middleware redirect. Previous screen: /. Next screen: /verify.

#### ONB-TC-010: Login renders with Resident / Society authority toggle

- Preconditions: None
- Steps: Open /login and /login?as=authority at 1280 and 375.
- Test data: n/a
- Expected: Phone input with +91, toggle, Send OTP, Forgot PIN; authority copy when as=authority.
- Actual: Both variants render correctly; authority variant shows "Society authority sign-in" and "Authority Number" label; no overflow.
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/login-1280.png, docs/qa/evidence/onboarding/login-authority-1280.png, docs/qa/evidence/onboarding/login-375.png

#### ONB-TC-013: Protected route while signed out (/setup, /import, /c/k7m2x9)

- Preconditions: None
- Steps: In a fresh browser open /setup, /import and /c/k7m2x9.
- Test data: n/a
- Expected: Redirect to /login?next=<route>.
- Actual: Dev environment: redirected via /dev-login, which auto-signed in as 9000000005 and showed /onboarding. The production redirect to /login cannot be observed with ENABLE_DEV_ROUTES=1.
- Status: **Blocked**
- Evidence: docs/qa/evidence/onboarding/setup-signedout-1280.png, docs/qa/evidence/onboarding/console-signedout-1280.png


### Verify OTP / PIN (`/verify`)

**Screen information.** Module: Authentication. Role: Signed out, OTP pending. Purpose: Enter 6-digit OTP, then society picker (authority), set/enter PIN. Entry point: /login Send OTP. Previous screen: /login. Next screen: /setup, /onboarding, /dashboard or console depending on account.

#### ONB-TC-011: Direct visit to /verify without a phone number

- Preconditions: None
- Steps: Open /verify with no query string.
- Test data: n/a
- Expected: Redirect to /login, or a clear message that no number was entered.
- Actual: OTP screen shows "Sent to +91" with no number and a running "Resend OTP in 0:59" timer; Verify button active.
- Status: **Fail**
- Evidence: docs/qa/evidence/onboarding/verify-direct-1280.png


### Household invitation (public) (`/invite/[token]`)

**Screen information.** Module: Family invite. Role: Public / invitee. Purpose: Landing for a family invite link; asks invitee to sign in. Entry point: Shared invite link. Previous screen: n/a. Next screen: /login then /join/invite/[token].

#### ONB-TC-012: Invalid / truncated invite token

- Preconditions: None
- Steps: Open /invite/badtoken123.
- Test data: n/a
- Expected: Friendly invalid-link message.
- Actual: "This link is not complete. Ask the person who invited you to copy the full link again."
- Status: **Pass**
- Evidence: docs/qa/evidence/onboarding/invite-bad-1280.png, docs/qa/evidence/onboarding/invite-bad-375.png


## Part 2: Core modules: screens and test cases (area `core`)

Tester: core. Environment: http://localhost:3000 (Next dev), local Supabase, Chrome headless via playwright-core outside the repo. Sessions were opened with /dev-login?as=<phone> (dev-only route that verifies OTP 123456 server-side); the OTP/PIN UI itself belongs to the onboarding area. Society under test: QA Sunrise Heights (06d44e6a-...). Switched-on features there: visitors, staff_directory, directory, polls (+ core notices, complaints, sos). New data is prefixed "QA-T ".

Counts: 34 test cases, 24 Pass, 8 Fail, 1 Blocked, 1 Not Tested. Bugs: 11.

## 1. Module inventory

| Module | Route(s) | Sidebar (manager / resident) | Status | Evidence |
|---|---|---|---|---|
| Home dashboard | /dashboard | Home / Home | Testing | crawl-17-_dashboard-1280.png |
| Society dashboard (authority) | /society-dashboard | Society / - | Testing |  |
| Society profile | /society | Society / - | Testing |  |
| Complaints (society list) | /complaints, /complaints/new, /complaints/[id] | Services / board only | Testing |  |
| My complaints | /my-complaints | Services / My home | Testing |  |
| Notices | /notices, /notices/new, /notices/[id] | Communication / Communication | Testing |  |
| Polls | /polls | Communication / Communication (feature polls) | Testing |  |
| Bookings | /bookings, /bookings/new | Services (feature bookings; OFF for QA Sunrise Heights) | Testing |  |
| Facility calendar | /facilities | Services (feature facility_calendar; OFF) | Testing |  |
| Community | /community, /community/new, /community/[id], /community/moderation | Communication (feature community; OFF) | Testing |  |
| Flat actions | /flat-actions, /flat-actions/new, /flat-actions/[id] | Services manager only (feature flat_actions; OFF) | Testing |  |
| Visitors | /visitors | Security / My home (feature visitors) | Testing |  |
| Guard console | /guard (outside protected group) | not in sidebar | Testing |  |
| Staff directory / manage | /staff, /staff/manage, /staff/manage/new, /staff/manage/[id] | Security / Services (feature staff_directory) | Testing |  |
| SOS | header button "Emergency SOS" (components/sos) | header, all roles (core feature) | Testing |  |
| Member directory | /dashboard/directory, /dashboard/directory/[id] | Residents / Communication (feature directory) | Testing |  |
| Join review queue | /dashboard/review-queue | Residents / - | Testing |  |
| Society code rotation | /dashboard/code-rotation | Society / - | Testing |  |
| Role transfer | /dashboard/role-transfer | Settings, secretary only | Testing |  |
| Notification settings | /settings/notifications | Settings / Settings | Testing |  |
| Grievance officer | /settings/grievance-officer | Settings / - | Testing |  |
| Profile (+ language, logout) | /profile, header avatar menu | Settings / Settings | Testing |  |
| My household | /household | Residents / My home | Testing |  |
| About | /about | not in sidebar | Testing |  |
| Join flow | /join/code, /join/pending, /join/profile, /join/success, /join/invite/[token] | not in sidebar (onboarding area) | Testing (signed-in reachability only) |  |
| Legacy onboard | /onboard | not in sidebar | Testing |  |
| Residents, approvals, import, verification, setup | /residents/*, /approvals, /import, /verification/*, /setup/* | Residents / Society | Out of core scope (onboarding area); reachability only |  |
| Vehicles | none | none | Not Implemented | no route under apps/web/app; no nav item |
| Parking | none | HIDDEN_NAV_ITEMS security.parking | Not Implemented | lib/nav/sidebarNav.js HIDDEN_NAV_ITEMS |
| Maintenance billing / dues | none | HIDDEN_NAV_ITEMS finance.maintenance_dues | Not Implemented | sidebarNav.js |
| Payments | none | none (fines recorded only, CLAUDE.md "No payments") | Not Implemented | no route |
| Accounting | none | HIDDEN_NAV_ITEMS finance.accounting | Not Implemented | sidebarNav.js |
| Events | none | HIDDEN_NAV_ITEMS communication.events | Not Implemented | sidebarNav.js (platform_features "bookings" is named "Events & Bookings" but has no event entity) |
| Vendors | none | HIDDEN_NAV_ITEMS services.vendors, finance.vendor_payments | Not Implemented | sidebarNav.js |
| Documents | none | HIDDEN_NAV_ITEMS documents.society_documents | Not Implemented | sidebarNav.js |
| Reports | none | HIDDEN_NAV_ITEMS reports.reports | Not Implemented | sidebarNav.js |
| Deliveries | none (visitors module may log a delivery purpose) | none | Not Implemented as a module | no route |
| User / role management | /dashboard/role-transfer, society-dashboard authorities section | Settings | Partial (secretary hand-over and authority list only) |  |
| Subscription | /society-dashboard features section (request add/remove, priced per month) | Society | Testing (request only; approval is platform admin) |  |
| Expected visitors / staff attendance | none | HIDDEN_NAV_ITEMS security.* | Not Implemented | sidebarNav.js |

## 2. Screens

### All: Route smoke (direct URL as authority) (`many`)

- **Role(s):** secretary 14
- **Purpose:** Baseline: every route loads
- **Entry point:** direct URL
- **Previous / next screen:** -

#### CORE-TC-001: Authority (14) opens /dashboard by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/dashboard; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /onboarding, h1 "Your details and flat", overflow 0 px at 1280 and 375
- Status: **Fail**
- Evidence: docs/qa/evidence/core/crawl-14-_dashboard-1280.png, -375.png

#### CORE-TC-002: Authority (14) opens /society-dashboard by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/society-dashboard; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /society-dashboard, h1 "Society Dashboard", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_society-dashboard-1280.png, -375.png

#### CORE-TC-003: Authority (14) opens /society by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/society; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /society, h1 "Society profile", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_society-1280.png, -375.png

#### CORE-TC-004: Authority (14) opens /complaints by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/complaints; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /complaints, h1 "Complaints", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_complaints-1280.png, -375.png

#### CORE-TC-005: Authority (14) opens /complaints/new by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/complaints/new; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /complaints/new, h1 "", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_complaints_new-1280.png, -375.png

#### CORE-TC-006: Authority (14) opens /my-complaints by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/my-complaints; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /my-complaints, h1 "Complaints", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_my-complaints-1280.png, -375.png

#### CORE-TC-007: Authority (14) opens /notices by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/notices; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 500, final URL /notices, h1 "Notices", overflow 0 px at 1280 and 375
- Status: **Fail**
- Evidence: docs/qa/evidence/core/crawl-14-_notices-1280.png, -375.png

#### CORE-TC-008: Authority (14) opens /notices/new by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/notices/new; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /notices/new, h1 "New Notice", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_notices_new-1280.png, -375.png

#### CORE-TC-009: Authority (14) opens /polls by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/polls; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 500, final URL /polls, h1 "Polls", overflow 0 px at 1280 and 375
- Status: **Fail**
- Evidence: docs/qa/evidence/core/crawl-14-_polls-1280.png, -375.png

#### CORE-TC-010: Authority (14) opens /bookings by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/bookings; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /bookings, h1 "Bookings", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_bookings-1280.png, -375.png

#### CORE-TC-011: Authority (14) opens /bookings/new by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/bookings/new; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /bookings/new, h1 "Request Booking", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_bookings_new-1280.png, -375.png

#### CORE-TC-012: Authority (14) opens /facilities by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/facilities; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /facilities, h1 "Facility calendar", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_facilities-1280.png, -375.png

#### CORE-TC-013: Authority (14) opens /community by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/community; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /community, h1 "Community", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_community-1280.png, -375.png

#### CORE-TC-014: Authority (14) opens /community/new by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/community/new; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /community/new, h1 "New Post", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_community_new-1280.png, -375.png

#### CORE-TC-015: Authority (14) opens /community/moderation by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/community/moderation; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /community/moderation, h1 "Moderation", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_community_moderation-1280.png, -375.png

#### CORE-TC-016: Authority (14) opens /flat-actions by direct URL at 1280 and 375 px

- Preconditions: Signed in as 9000000014 (secretary, QA Sunrise Heights) via /dev-login
- Steps: Open http://localhost:3000/flat-actions; wait for network idle; record HTTP status, final URL, h1, horizontal overflow; resize to 375 px
- Test data: 
- Expected: HTTP 200, page stays on route, no horizontal scroll at 1280 or 375
- Actual: HTTP 200, final URL /flat-actions, h1 "Flat Actions — Society", overflow 0 px at 1280 and 375
- Status: **Pass**
- Evidence: docs/qa/evidence/core/crawl-14-_flat-actions-1280.png, -375.png

### Complaints: File a Complaint (`/complaints/new`)

- **Role(s):** Any active member with a flat (owner 17/18, tenant 19, family 20/21); authorities without a flat also reach it
- **Purpose:** Resident raises a society or member issue with optional photo
- **Entry point:** 'File a Complaint' button on /complaints or /my-complaints; dashboard My Complaints tile
- **Previous / next screen:** /complaints or /my-complaints -> (submit) toast -> /complaints (members are shown the My Complaints list)

**Field testing:** Type (segmented radio: Society Issue default / Member Issue); Description (textarea, min 10 trimmed chars, maxLength 1000, live counter n/1000, hint 'Please describe the issue in at least 10 characters.'); Photo (optional file input accept=image/*, client limit 10 MB, non-image rejected with 'Choose an image file (JPG, PNG or similar).'). Submit disabled while empty, <10 chars, whitespace only, or photo uploading.

**Button testing:** Back (to list), Society Issue / Member Issue radios, Tap to add photo, Remove photo (x), Submit Complaint (disabled until valid; shows Submitting; success toast then redirect after delay). Double-click creates exactly one row.

**Navigation testing:** Back link and browser back return to list; no unsaved-changes prompt when leaving with typed text (Low, see CORE-009). Direct URL signed out -> /login (see smoke).

**UI checks:** 1280 and 375 px: no horizontal overflow; nested <main> elements (CORE-008).

#### CORE-TC-017: Submit disabled for empty, short and whitespace-only description

- Preconditions: Owner 17 signed in, /complaints/new
- Steps: Leave empty; type 'short'; type 10 spaces; check Submit state
- Test data: '', 'short', '          '
- Expected: Submit disabled; hint shown for short text
- Actual: Disabled in all three; hint 'Please describe the issue in at least 10 characters.' and counter 5/1000
- Status: **Pass**
- Evidence: docs/qa/evidence/core/loop-01-new-form.png

#### CORE-TC-018: Description max length 1000

- Preconditions: same
- Steps: Type 1100 chars
- Test data: 'x' x 1100
- Expected: Capped at 1000, counter turns red
- Actual: Value length 1000, counter 1000/1000
- Status: **Pass**
- Evidence: docs/qa/evidence/core/loop-02-file-validation.png

#### CORE-TC-019: Non-image file rejected

- Preconditions: same
- Steps: Choose note.txt in the photo input
- Test data: note.txt (5 B, text/plain)
- Expected: Inline error, nothing uploaded
- Actual: 'Choose an image file (JPG, PNG or similar).'
- Status: **Pass**
- Evidence: docs/qa/evidence/core/loop-02-file-validation.png

#### CORE-TC-020: Corrupt/large image with image extension

- Preconditions: same
- Steps: Choose big.jpg (6 MB random bytes, not a real JPEG)
- Test data: big.jpg
- Expected: Rejected as not a valid image, or resized; nothing stored
- Actual: Accepted with no message and uploaded to storage (6,000,000 B object) before being replaced; content is not checked
- Status: **Fail**
- Evidence: storage.objects row .../7b1d7588-.../efc1f97e-....jpg size 6000000

#### CORE-TC-021: Replacing a photo removes the earlier upload

- Preconditions: same
- Steps: Attach big.jpg, then attach photo.png, submit
- Test data: 
- Expected: Only the final photo remains in storage
- Actual: attachments has 1 row (png) but the replaced 6 MB jpg stays in storage.objects as an orphan
- Status: **Fail**
- Evidence: SQL: storage.objects for complaint 7b1d7588

#### CORE-TC-022: Owner files society complaint with photo (core loop step 1)

- Preconditions: Owner 17
- Steps: Society Issue, valid description, attach photo.png (64x64), Submit
- Test data: 'QA-T Lift in A Wing stops between floors 2 and 3 since morning <ts>'
- Expected: Toast, redirect to list, row + attachment saved
- Actual: Toast shown, redirected to /complaints; complaints row 7b1d7588 kind=society status=open; attachments row png 177 B
- Status: **Pass**
- Evidence: docs/qa/evidence/core/loop-03-photo-attached.png, docs/qa/evidence/core/loop-04-submitted-toast.png

#### CORE-TC-023: Double-click Submit creates one complaint

- Preconditions: Owner 18
- Steps: Member Issue, valid text, double-click Submit
- Test data: 'QA-T Water seepage from ceiling ...'
- Expected: Exactly one row
- Actual: 1 row (SQL count)
- Status: **Pass**
- Evidence: SQL

### Complaints: Complaints list (board) / My Complaints (member) (`/complaints, /my-complaints`)

- **Role(s):** Board/authority see all society complaints with Open/Resolved tabs; members are shown 'My Complaints' (own only) at the same /complaints URL
- **Purpose:** Track complaints and status
- **Entry point:** Sidebar Services > Complaints (manager/board) or My home > My Complaints
- **Previous / next screen:** Dashboard -> list -> /complaints/[id]

**Field testing:** Tabs Open / Resolved (board). No search, filter by type, or pagination controls visible (list loads 30, cursor in API).

**Button testing:** Dashboard back link, File a Complaint, card click -> detail.

**Navigation testing:** Card click navigates to detail; reload keeps state.

**UI checks:** Empty states: board 'All quiet for now / No complaints have been filed by residents.', member 'File your first complaint anytime.' Realtime insert does not appear (CORE-005).

#### CORE-TC-024: Authority list receives a new complaint in realtime

- Preconditions: Authority 14 (and 15) have /complaints open; owner files a complaint
- Steps: Wait 6 s (run 1) and 12 s (run 2) without reload
- Test data: 
- Expected: New card appears at top without refresh
- Actual: Not shown after 12 s; appears only after reload
- Status: **Fail**
- Evidence: docs/qa/evidence/core/loop-05-authority-list-realtime.png, docs/qa/evidence/core/rt-01-authority-list-12s-after-insert.png

#### CORE-TC-025: Authority list shows new complaint after reload

- Preconditions: same
- Steps: Reload /complaints
- Test data: 
- Expected: Card with text, 'Filed by <name> (A Wing-101)', Open
- Actual: As expected
- Status: **Pass**
- Evidence: docs/qa/evidence/core/loop-06-authority-detail.png

#### CORE-TC-029: Reporter's list status updates (realtime and after reload)

- Preconditions: Owner 17 on My Complaints while authority resolves
- Steps: Wait 5 s; then reload
- Test data: 
- Expected: Status Resolved
- Actual: Stays 'Open' live; shows 'Resolved' and 'Owned by QA Contact One' after reload
- Status: **Fail**
- Evidence: docs/qa/evidence/core/loop-09-owner-resolved.png, docs/qa/evidence/core/loop-10-owner-my-complaints.png

### Complaints: Complaint detail and response (`/complaints/[id]`)

- **Role(s):** Reporter (read-only + trail), board (claim/respond), other board after claim (read-only 'Owned by' banner)
- **Purpose:** Board member claims and responds; status trail visible to reporter
- **Entry point:** Card on complaints list
- **Previous / next screen:** list <- Back

**Field testing:** Free-text note textarea (optional, maxLength 500, counter).

**Button testing:** Response chips Checking / Will resolve soon / Need more info / Resolved (first click claims atomically; response kind becomes status). Photo thumbnail opens dialog.

**Navigation testing:** Back to list; non-permitted id shows not-found card.

**UI checks:** Authority attribution shows flat as '(—)' (CORE-010). Not-found card shows two contradictory messages (CORE-011).

#### CORE-TC-026: Authority claims complaint with 'Checking' and note (core loop step 2)

- Preconditions: Authority 14 on detail
- Steps: Type note, click Checking
- Test data: 'QA-T Technician called, checking today'
- Expected: Status Checking, 'You own this complaint.', trail entry with note
- Actual: As expected; complaint_responses row checking with note
- Status: **Pass**
- Evidence: docs/qa/evidence/core/loop-07-authority-claimed.png

#### CORE-TC-027: Owner of complaint changes status to Resolved

- Preconditions: Authority 14 owns complaint
- Steps: Click Resolved
- Test data: 
- Expected: status=resolved
- Actual: DB status resolved; second response row
- Status: **Pass**
- Evidence: SQL complaints 7b1d7588

#### CORE-TC-028: Reporter sees the new response in realtime (core loop step 3)

- Preconditions: Owner 18 has detail open; authority 15 responds 'Will resolve soon' with note
- Steps: Wait 12 s
- Test data: 
- Expected: Trail entry appears and status badge changes to 'Will resolve soon'
- Actual: Trail entry appears live, but the status badge still says 'Open' until reload
- Status: **Fail**
- Evidence: docs/qa/evidence/core/rt-03-owner-detail-12s-after-response.png

#### CORE-TC-030: Second board member sees owned-by lock

- Preconditions: Authority 16 opens complaint owned by 15
- Steps: Open detail
- Test data: 
- Expected: No response chips; 'Owned by ...' banner
- Actual: 'Owned by QA Authority One (—). They are managing this complaint.'; no chips
- Status: **Pass**
- Evidence: docs/qa/evidence/core/rt-04-other-authority-owned-banner.png

#### CORE-TC-031: Reporter cannot respond

- Preconditions: Owner on own complaint detail
- Steps: Look for response chips / note box
- Test data: 
- Expected: Absent
- Actual: Absent (no #complaint-free-text)
- Status: **Pass**
- Evidence: docs/qa/evidence/core/rt-03-owner-detail-12s-after-response.png

#### CORE-TC-032: Unrelated member opens another flat's Member Issue by URL

- Preconditions: Tenant 19 (A-102) opens complaint 52923cef filed by owner 18 (A-102)
- Steps: Direct URL
- Test data: 
- Expected: Access denied/not found, no data
- Actual: 'Complaint not found' card; no data leaked. Also shows contradictory 'Check your connection' line
- Status: **Pass**
- Evidence: docs/qa/evidence/core/rt-02-tenant-view-other-member-complaint.png

#### CORE-TC-033: Complaint photo visible on detail

- Preconditions: Owner 17 complaint with png
- Steps: Open detail as authority
- Test data: 
- Expected: Thumbnail and enlarge dialog
- Actual: Not verified: script navigation raced; attachment row exists
- Status: **Not Tested**
- Evidence: 

#### CORE-TC-034: Resident notified of status change (push)

- Preconditions: Responses created
- Steps: SQL push_outbox
- Test data: 
- Expected: Push delivered to reporter
- Actual: push_outbox rows complaint_response x2 created but processed_at NULL (no push worker/FCM locally). No in-app notification inbox exists on web; the only signal is the live trail entry
- Status: **Blocked**
- Evidence: SQL push_outbox

## 3. Bugs (summary)

| ID | Sev | Screen | Title |
|---|---|---|---|
| CORE-001 | High | /notices | Notices list returns HTTP 500 on server render though the page body shows the empty state |
| CORE-002 | High | /polls | Polls list returns HTTP 500 on server render |
| CORE-003 | High | /dashboard | Authority without a flat is redirected from /dashboard to /onboarding ("Your details and flat") |
| CORE-004 | Medium | /bookings, /facilities, /community, /flat-actions | Switched-off features are only hidden from the sidebar; their pages open by direct URL |
| CORE-005 | High | /complaints | New complaints do not appear in the board list in realtime |
| CORE-006 | High | /complaints/[id], /my-complaints | Reporter's status badge does not update live when board responds (core loop) |
| CORE-007 | Medium | /complaints/new | Replaced or abandoned complaint photos stay in storage; image content not validated |
| CORE-008 | Low | /complaints and others | Nested <main> landmarks (layout main#main-content wraps page <main>) |
| CORE-009 | Low | /complaints/new | No unsaved-changes warning when leaving a typed complaint |
| CORE-010 | Low | /complaints/[id] | Authority responses show flat as '(—)' |
| CORE-011 | Low | /complaints/[id] | Not-found card also shows 'Check your connection' error |

Full details: `docs/qa/data/bugs-core.json`.

## 4. Not tested and why

- Session was interrupted once; owner (17) crawl log was lost (screenshots kept) and is being re-run.

## Part 3: Screens not executed in this pass

These screens exist in the code, but nobody exercised them screen-by-screen in the browser in this QA pass. That's because testing time ran out after repeated session interruptions. Each one has test cases ready to run. Every case here has status **Not Tested**.

Where a screen was browser-tested during the onboarding build on 7 November 2026, the screenshot is named under "Earlier evidence" in `docs/onboarding/screenshots/`. That earlier evidence is **not** a pass for this QA cycle: re-run the cases.

Many of the server functions behind these screens **were** tested at the API level in this pass, by role and across societies. See `PARISAR_API_DATABASE_TESTING.md` and `PARISAR_ROLE_PERMISSION_TESTING.md`. The browser cases below check the screens on top of those functions.

**Accounts:**
- Platform admin: 9000000030.
- Authority (QA Sunrise Heights): 9000000014.
- Owner: 17. Tenant: 19. Household member: 20. Family member: 21.
- Guard (QA-T Lotus Society): 9000000006.
- Chairman (QA-T Lotus Society): 9000000027.
- OTP for all accounts: `123456`.

**Common checks for every screen below**, run once per screen in addition to its own cases:

| ID suffix | Check | Expected |
|---|---|---|
| -C1 | Open the route signed out | Redirect to `/login?next=<route>` |
| -C2 | Open as a role that should not see it (see role matrix) | Refused: redirect or a "not allowed" state, and no data shown |
| -C3 | Browser refresh | Same state reloads; no duplicate submission |
| -C4 | Browser back after a successful save | No resubmission; the list shows the saved item once |
| -C5 | Widths 375, 768, 1280 px | No horizontal scroll; tap targets at least 44 px; text not clipped |
| -C6 | Network offline during save (DevTools) | Error message shown, form keeps its values, button re-enabled |
| -C7 | Keyboard only | Every control reachable by Tab, visible focus ring, Enter submits, Esc closes dialogs |

---

## A. Platform admin console (`/c/k7m2x9`), role: platform admin (30)

**Purpose:** Parisar staff manage connect requests, register societies, features and billing. **Entry:** OTP login as 30. **Earlier evidence:** `admin-*.png`.

**Fields (Register Society):**
- Society name (required, 2 to 120 characters)
- Society type (select)
- Registration number (optional, unique per state)
- Registration date (date)
- Official email (email format)
- Official phone (landline allowed)
- Street address (required, at least 5 characters)
- Landmark
- Area or locality (required)
- City (required)
- State (required, select)
- PIN code (required, 6 digits)
- Country (required, default India)
- Authorities list (name 2 to 80 characters, 10-digit mobile starting 6 to 9, at least one, no duplicates)
- Feature toggles (from the catalogue)

| ID | Test | Steps | Expected |
|---|---|---|---|
| ADM-TC-01 | Overview metrics | Open console Overview | Total societies, active societies, pending requests, pending calls and total residents match `select` counts in the DB |
| ADM-TC-02 | Request search | Requests: search by society name, by mobile, by request code | Only matching rows; clearing restores all |
| ADM-TC-03 | Request filters and pagination | Filter by each status and by "submitted within"; page forward and back | Counts match the DB; page controls disable at the ends |
| ADM-TC-04 | View details | Open a request | Drawer shows contact, email, every authority number, slots, message and history |
| ADM-TC-05 | Call and Mark called | Click Call, then Mark called | `tel:` link opens; status becomes called and history gains an entry |
| ADM-TC-06 | Reschedule validation | Reschedule with a past date, then a valid future slot | Past date refused with a message; valid slot saved, status rescheduled |
| ADM-TC-07 | Reject | Reject with an empty reason, then with a reason; cancel once | Empty reason blocked; confirm dialog; status rejected; cancel changes nothing |
| ADM-TC-08 | Register prefill | Register Society from a request | Society name, contact and authority numbers prefilled from the request |
| ADM-TC-09 | Register validation | Submit with each required field empty; PIN 5 digits; bad email; duplicate authority mobile | Field-level errors; nothing saved |
| ADM-TC-10 | Register success | Fill valid data and submit | Result screen shows name, generated code, Copy button and registration status; request becomes registered |
| ADM-TC-11 | Code copy and uniqueness | Copy the code; register a second society | Clipboard holds the code; codes differ; `society_codes.code` unique in the DB |
| ADM-TC-12 | Feature toggles | Turn a feature off for a society, then sign in as its member | Sidebar item hidden; also try the route directly (known bug CORE-004: it still opens) |
| ADM-TC-13 | Double submit | Double-click Register | One society created |
| ADM-TC-14 | Sales role | Sign in as a sales user | Billing, payments, list prices and appoint buttons absent |

## B. Authority first login (`/login`, then `/verify`), role: authority

**Earlier evidence:** `login-authority-*.png`, `verify-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| AUTH-TC-01 | Authority toggle | On `/login` choose Society authority, enter 9000000027, Send OTP | OTP screen shows the number |
| AUTH-TC-02 | Unknown number | Authority toggle with a number not on any authority list | After OTP: no society offered, no society name revealed before OTP |
| AUTH-TC-03 | Wrong OTP | Enter 111111 | Error; can retry; lockout after the configured attempts |
| AUTH-TC-04 | Resend OTP | Click Resend before and after the timer | Disabled until the timer ends, then sends again |
| AUTH-TC-05 | Expired OTP | Wait past expiry (local config), then enter the code | Expired message |
| AUTH-TC-06 | Several societies | Authority listed in two societies | Picker lists both; choosing one opens that society |
| AUTH-TC-07 | Setup incomplete | Authority of a new society | Lands on `/setup` |
| AUTH-TC-08 | Setup complete, no flat | Authority who finished setup | Lands on personal onboarding (see CORE-003: `/dashboard` redirects there too) |
| AUTH-TC-09 | PIN set and use | Set a PIN, sign out, sign in with mobile and PIN | PIN login works; wrong PIN shows attempts left |

## C. Setup wizard (`/setup`), role: authority

**Fields:**
- Wing: name (required), code (required, unique in the society), floors (required, 1 or more)
- Floor: number (required), name, flat count (required)
- Flat: number (required, unique in the wing), type, area, bedrooms, parking slot, status (occupied, vacant, under construction, maintenance)

**Earlier evidence:** `setup-wizard-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| SET-TC-01 | Step 1 prefill | Open step 1 | Registration details shown read-only; message to contact Parisar to edit |
| SET-TC-02 | Wing required fields | Continue with an empty wing name, code or floors | Errors per field; cannot continue |
| SET-TC-03 | Duplicate wing code | Add two wings with code A | Second refused with a duplicate message |
| SET-TC-04 | Floors | Add floors; enter a negative or non-numeric floor number; a duplicate floor number | Invalid and duplicate refused |
| SET-TC-05 | Flat bulk generation | Generate flats for a floor with a flat count of 4 | 4 flats created with sequential numbers |
| SET-TC-06 | Flat count mismatch | Floor says 4 flats; delete one flat | Warning or count updates; record actual behaviour |
| SET-TC-07 | Duplicate flat | Two flats 101 in one wing | Refused |
| SET-TC-08 | Previous and Continue | Go forward to step 4 and back to step 1 | All entered data still present |
| SET-TC-09 | Save Draft and resume | Save Draft, sign out, sign in | Wizard reopens at the saved step with the data |
| SET-TC-10 | Skip optional | Skip step 5 | Allowed; Complete Setup enabled |
| SET-TC-11 | Complete with nothing | Try Complete Setup with no wing, floor or flat | Refused (at least one of each required) |
| SET-TC-12 | Complete | Complete with valid structure | Success; `societies.setup_completed_at` set; dashboard reachable |
| SET-TC-13 | Delete with confirmation | Delete a wing that has flats | Confirmation dialog; cascade behaviour as designed; cancel keeps it |

## D. Excel import (`/import`), role: authority

**Earlier evidence:** `import-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| IMP-TC-01 | Template | Download Template | .xlsx with columns Society Code, Wing, Floor, Flat, Full Name, Resident Type, Mobile, Email, Family Member, Relationship, Vehicle Number |
| IMP-TC-02 | Valid file | Upload 10 valid rows | Preview: 10 total, 10 valid, 0 errors |
| IMP-TC-03 | Wrong format | Upload .csv, .pdf, renamed .txt | Refused with a format message |
| IMP-TC-04 | Empty file | Upload the template with no rows | "No rows" message; nothing imported |
| IMP-TC-05 | Missing column | Delete the Mobile column | Refused, naming the missing column |
| IMP-TC-06 | Bad data | Rows with a 9-digit mobile, wrong society code, unknown wing, floor or flat, bad resident type | Each row flagged with its own error message |
| IMP-TC-07 | Duplicates | Same mobile twice in the file; a mobile already a member | Duplicate errors or warnings per row |
| IMP-TC-08 | Several residents per flat | 2 owners and a tenant on one flat | Accepted or warned per the rules; record behaviour |
| IMP-TC-09 | Formula injection | Cell `=HYPERLINK("http://x","y")` in a name | Error report cell is neutralised (starts with an apostrophe) |
| IMP-TC-10 | Error report | Download Error Report | .xlsx lists only invalid rows with messages |
| IMP-TC-11 | Import valid only | Import Valid Records | Only valid rows created as pending verification; DB count equals the valid count |
| IMP-TC-12 | Cancel | Cancel after preview | Nothing imported; batch marked cancelled |
| IMP-TC-13 | Large file | 1,500 rows | Completes or shows the row limit; UI stays responsive; record the time |

## E. Resident verification (`/verification`, `/verification/admin`)

**Earlier evidence:** `resident-verification-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| VER-TC-01 | Own record only | Imported resident logs in | Sees only their own imported details |
| VER-TC-02 | Everything correct | Click Everything Is Correct | Status verified; membership created once |
| VER-TC-03 | Edit details | Submit a correction | Status needs correction; admin sees the change |
| VER-TC-04 | Report incorrect | Report with a reason | Status rejected or flagged; admin notified in the list |
| VER-TC-05 | Admin counts and filters | Admin opens `/verification/admin` | Counts per status match the DB; filters work |
| VER-TC-06 | Admin approve or reject a correction | Decide a correction | Status updates; resident sees the result |
| VER-TC-07 | Re-submission | Rejected resident submits again | Allowed; history kept |

## F. Personal onboarding (`/onboarding`, `/onboarding/status`)

**Fields:**
- Society code (required)
- Wing, floor and flat dropdowns from the DB (required; no free text)
- Name
- Resident type: owner, tenant or family member
- Owner: primary or co-owner, owner since, membership number, proofs
- Tenant: move-in date (required), expected move-out, lease start and end (required), owner name and mobile, documents after registering
- PIN

**Not implemented** from the brief: middle name, profile photo, date of birth, gender, police verification as a separate field. Confirm the exact list against the form.

**Earlier evidence:** `onboarding-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| ONBD-TC-01 | Invalid society code | Enter a wrong code | Clear error; attempts throttled |
| ONBD-TC-02 | Dropdowns are DB-backed | Pick wing, then floor, then flat | Each list filtered by the previous choice; taken flats marked |
| ONBD-TC-03 | Owner journey | Complete as owner with proofs | Membership active or pending as designed; proofs listed |
| ONBD-TC-04 | Second owner | Another person registers as co-owner of the same flat | Allowed; both owners visible on the household page |
| ONBD-TC-05 | Tenant journey | Register as tenant with lease dates | Status page shows the chain: registered, owner, society, moved in |
| ONBD-TC-06 | Tenant date rules | Lease end before lease start; move-in empty | Refused with field errors |
| ONBD-TC-07 | Tenant documents | Upload a rental agreement (PDF), then a 15 MB file and an .exe | PDF accepted; others refused |
| ONBD-TC-08 | Back and forward | Go back from step 3 to step 1 and forward | Values kept |
| ONBD-TC-09 | Refresh mid-wizard | Refresh on step 2 | Resumes or restarts cleanly; no duplicate membership |

## G. Approvals (`/approvals`), roles: owner, authority

| ID | Test | Steps | Expected |
|---|---|---|---|
| APR-TC-01 | Owner approves tenant | Owner 17 approves a pending tenant of their flat | Step moves to society approval |
| APR-TC-02 | Owner rejects | Reject with a reason | Tenant sees rejected with the reason |
| APR-TC-03 | Society approves | Authority approves | Tenant becomes active; appears in `/residents/tenants` |
| APR-TC-04 | Self-approval | Tenant tries to approve their own request (API) | Refused (`CANNOT_DECIDE_OWN_REQUEST`) |
| APR-TC-05 | Household requests | Same-flat request appears to the owner with only the last 4 digits of the phone | No full phone shown |

## H. Same-flat household (`/household`) and family invite (`/invite/[token]`, `/join/invite/[token]`)

**Earlier evidence:** `household-*.png`, `invite-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| HH-TC-01 | Existing household found | New user picks a flat that has residents | "Are you already part of this household?" with masked names only |
| HH-TC-02 | Yes, continue | Answer Yes | Access request created; no access until approved |
| HH-TC-03 | No | Answer No | Offered another flat or asked to get an invite; nothing created |
| HH-TC-04 | Owner approves | Owner approves the request | User linked to the flat; one membership row; no duplicate resident |
| HH-TC-05 | Knowing the flat is not enough | Request access to a flat without approval | No data and no access |
| HH-TC-06 | Create invite | Owner adds a family member (relationship required) | Invite link shown with text saying nothing was sent automatically |
| HH-TC-07 | Accept invite | Invitee opens the link, signs in, accepts | Linked to the flat as family member; profile completion shown |
| HH-TC-08 | Invalid, used or expired token | Open a random token, a used one, one older than 14 days | Clear invalid message; nothing revealed |
| HH-TC-09 | Wrong phone | Invite bound to phone A, opened by phone B | Refused |

## I. Residents lists (`/residents/owners|tenants|family`), role: authority

| ID | Test | Steps | Expected |
|---|---|---|---|
| RES-TC-01 | Lists and counts | Open each tab | Counts equal the DB; search and status filter work |
| RES-TC-02 | Unknown slug | `/residents/unknown` | 404 page |
| RES-TC-03 | Pagination | More than one page of residents | Pages correctly |

## J. Staff (`/staff/manage`, `/staff/manage/new`, `/staff/manage/[id]`, `/staff`)

**Fields:**
- First name (required), last name
- Mobile (required)
- Email
- Staff type (required): security, plumber, electrician, cleaner, gardener, maintenance staff or other
- Joining date
- Employee ID
- Vendor
- Shift
- Emergency contact
- ID proof

**Earlier evidence:** `staff-*.png`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| STF-TC-01 | Create validation | Save with no name, bad mobile, no type | Field errors |
| STF-TC-02 | Create | Save valid staff | Appears in the list; filter by type works |
| STF-TC-03 | Edit | Change shift | Saved and shown |
| STF-TC-04 | ID proof | Upload a JPG, remove it with confirmation | Uploaded, then removed |
| STF-TC-05 | Resident view | Owner opens `/staff` | Directory only, no edit controls, no private details |
| STF-TC-06 | No login | Try to log in with a staff mobile | Not a resident or guard; no access |

## K. Core modules not executed screen-by-screen

These routes loaded at both 375 and 1280 px with no overflow in the route smoke test (CORE-TC-002 to 016), except `/notices` and `/polls`, which returned HTTP 500 (CORE-001, CORE-002). Their create, update and delete actions were not run in the browser in this pass. Notices, polls, bookings, visitors and SOS were tested at the API level (`PARISAR_API_DATABASE_TESTING.md`).

| ID | Screen | Test | Expected |
|---|---|---|---|
| NOT-TC-01 | Notices `/notices/new` | Post a notice with a title, body and attachment as authority | Appears in the list for all members; attributed with name and flat |
| NOT-TC-02 | Notices `/notices/[id]` | Member opens it | Read-only; attachment downloads |
| POL-TC-01 | Polls `/polls` | Authority creates a poll; two members vote; close it | One vote per member; results are an aggregate only; closed poll refuses votes |
| BKG-TC-01 | Bookings `/bookings/new` | Request an amenity slot; approver approves; request the same slot again | Overlap refused (`slot_taken`) |
| FAC-TC-01 | Facility calendar `/facilities` | Add and delete an event | Shown on the calendar; delete asks for confirmation |
| COM-TC-01 | Community `/community` | Post, comment, report a post; moderator takes it down and restores it | Each state visible to the right people |
| FLA-TC-01 | Flat actions `/flat-actions/new` | Issue a warning and a fine to a flat; resident acknowledges | Resident sees it; fine is recorded only (no payment) |
| VIS-TC-01 | Visitors `/visitors` | Guard logs a visitor; resident approves or denies | Status updates for both; note API-002, where other flats can read the log |
| GRD-TC-01 | Guard console `/c/g8s4muv` | Guard: New visitor, flat picker, large buttons on a tablet | Simple flow; 44 px or larger targets |
| SOS-TC-01 | SOS (header button) | Raise an SOS for each audience; resolve it | Right audience notified; note API-003, where a guard cannot resolve guard-addressed SOS |
| DIR-TC-01 | Directory `/dashboard/directory` | Search members; open one; reveal a phone | Phone hidden until the audited reveal; reveal logged |
| RQ-TC-01 | Review queue `/dashboard/review-queue` | Approve and reject pending joins | Membership activated or rejected |
| CODE-TC-01 | Code rotation `/dashboard/code-rotation` | Rotate the code; join with the old code | Old code refused, new code works |
| RT-TC-01 | Role transfer `/dashboard/role-transfer` | Secretary transfers to a member with typed confirmation | Roles swap; old secretary loses manager menus |
| SET-N-01 | Notification settings | Change toggles and the daily cap | Saved; cap 0 refused |
| GO-TC-01 | Grievance officer | Set the officer | Shown to residents |
| PRO-TC-01 | Profile and language | Change the language to Hindi and Marathi; log out | UI translated; logout ends the session and back navigation does not show protected data |
