# Parisar — Full Code Review

**Date:** 2026-10-11 · **Scope:** whole repo at `450309b` (web, mobile, shared packages, 53 migrations, edge functions, tests) · **Method:** 7 parallel area reviewers (read-only), top findings re-verified by hand (marked ✅).

## Verdict: BLOCK — do not deploy to a real Supabase project yet

There are four account-takeover / privilege-escalation paths and one bug that breaks every upload on the phone. Most of the rest is fixable in normal feature work.

| Severity | Count (deduplicated) |
|---|---|
| CRITICAL | 5 |
| HIGH | 22 |
| MEDIUM | ~35 |
| LOW | ~25 |

---

## CRITICAL — fix before any non-local deploy

### C1. Any member can make themselves secretary, or take a whole society offline ✅
`supabase/migrations/20260430000003_rls_policies.sql:20-87`
The policies `tenant_all_memberships`, `tenant_all_family_members`, `tenant_all_flats`, `tenant_all_wings`, `tenant_all_society_codes` and `tenant_update_societies` are `FOR ALL`/`UPDATE` and check only `society_id = current_society_id()`. No later migration revokes them or adds column grants.
- `update society_memberships set role='secretary' where user_id=auth.uid()` gives a member every secretary power after their next token refresh.
- `update societies set service_status='blocked'` locks out the whole society.
- Inserting into `family_members` with any `membership_id`, then calling `claim_family_membership`, gives the caller active membership of any flat. That includes flats in another society.

**Fix:** make these tables SELECT-only for `authenticated` (`revoke insert, update, delete`) and route all writes through the existing SECURITY DEFINER RPCs.

### C2. Unauthenticated PIN overwrite lets anyone take over any account (web) ✅
`apps/web/app/actions/codeLogin.js:239` `setPin(userId, phoneE164, pin)`
This is a public server action. It trusts the `userId` and phone sent by the client, then calls `auth.admin.updateUserById` with the service-role key. It never checks who is calling. Anyone who knows a user's UUID and phone can set that user's PIN and sign in with no OTP. UUIDs are not secret: they appear in membership and attribution data.

**Fix:** inside the action, call `createSupabaseServerClient().auth.getUser()`. Ignore the `userId` argument and take the phone from `user.phone`.

### C3. `dev_peek_otp` returns any phone's live OTP to anonymous callers ✅
`supabase/migrations/20260721000033_dev_sms_onscreen.sql:62-74`
The function is SECURITY DEFINER with `grant execute … to anon, authenticated`. It is part of the normal migration chain, so `db push` sends it to production. Migration 052 revoked access to the table but left the function callable. `supabase/config.toml` also routes the SMS hook to `dev_send_sms` and sets `test_otp = 123456` for about 30 numbers.

**Fix:** move the dev-OTP objects out of `migrations/` (seed or local-only), or guard them by environment. Split `config.toml` into a base file and a local override. Add a CI grep that fails the build if `dev_peek_otp`, `dev_send_sms` or `test_otp` would reach a deploy.

### C4. Service-only functions and a view leak data across all societies
- `eligible_push_recipients` (`20260528000008:768-823`) and `flat_action_recipients` (`20260529000009:968-1025`) are SECURITY DEFINER with no auth check. EXECUTE was never revoked from `public`, so any member can fetch every member's Expo push token.
- The view `notification_preferences_effective` (`20260528000008:327-342`) is not `security_invoker`. It returns every `(user_id, society_id)` pair on the platform.

**Fix:** `revoke execute … from public, anon, authenticated` on every function meant only for the service role. On the view, set `security_invoker=true` and revoke access.

### C5. Every photo and PDF upload fails on the mobile app ✅
`packages/api-client/src/complaints.js:383`, `notifications.js:333`, `flat-actions.js:289`, `apps/mobile/components/complaints/PhotoPicker.jsx`, `community/PostComposer.jsx`
These files call `FileSystem.readAsStringAsync` from the root `expo-file-system` import. In the installed version (55.0.22) that function throws `errorOnLegacyMethodUse`. Complaint photos, community photos, notice attachments and fine PDFs all fail with a generic error.

**Fix:** import from `expo-file-system/legacy`, or switch to `new File(uri).arrayBuffer()`.

---

## HIGH

### Security / auth
1. **Fan-out edge functions trust a fixed header.** `supabase/functions/*-fanout/index.js` and `20260701000011:55-113` accept `x-push-trigger: true` with `verify_jwt=false`. Anyone can forge "complaint resolved" pushes or replay notices. `booking-ack-fanout` also trusts `record.requester_id` from the request body. **Fix:** require a random shared secret (constant-time compare) and re-read the row by id.
2. **The PIN works as a full password.** `pin-secret.js` turns the PIN into `pk1.<phone>.<4-digit PIN>`, so there are only 10,000 possibilities per phone number. The "OTP then PIN" gate exists only on the client (`verify/page.jsx`, `pin.jsx`). **Fix:** lock accounts after failed attempts on the server, or stop using the PIN as the password.
3. **Shared society code doubles as a login secret.** Per `20260721000018_pin_credential.sql`, anyone with the code and the phone of someone who has no PIN yet can sign in as them. That includes authorities, whose phones `get_grievance_officer` exposes.
4. **Removed or demoted secretaries get their role back.** `claim_society_authority` and `onboard_resident` (`…048`, `…052`) re-grant secretary from `society_authorities`, which is never cleaned up. `onboard_resident`'s `on conflict … status=excluded.status` also lets removed members rejoin themselves.
5. **Privileged RPCs check only the role in the JWT.** Removed or transferred users keep their powers for up to an hour. **Fix:** re-check `society_memberships` inside privileged RPCs.
6. **`profiles.phone` can be set by its owner to any number.** Someone can claim a chairman's number first, which blocks the chairman's onboarding. **Fix:** revoke column INSERT/UPDATE.
7. **Society-code checks have no rate limit.** `lookupPhone` and `startCodeClaim` (`codeLogin.js:56,177`) are unauthenticated and unthrottled. `lookupPhone` reveals whether a number is staff, guard or resident. `startCodeClaim` is dead code that confirms whether a join code is valid. `onboard_resident` has no rate limit either. The legacy `redeem_society_code` limiter lets anyone pause a valid code for everyone.
8. **Legacy `create_society_with_secretary` and `redeem_society_code` are still granted.** Any user can create societies, which bypasses staff-only creation.
9. **`moderate-image` never checks that the caller belongs to `societyId`.** It also does not reject `..` in storage keys (`moderate-image/index.js:78-131`).
10. **Direct `complaints` and `attachments` INSERT is still allowed.** It bypasses RPC validation (`…007:139-181`). Attachment and storage reads are visible society-wide, so members can read other members' private complaint photos.

### Functional — the core loop is broken in places
11. **Web board members can't respond to complaints, and secretaries can't post notices.** `notifications.js:28`, `complaints/[id]/page.jsx:28`, `notices/[id]/page.jsx:31` and `directory/[id]/page.jsx:72` read `user.app_metadata.role`, but `getUser()` never carries that claim. Everyone falls back to `"member"`. **Fix:** use `resolveActiveSociety(...).role`.
12. **Complaint detail is not live (web).** It subscribes only to response INSERTs and never to `complaints` UPDATEs, so the reporter sees a stale status.
13. **New realtime items show "—" for names.** Raw `payload.new` rows are rendered without their joins, so complaints, responses, posts, comments and bookings appear as "Posted by — (—)". That undermines the attributed status trail the product promises.
14. **Mobile code-rotation screen always errors.** It filters `.eq("active", true)`, but the column doesn't exist; use `revoked_at IS NULL` ✅ (`code-rotation.jsx:84`).
15. **Mobile role transfer has no typed-name safeguard.** The profile lookup uses `.eq("id", …)` instead of `user_id` ✅ (`role-transfer.jsx:139`), so the confirm text is `""` and one tap hands over the secretary role.
16. **Mobile push tokens are not re-registered after sign-out → sign-in.** See `_layout.jsx:102`. The tap handler for a cold-start notification is also missing, and `data.screen` is pushed without validation.
17. **Android push is not configured.** `google-services.json` and `android.googleServicesFile` are missing from `app.config.js`.
18. **Board approval queue gets cut off.** `listBookings` sorts by `status` text and limits to 30 (`bookings.js:80`), so pending requests drop out once there are 30 or more approved bookings.
19. **Mobile review-queue approve ignores errors** (`review-queue.jsx:212`). It can remove both claimants and leave the flat empty.
20. **Mobile user context caches `role:"member"` on any fetch error** (`use-my-context.js`), so secretaries lose management UI on a flaky network.
21. **Double-submits.** Booking, community post and setup board/amenity forms re-enable before redirecting and have no idempotency key, so a second tap creates duplicates.
22. **Fixed realtime channel names** in VisitorInbox, GuardClient, SosAlerts, FacilityCalendar, StaffDirectory, HighlightsStrip and dashboard-realtime. On remount they can throw "callbacks after subscribe()". Use `uniqueChannelName`.

### Tooling
- **CI typecheck job always fails.** It runs `turbo run typecheck`, but `turbo.json` has no such task and the script is `tsc` in a JS-only project.

---

## MEDIUM (grouped)

- **Society switcher is a no-op** on web and mobile. Web picks the active society three different ways (`layout.jsx` `memberships[0]`, an unordered `activeSociety.js`, `callerRole.js`), so the sidebar can disagree with the society that RLS is actually serving.
- **Unguarded web pages:** `/dashboard/role-transfer`, `/review-queue` and `/code-rotation` have no server role gate. Members can view the live code and the review queue.
- **Session stores survive sign-out:** the dashboard summary stores are never `reset()` on either platform, so the next user sees the previous user's counts.
- **Broken share links.** Code-rotation links point to `https://parisar.app/join?code=` (web, but the real route is `/join/code`) and `parisar://join` (mobile, no route).
- **Timezones:** booking validation and display use the device timezone instead of IST (web `BookingForm.jsx`, mobile `TimeSlotPicker.jsx`). `AmenitiesSection.jsx:222` uses `toISOString()`, which saves dates one day early for picks made after midnight IST. `fine-overdue.js` has the same local-time problem.
- **Hindi and Marathi gaps:**
  - Many user-facing strings are hard-coded English (list in the reviewer notes: booking, complaint, community, flat-action, setup, join, code-rotation, review-queue and error pages).
  - date-fns is never given a `locale`.
  - The Noto Sans Devanagari font is bundled but never applied on mobile.
  - Fixed-height inputs clip Devanagari text.
  - `GuardClient.jsx:138` uses `t("logout")` where the key is `auth.logout`.
- **Silent failures:** these drop the `{error}` return value or have no try/catch:
  - SOS resolve
  - amenity, facility and staff delete (no confirmation either)
  - visitor approve/deny
  - preferences toggle (side effect inside a `setState` updater)
  - `fetchJoinPercent`
  - `updateNotificationPreference`
  - `refreshSession` after a role change (only logs a warning)
- **DB logic:**
  - `request_booking` accepts NULL times, which creates an unbounded range that blocks the amenity.
  - `add_facility_event` fails when the note is empty.
  - `resident_decide_visit` has a race where the last writer wins.
  - `report_content` lets one report hide any post.
  - SOS and visitor requests have no rate limit.
  - `claim_guard` overwrites existing profile names.
- **Polls:** a closed poll still shows the Vote button until a vote fails, because nothing subscribes to the poll's status.
- **Non-idempotent multi-step flows:** onboarding, then PIN; join, then a `family_members` insert; review-queue approve/remove loops.
- **Unread complaint badge is a stub:** `fetchUnreadComplaintCount` always returns 0 and `markNoticeRead` is a no-op.
- **Files over the 800-line limit:** `admin/AdminConsole.jsx` (1344) and `admin/SocietyDetail.jsx` (853).

## LOW (selected)
- Phone numbers logged in plain text (`send-sms/adapters/stub.js:9`).
- Raw GoTrue and PostgREST error messages shown to users.
- Open redirect in the dev-only `/dev-login`.
- Middleware refreshes the session only and does not deny access by default.
- `setTimeout` redirects never cleared on unmount.
- Components defined inside render (`CodePill`, FacilityCalendar `Row`).
- Next 15 `params`/`searchParams` read synchronously.
- Deprecated `shouldShowAlert`.
- `router.back()` called without a `canGoBack()` check (41 places).
- Cursor pagination on `created_at` alone.
- Duplicate `cryptoRandomUUID`.
- Wrong comment on a ui-token value.
- Dead test files.

---

## Tests — coverage gaps
- **Core loop:** "member is notified" is never asserted. `complaints.test.js:444` "trigger fires" checks only that the response row exists. Status-change realtime (UPDATE) is untested. No UI test covers file complaint → board responds → member sees status.
- **Isolation:** only SELECT and realtime INSERT are tested across societies. There are no negative tests calling SECURITY DEFINER RPCs (`claim_complaint`, `approve_booking`, `waive_fine`, `vote_on_poll`, …) with another society's ids, and no direct-DML escalation tests. Those tests would have caught C1. `TENANT_TABLES` covers only 5 tables.
- **Tests that can't fail:** `dashboard-summary.test.js:375` ends in `expect(true).toBe(true)`. `complaint-unread.test.js` asserts the stub returns 0.
- **i18n mocks:** the mocks return English or the raw key, so no component test can catch a missing hi/mr key.
- **E2E:** only 2 Maestro flows, not run in CI, and no Playwright tests at all.

## What's in good shape
- No secrets committed, and the service-role key never reaches a client bundle.
- The `send-sms` hook verifies its signature and fails closed.
- No `dangerouslySetInnerHTML`, and external links are safe.
- Server code uses `getUser()`, not `getSession()`.
- The amenity double-booking exclusion constraint, poll vote uniqueness and own-row `poll_votes` are correct.
- The realtime publication only includes tables that have RLS.
- en, hi and mr locale files have matching keys and interpolation variables.
- Mobile images are compressed (1600px, JPEG 0.7) before upload.

## Suggested fix order
1. C1 + C4 + HIGH 6/8/10 in a single "lock down direct DML and grants" migration, plus negative RLS/RPC tests.
2. C2 and HIGH 2/7: harden the web auth actions and add a server-side PIN lockout.
3. C3: separate dev OTP objects and config from anything that deploys.
4. C5, HIGH 14 and HIGH 15: small mobile fixes that unblock testing on the phone.
5. HIGH 11, 12 and 13: restore the web core loop (role resolution, live status, attributed realtime rows).
6. Fan-out shared secret, push registration and FCM config.
