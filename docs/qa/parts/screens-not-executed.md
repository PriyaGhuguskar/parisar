# Screens not executed in this pass

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
