# Parisar Security Testing (area: secperf)

Date: 10 November 2026. Tester: security-perf agent. Environment: local only. Web `next dev` at http://localhost:3000 (DEV mode, `ENABLE_DEV_ROUTES=1`), Supabase local at http://127.0.0.1:54321, Postgres container `supabase_db_parisar`. Branch `feat/saas-onboarding`.

Authorisation: the owner authorised this testing of their own local environment. Only safe, non-destructive techniques were used. No application code, migrations or config were changed. Write tests against the DB were done only inside `begin; ... rollback;`.

Accounts used: 9000000009 (own number, no membership = "outsider"), 9000000017 (owner, QA Sunrise Heights, read only), 9000000019 (tenant, read only). Sessions were obtained with `POST /auth/v1/otp` + `POST /auth/v1/verify` (dev OTP 123456). No PIN was set or changed on any account.

Evidence: raw command output is in `docs/qa/evidence/secperf/`. Keys and tokens were never printed.

Status legend: Pass, Fail (finding raised), Blocked, Not Tested.

## Summary of findings

| ID | Severity | Title |
|---|---|---|
| SEC-001 | High | Dev server listens on all interfaces with `/dev-login` on; anyone on the LAN/ZeroTier can sign in as any test number, including platform admin 9000000030. Postgres (54322) and Supabase API (54321) also bound to 0.0.0.0 |
| SEC-002 | Critical (release blocker) | Dev backdoors still present: `test_otp` 123456 for 30 numbers, `dev_send_sms` hook that shows OTPs on screen, DevOtpHint, `/dev-login`, `/dev-preview`, dev PIN pepper fallback. Gated by NODE_ENV today; must be removed before any deploy |
| SEC-003 | Medium | PIN is not enforced server-side: an OTP-only session of a user who has a PIN (`pin_set = true`) has full API access |
| SEC-004 | Medium | Legacy PIN credential `pk1.<phone>.<pin>` is computable by anyone; legacy fallback is on by default, so non-upgraded accounts can be brute-forced directly against GoTrue's password grant, bypassing the app's PIN lockout |
| SEC-005 | Low | PIN per-IP throttle uses the client-supplied `X-Forwarded-For` (forgeable); per-phone lock still applies |
| SEC-006 | Low | `anon` role holds table privileges (SELECT, and on many tables INSERT/UPDATE/DELETE) on 33 public tables; only RLS stands in the way |
| SEC-007 | Low | Auth cookie is not HttpOnly, lives 400 days, and the CSP allows `'unsafe-inline'` scripts, so any XSS would steal the session |
| SEC-008 | Low | Middleware treats any path ending in `.<ext>` as public (`STATIC_FILE_RE`); protected pages still redirect at layout level, so nothing leaked, but the guard depends on every layout re-checking |
| SEC-009 | Low | `society_accepts_joins(uuid)` (SECURITY DEFINER, no auth check) tells any signed-in user whether a society id exists and is not blocked |

Details follow per test case. Further sections are appended as testing continues.

## 1. Authentication

### SEC-TC-01 OTP login for a test number works without SMS
- Preconditions: number listed in `supabase/config.toml [auth.sms.test_otp]`.
- Steps: `POST /auth/v1/otp {"phone":"+919000000017"}`, then `POST /auth/v1/verify {"type":"sms","phone":...,"token":"123456"}`.
- Expected (dev): 200 and a session. Expected (prod): this must be impossible.
- Actual: otp 200, verify 200, access token + refresh token returned for 9000000009, 9000000017, 9000000019.
- Status: Pass (dev behaviour confirmed) — raises SEC-002 for production.
- Evidence: `docs/qa/evidence/secperf/auth-login.txt`

### SEC-TC-02 PIN enforced on the API for a PIN-holding user
- Preconditions: 9000000017 has `profiles.pin_set = true` (checked with read-only SQL).
- Steps: Obtain an OTP-only session (no PIN step). Call `POST /rest/v1/rpc/resident_dashboard` and `GET /rest/v1/society_memberships`.
- Expected: if PIN is a second factor, the OTP-only token should be limited until the PIN is entered.
- Actual: both calls return 200 with full data (flat A Wing-101, society, household counts, membership list). JWT `amr` = `[{"method":"otp"}]`.
- Status: Fail → SEC-003.
- Evidence: `docs/qa/evidence/secperf/pin-bypass.txt`

### SEC-TC-03 PIN storage
- Steps: code review of `apps/web/lib/auth/pinCore.js`, `pinSecret.js`, `app/actions/codeLogin.js`.
- Expected: PIN never stored in plaintext; offline guessing not possible.
- Actual: PIN credential is `pk2.` + base64url(HMAC-SHA256(PIN_PEPPER, "91<phone>:<pin>")), stored as the GoTrue password (bcrypt). Pepper required (>= 32 chars) outside dev, fails closed. Weak PINs (1234, four identical) refused. BUT legacy `pk1.<phone>.<pin>` is still accepted (`allowLegacy !== false`).
- Status: Fail (legacy path) → SEC-004. Peppered scheme itself: Pass.

### SEC-TC-04 PIN attempt throttling
- Steps: code review of `runPinLogin`.
- Expected: lockout per phone and per IP.
- Actual: 5 failures / 15 min per phone → 15 min lock; 30 / 15 min per IP. IP taken from the first `X-Forwarded-For` value (`clientIpFrom`), which a client can forge if the app is not behind a proxy that overwrites it. Not executed live: running 5 wrong PINs would lock a shared test account and GoTrue's `sign_in_sign_ups = 10 / 5 min` is per IP for all testers on 127.0.0.1.
- Status: Fail → SEC-005 (per-phone lock is correct by code review; per-IP key forgeable). Live lockout run not executed (reason above).

### SEC-TC-05 OTP throttling configuration
- Steps: read `supabase/config.toml [auth.rate_limit]` and `[auth.sms]`.
- Actual: `sms_sent = 30/h`, `sign_in_sign_ups = 10 / 5 min / IP`, `token_verifications = 30 / 5 min / IP`, SMS `max_frequency = 60s` per phone (send-sms hook `5s`). Edge function per-phone limit via `otp_requests` table.
- Status: Pass (config). Live burst test: Not Tested (would exhaust the shared per-IP bucket for other testers; OTP sending excluded from load by brief).

## 2. Dev-only backdoors and exposure

### SEC-TC-06 Dev routes reachable
- Steps: `curl -I /dev-login?as=9000000009&next=//evil.com`, `curl /dev-preview`, `curl /dashboard` signed out.
- Actual: `/dev-login` 307 → `/dashboard` with a new `sb-127-auth-token` cookie; `/dev-preview` 200; signed-out `/dashboard` 307 → `/dev-login?next=%2Fdashboard`, i.e. every signed-out visitor is auto-signed in as the default persona.
- Status: Fail (expected for dev, but must not ship) → SEC-002.

### SEC-TC-07 Network exposure of the dev stack
- Steps: `ss -ltnp`; `curl http://192.168.31.172:3000/dev-login?as=9000000009` (LAN address); `curl http://192.168.31.172:54321/rest/v1/`; TCP connect to 192.168.31.172:54322.
- Actual: next-server listens on `*:3000`; Supabase 54321 and Postgres 54322 on `0.0.0.0`. Over the Wi-Fi address, `/dev-login` returned 307 and a session cookie; 54321 returned 200; 54322 accepted a TCP connection. The laptop is also on ZeroTier (10.0.0.31). `/dev-login?as=9000000030` would give anyone on those networks the platform admin console (not executed for 30; executed for own number 09).
- Status: Fail → SEC-001.

### SEC-TC-08 Dev backdoor inventory (code)
- Found: `supabase/config.toml [auth.sms.test_otp]` (30 numbers → 123456) and `[auth.hook.send_sms]` → `public.dev_send_sms` (migration `20260721000033_dev_sms_onscreen.sql`); `components/auth/DevOtpHint.jsx` (used by `VerifyShell.jsx`, login page); `app/dev-login/route.js`; `app/dev-preview/page.jsx`; dev auto-sign-in branch in `app/(protected)/layout.jsx` and `lib/supabase/middleware.js`; `DEV_PIN_PEPPER` constant in `lib/auth/pinCore.js`; `FANOUT_WEBHOOK_SECRET` public dev value in config.toml. Mitigations already present: `devRoutesEnabled()` needs NODE_ENV=development AND ENABLE_DEV_ROUTES=1; `scripts/check-no-dev-otp.mjs` CI check; `supabase/DEPLOY.md`.
- Status: Fail (release blocker) → SEC-002.

## 3. Session handling

### SEC-TC-09 JWT lifetime and refresh
- Actual: access token `exp - iat = 3600 s` (decoded, not printed); refresh token issued; `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`. Custom access-token hook adds `app_metadata.society_id` and `role`.
- Status: Pass.

### SEC-TC-10 Auth cookie attributes
- Actual (dev): `sb-127-auth-token`, `Path=/`, `SameSite=lax`, `Max-Age=34560000` (400 days), no `HttpOnly`, no `Secure` (Secure is set only in production by `cookieOptions.js`). HttpOnly deliberately off (documented) because the browser client reads it.
- Status: Fail (Low) → SEC-007.

## 4. Redirects and direct URL access

### SEC-TC-11 Open redirect via `next=`
- Steps: `/dev-login?as=9000000009&next=<v>` for `//evil.com`, `/%5Cevil.com`, `%2F%2Fevil.com`, `/%09/evil.com`, `https://evil.com`, `/%2F%2Fevil.com`, `/..//evil.com`. Login and verify pages use the same `safeNextPath`.
- Actual: all fall back to `http://localhost:3000/dashboard` except `/..//evil.com` → `http://localhost:3000//evil.com` (absolute, same origin, safe).
- Status: Pass.

### SEC-TC-12 Signed-out direct access to protected routes
- Steps: curl signed out: `/dashboard /household /approvals /import /setup /verification/admin /c/test /guard /society-dashboard`.
- Actual: all 307 to the sign-in route (in dev: `/dev-login`).
- Status: Pass.

### SEC-TC-13 Middleware static-extension bypass
- Steps: signed out: `/staff/manage/abc.js`, `/residents/owners.json`, `/residents/x.css`, `/c/abc.json`, `/join/invite/abc.js`.
- Actual: middleware lets them through (`STATIC_FILE_RE`), but each page/layout redirects (`NEXT_REDIRECT;replace;/dev-login?next=/dashboard;307`, `/c/abc.json` → `/login`). Grep of bodies found no society names or phone numbers.
- Status: Pass (no leak) with SEC-008 raised as hardening.

## 5. Web security headers

### SEC-TC-14 Headers on `/`
- Actual: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic, geo, payment, usb off), COOP same-origin, CORP same-site, CSP with `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; `X-Powered-By` absent. Dev CSP adds `'unsafe-eval'`, `ws: wss:`. HSTS absent in dev by design (`next.config.js` adds it in production only; not verifiable without a production build, which the brief forbids).
- Status: Pass (dev). HSTS: Not Tested (needs production build). `'unsafe-inline'` noted in SEC-007.

## 6. Database: SECURITY DEFINER functions and grants

### SEC-TC-15 SECURITY DEFINER functions without `search_path`
- Steps: read-only SQL over `pg_proc` (public schema, `prosecdef`, `proconfig`).
- Actual: 208 SECURITY DEFINER functions in `public`, 43 in `app_private`; 0 in `public` without a pinned `search_path`.
- Status: Pass.

### SEC-TC-16 SECURITY DEFINER functions executable by `anon`
- Actual: only `submit_connect_request(...)` and `get_connect_request_status(text, text)` — matches API.md.
- Status: Pass.

### SEC-TC-17 SECURITY DEFINER functions with no visible caller check
- Steps: functions executable by `authenticated` whose body has no `auth.uid`/`jwt`/role-helper reference.
- Actual: `family_invite_preview(p_token)` (token is the credential, OK), `guard_list_flats()` (uses `current_guard_society_id()`, raises NOT_GUARD, OK), `society_accepts_joins(p_society_id)` (no check; returns whether the society exists and is not blocked).
- Status: Fail (Low) → SEC-009.

### SEC-TC-18 RLS enabled on every public table
- Actual: 0 public tables without RLS.
- Status: Pass.

### SEC-TC-19 Anon table grants and anon reads
- Steps: list `role_table_grants` for anon; `GET /rest/v1/<table>?limit=1` as anon for all 35 tables.
- Actual: anon has grants on 33 tables (write grants on bookings, facility_events, flat_actions, moderation_events, notification_preferences, notifications, platform_features, poll_options, poll_votes, polls, post_comments, posts, reports, society_features, society_highlights, society_staff, sos_alerts, visitor_requests). Every anon read returned `[]`; `profiles` and `society_enrollment_requests` return 401 permission denied.
- Status: Pass (no data exposed) with SEC-006 raised as defence in depth.

### SEC-TC-20 `profiles` (phones) not readable through PostgREST
- Steps: as member 9000000017, `GET /rest/v1/profiles?select=full_name,phone`.
- Actual: 403 `permission denied for table profiles`.
- Status: Pass.

## 7. Coverage status and tests still to run

The session ended before these checks ran in this file. Where another tester covered a topic, the evidence is linked. Everything else is **Not Tested** and must run before release.

| Topic | Status | Evidence or steps to run |
|---|---|---|
| IDOR and cross-society access | **Pass** (API tester) | 38 isolation checks in `PARISAR_API_DATABASE_TESTING.md` (area `iso`): a user of society A gets nothing from society B through tables and RPCs. Browser: CORE-TC-032 (another flat's complaint by URL shows "not found"). Found: API-002, where residents read every flat's visitor log in their own society |
| File upload validation | **Partially tested** | CORE-TC-019 Pass (non-image refused); CORE-TC-020 Fail (corrupt 6 MB "image" accepted, CORE-007). Proof bucket (`parisar-proofs`) not tested: upload .exe renamed .pdf, a 15 MB file, and a path with `../` as a tenant; expect refusal |
| Stored XSS | Not Tested | Put `<img src=x onerror=alert(1)>` and `"><script>alert(1)</script>` in a complaint description, a notice title, a community post, a profile name, a connect-request message and an Excel name cell. View each as another user. Expect the text shown literally and no script run |
| Reflected XSS | Not Tested | Open `/login?next=javascript:alert(1)`, `/connect/success?code=<script>`, `/import?x="><svg onload=alert(1)>`. Expect no execution |
| SQL injection | Not Tested | Send `' or 1=1--`, `%' union select` and `;drop` in RPC text parameters (society code, search fields) and PostgREST filters (`?name=eq.x'or'1'='1`). Expect validation errors, never extra rows or SQL errors |
| CSRF on server actions | Not Tested | From a page on another origin, POST to the set-language and preference server actions with the victim's cookie. Expect Next.js origin checks to refuse |
| CORS | Not Tested | `curl -I -H 'Origin: https://evil.example' <api>/rest/v1/` and against the web app. Record `Access-Control-Allow-Origin`; production must not reflect arbitrary origins with credentials |
| Public rate limits | Not Tested here | Submit the connect form and the status lookup 20 times quickly from one IP. Expect `RATE_LIMITED` after the documented limit. OTP send limits are a GoTrue setting: check `supabase/config.toml` and the production dashboard |
| Source maps and public env | Not Tested | Production build: confirm no `.map` files are served and only `NEXT_PUBLIC_SUPABASE_URL` and the anon key are exposed |
| Error message leakage | Not Tested | Trigger server errors (for example CORE-001, `/notices` HTTP 500) and confirm no stack trace or SQL reaches the browser in a production build |
| Logout invalidation | Not Tested | Log out, then reuse the old access token against the API before it expires. Record whether it still works (Supabase JWTs stay valid until expiry unless sessions are revoked) |
