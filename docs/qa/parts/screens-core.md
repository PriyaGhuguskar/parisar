# Core modules: screens and test cases (area `core`)

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
