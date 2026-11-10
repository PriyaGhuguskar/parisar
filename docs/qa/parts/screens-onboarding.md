# Onboarding and Public Website: Screen Tests

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

