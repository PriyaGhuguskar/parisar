# Parisar — Manual QA / Release Audit Report

**Method:** Whole-repo, audit-only, 8-agent parallel deep audit (source-level), grounded in file:line evidence. Automated suite executed for real pass/fail signal. Headline blockers independently re-verified against source.
**Environment:** Local dev — Supabase local stack running (:54321), Next.js web + Expo mobile, JavaScript (no TS).
**Surface:** `apps/web`, `apps/mobile`, `packages/*`, `supabase/` (10 migrations, 6 edge functions).
**Date:** 2026-07-01.

> ⚠️ **Credibility note on the test suite:** all **718 automated tests pass (0 failed)** — but this is **misleading**. The most defect-dense UI (community, polls, bookings, flat-actions, setup, join, directory) has **zero component test coverage**, which is exactly why multiple **render-crashing blockers** ship green. Passing CI here does *not* mean the screens load.

---

## Executive Verdict

**🔴 NOT READY FOR RELEASE.** The core promise — *Member files complaint → Board responds → status updates → member notified* — is wired but broken end-to-end in production: complaint push notifications point at a hardcoded `host.docker.internal` URL (dead outside local Docker), the mobile "notified" signals are stubs, and several primary screens throw `ReferenceError` on load. Plus two confirmed data-privacy breaches (unaudited phone exposure; poll-vote secrecy).

---

## BLOCKERS (must fix before any release)

> **Remediation status — 2026-07-01 (batch 1: "fastest path to a testable build"):**
> **PAR-001, PAR-002, PAR-003, PAR-008, PAR-009 are FIXED and verified** (web build green, 302 mobile + web/api-client/i18n tests green). Details:
> - **PAR-001** — moved every module-scope `t()` table inside its component; gave all nested sub-components (PollBlock `PreVoteView`/`ResultsView`; CommunityFeedClient `PostCard`/`EmptyState`/`ErrorState`; NoticeListClient `NoticeCard`/`AttachmentPill`/`EmptyState`/`ErrorState`; PreferencesClient `SavedFlash`; BookingListClient `BookingStatusBadge`) their own `useTranslation`; fixed the `t("key.replace")(…)` anti-pattern at **all 12 sites** across 9 files (incl. setup `WingsForm`/`FlatsForm`). `StatusBadge`/`ResponseTrailItem` were false positives (they take `t` as a param). A crash-site scanner now reports 0 module-scope `t()` and 0 `.replace")(` remaining.
> - **PAR-002** — `SocietyForm` now passes `coSecretaryPhone`.
> - **PAR-003** — directory list + detail select `residency`; **also fixed the identical bug on mobile** (`member-detail.jsx`, `directory.jsx`, `MemberRow.jsx`) which the web-focused audit didn't list.
> - **PAR-008** — `CodeEntry`/`ProfileForm` `resolveI18nKey` now uses `t(dotKey)` (the flat "auth" namespace holds the `join.*` keys).
> - **PAR-009** — code-rotation filters `.is('revoked_at', null)`.
>
> **Remediation status — 2026-07-01 (batch 2: security + integrity blockers):**
> **PAR-004, PAR-005, PAR-006, PAR-007, PAR-010, PAR-011 are FIXED and verified** — migrations `20260701000011` + `20260701000012` applied to the local DB; full suite green (api-client 195, mobile 302, web 19 files, i18n 2), web build green, **147/147 isolation tests green** (incl. `reveal_phone` + DPDP `remove_member`), and direct DB checks confirm each change. Details:
> - **PAR-004** (phone leak) — column-level lockdown: `REVOKE SELECT ON profiles` + `GRANT SELECT (user_id, full_name, created_at, signup_intent)` so `phone` can NEVER be selected by a client (verified `has_column_privilege(authenticated, phone, SELECT) = false`). `phone` removed from all 7 app selects; the 2 raw-masked displays (`directory/[id]`, `review-queue`) now use the audited `PhonePrivacyChip`; own-phone (join pre-fill) reads the session `auth.users.phone`, not `profiles.phone`. `reveal_phone`/`remove_member` (SECURITY DEFINER) still work.
> - **PAR-005** (dead push URL) — added `app_private.runtime_config` + `functions_base_url()`; all 4 push-trigger functions now read the base URL (docker default seeded for local, overridable for prod) instead of the hardcoded `host.docker.internal`.
> - **PAR-006** (send-sms) — signature verified **unconditionally**, **fail-closed** when the hook secret is unset; the stub adapter no longer logs the OTP.
> - **PAR-007** (poll secrecy) — `poll_votes` SELECT restricted to `user_id = auth.uid()`; new `get_poll_results()` SECURITY DEFINER RPC returns the aggregate tally only; `getPollTally` (web+mobile) now calls the RPC — members can no longer read who voted for what.
> - **PAR-010** (orphaned society) — `remove_member` blocks removing the last active secretary/co-secretary (`LAST_SECRETARY`).
> - **PAR-011** (complaint state machine) — `claim_complaint`/`add_complaint_response` reject `'open'` as a response kind and keep `resolved_at` in sync with the current status (set on resolve, cleared otherwise).
>
> **Remediation status — 2026-07-01 (batch 3: render smoke tests + first High-severity fixes):**
> - **PAR-001 is now COMPLETE.** A new render smoke suite (`apps/web/__tests__/par001-render-smoke.test.jsx`, 16 cases) mounts every previously-crashing screen + sub-component. It **caught 10 more real missing-hook crashes the audit undercounted** — now fixed: `BookingListClient` (`BookingCard`/`ApproverBanner`/`EmptyState`/`ErrorState`), `FlatActionsClient` (`FlatActionCard`/`EmptyState`/`ErrorState`), `PostDetailClient` (`CommentItem`), `ModerationClient` (`ReviewEmpty`), and the **main `ProfileForm`** (join screen — used `t()` 20+ times with no hook of its own; the earlier PAR-008 patch alone would still have crashed it). A comprehensive scanner confirms 0 module-scope/nested `t()` crashes remain on web. **Mobile is clean** — it uses a pass-`t`-as-prop pattern, so it never had this bug.
> - **PAR-013** (auth) — `sendOtpAction` now validates the number server-side (`^\+91[6-9]\d{9}$`) before dispatching SMS.
> - **PAR-014** (notif prefs) — `updatePreferenceAction` now allow-lists editable columns (no client mass-assignment) and validates values; `cap_per_day: 0` (which silently muted ALL push) is rejected.
> - **PAR-028** (partial) — Storage UPDATE/DELETE on `parisar-attachments` restricted to the object **owner** (`owner = auth.uid()`) so members can no longer overwrite/delete each other's complaint photos & fine PDFs (verified in `pg_policy`). The `attachments` table SELECT scoping is still society-wide (tracked below).
> - Verified: web 20 test files (incl. smoke), mobile 302, api-client 195, i18n 2, web build green, migration `20260701000013` applied, **147/147 isolation green**.
>
> **Still open (High):** PAR-012 (per-phone OTP lockout), PAR-015 (booking TZ), PAR-016 (fine amount parse/bound), **PAR-017 (co-sec suffix-match privilege escalation — recommended next)**, PAR-018 (setup races), PAR-019 (wizard URL-skip), PAR-020 (dup societies), PAR-021 (board-member insert), PAR-022/023 (flats cap/labels), PAR-024/025/026 (i18n dates/hardcoded strings/gate), PAR-027 (name sanitization), PAR-028 (attachments SELECT scoping), PAR-029/030/031/032 (mobile stubs), PAR-033 (storage orphan cleanup), PAR-034 (moderation self-report) + all Medium/Low. **All 11 BLOCKERS + PAR-001 fully done; 3 High items fixed this batch.**

### PAR-001 — Widespread module-scope `t()` / `t("key.replace")(...)` crashes render primary screens
- **Module/Screens:** Community feed, Post composer, Poll voting, Comments, Report sheet, Post-type chip, Moderation card + audit log, Bookings list, Booking form, Flat-action issue form, Notification preferences, Notice composer
- **Files (verified):** `apps/web/components/community/PostComposer.jsx:40`, `apps/web/components/polls/PollBlock.jsx:235-325`, `apps/web/components/community/CommunityFeedClient.jsx:218`, `apps/web/components/community/ModerationCard.jsx:54`, `apps/web/components/bookings/BookingListClient.jsx:56`, `apps/web/components/flat-actions/IssueActionForm.jsx:41`, `apps/web/components/settings/PreferencesClient.jsx:236` (+ ~10 more)
- **Priority:** Critical | **Severity:** Blocker
- **Repro:** Open `/community`, `/community/new`, a poll notice, `/bookings`, `/bookings/new`, `/flat-actions/new`, or `/settings/notifications`.
- **Expected/Actual:** Screen renders / `ReferenceError: t is not defined` — `t` is used in module-top constants and in nested sub-components that never call `useTranslation`. Separately, `t("community.postedBy.replace")("{{name}}",…)` looks up a non-existent key then calls a string as a function → `TypeError`.
- **Fix:** Move `t()`-dependent constant tables inside the component body; add `useTranslation` (or pass `t` as a prop) to each nested component; use `t(key).replace(...)` or i18next interpolation `t(key,{name})`.
- **Regression risk:** High — touches many files; add render smoke tests for each screen to prevent recurrence.
- **Status:** Open (verified directly)

### PAR-002 — Society setup cannot start: wrong prop name to `createSociety`
- **File:** `apps/web/components/setup/SocietyForm.jsx:82` passes `coSecPhone`; `packages/api-client/src/society.js` destructures `coSecretaryPhone`
- **Priority:** Critical | **Severity:** Blocker
- **Actual:** `coSecretaryPhone` is `undefined` → RPC raises `INVALID_CO_SEC_PHONE`. The entire onboarding wizard is dead at step 1.
- **Fix:** Pass `coSecretaryPhone: normalizedCoSec`.
- **Regression risk:** Low. **Status:** Open (verified)

### PAR-003 — Member directory 400s: selects non-existent column `residency_type`
- **File:** `apps/web/app/(protected)/dashboard/directory/page.jsx:54`, `directory/[id]/page.jsx:81` — column is `residency`
- **Priority:** Critical | **Severity:** Blocker
- **Fix:** select `residency`. **Status:** Open (verified)

### PAR-004 — 🔒 Every member's phone number leaked in plaintext, unaudited (DPDP breach)
- **Files:** RLS `supabase/migrations/20260430000003_rls_policies.sql:57-66` grants SELECT on `profiles` (incl. `phone`) to any same-society member; directory/review-queue/role-transfer queries embed `profiles:user_id(full_name, phone)`
- **Priority:** Critical | **Severity:** Blocker
- **Actual:** `PhonePrivacyChip`/`maskPhone()` only mask visually — the raw phone is already in the browser payload, no `reveal_phone` audit row is written, any plain member can read it. Defeats the entire audited-reveal privacy model.
- **Fix:** Drop `phone` from client selects; force all phone access through the audited `reveal_phone` RPC; column-level restrict `phone`.
- **Regression risk:** Medium. **Status:** Open (verified)

### PAR-005 — Complaint push notifications dead in production (hardcoded Docker host)
- **File:** `supabase/migrations/20260526000007_phase4_complaints.sql:429` — `http://host.docker.internal:54321/functions/v1/push-fanout`
- **Priority:** Critical | **Severity:** Blocker
- **Actual:** Any deployed environment can't reach that host → the "Member notified" beat of the critical loop silently never fires. Compounded by fire-and-forget delivery with multiple silent-drop paths and no durable in-app notification fallback.
- **Fix:** Read functions base URL from DB setting/vault; persist an in-app notification row as the durable channel. **Status:** Open

### PAR-006 — 🔒 `send-sms` edge function publicly callable in stub mode; OTP logged in cleartext
- **Files:** `supabase/functions/send-sms/config.toml:2` (`verify_jwt=false`), `send-sms/index.js:42-53` (signature check skipped when `OTP_PROVIDER==="stub"`), `adapters/stub.js:8`
- **Priority:** High | **Severity:** Critical
- **Actual:** With the default stub provider, anyone can POST to the hook (no auth, no signature) → OTP-request flooding, victim lockout, and the attacker-supplied OTP is `console.log`'d. Fails open if `SEND_SMS_HOOK_SECRETS` unset in a real deploy.
- **Fix:** Verify webhook signature unconditionally; fail closed when secret unset; never default `OTP_PROVIDER` to stub in prod; never log OTP. **Status:** Open

### PAR-007 — 🔒 Poll vote secrecy is UI-only — `poll_votes` RLS exposes `user_id` to all members
- **File:** `supabase/migrations/20260528000008_phase5_notifications_bookings.sql:285-289`
- **Priority:** High | **Severity:** Major — any member can `select user_id, option_id from poll_votes` and see exactly how each neighbour voted.
- **Fix:** Revoke raw SELECT; return aggregate tallies (+caller's own vote) via a `SECURITY DEFINER` RPC. **Status:** Open

### PAR-008 — Join error paths crash on undefined `en`
- **File:** `apps/web/components/join/CodeEntry.jsx:58`, `ProfileForm.jsx:127` — `resolveI18nKey` reads `en[ns]`, never imported → `ReferenceError`, so specific join errors (invalid/paused code, rate-limit) never show.
- **Priority:** High | **Severity:** Critical
- **Fix:** use `t(mapSocietyCodeError(...))`. **Status:** Open (verified)

### PAR-009 — Code rotation unreachable: filters non-existent `active` column
- **File:** `apps/web/app/(protected)/dashboard/code-rotation/page.jsx:85` — `.eq('active', true)`; use `.is('revoked_at', null)`.
- **Severity:** Critical. **Status:** Open (verified)

### PAR-010 — Last Secretary can strand a society with no admin (orphaned society)
- **File:** `supabase/migrations/20260524000006_phase3_society_setup.sql:618-671` `remove_member` has no last-secretary guard → self-removal permanently locks rotation/transfer/review.
- **Priority:** High | **Severity:** Critical
- **Fix:** block removing the last active secretary. **Status:** Open

### PAR-011 — No complaint status state-machine; `resolved` can silently re-open
- **File:** `supabase/migrations/20260526000007_phase4_complaints.sql:302-383` — `status := p_response_kind` unguarded; `open` is a legal response kind; `resolved_at` never cleared on transition out of resolved. Corrupts the "clear status trail" promise and SLA reporting.
- **Priority:** High | **Severity:** Major. **Status:** Open

---

## HIGH severity (fix before release)

| ID | Module | Issue | File | Sev |
|----|--------|-------|------|-----|
| PAR-012 | Auth | No per-phone OTP brute-force lockout (only per-IP throttle over a 10⁶ space) | verify/page.jsx:42 | Major |
| PAR-013 | Auth | `sendOtpAction` does no server-side phone validation — SMS to arbitrary numbers | actions/auth.js:7 | Major |
| PAR-014 | Notif prefs | `updatePreferenceAction` mass-assigns client `patch`; `cap_per_day:0` silently mutes all push | actions/preferences.js:42 | Major |
| PAR-015 | Bookings | Slot times built in browser-local TZ, validated in IST server-side → non-IST users book wrong window | BookingForm.jsx:74 | Major |
| PAR-016 | Fines | Web `parseInt` truncates `500.75`→`500`; no server upper bound (arbitrary fine via RPC) | IssueActionForm.jsx:97 | Major |
| PAR-017 | 🔒 Auth/Join | Co-secretary auto-elevation uses `LIKE '%'‖phone` (suffix match) → privilege escalation on phone-suffix collision | phase3_society_setup.sql:503 | Major |
| PAR-018 | Setup | Role-transfer & review-queue approvals not race-safe → 0/2 secretaries, or 2 active memberships on one flat | phase3_society_setup.sql:677 | Major |
| PAR-019 | Setup | Wizard steps skippable by URL; refresh/back-nav loses flats/board (Zustand not persisted) | setup/layout.jsx | Major |
| PAR-020 | Setup | Duplicate societies creatable (no idempotency); resume silently orphans earlier live society | phase3_society_setup.sql:129 | Major |
| PAR-021 | Setup | Board-member add is raw client insert; can match/insert a user from another society; failures swallowed | BoardForm.jsx:123 | Major |
| PAR-022 | Setup | Bulk flats: no total cap (DoS), no padded "A-101" labels, client-only bounds | FlatsForm.jsx:101 | Major |
| PAR-023 | Setup | Duplicate flat labels → DB unique violation surfaced as generic "network error" | FlatsForm.jsx:56 | Major |
| PAR-024 | i18n | Dates/relative-times **never** localized — English in hi/mr everywhere (no `date-fns/locale` usage) | ComplaintCard.jsx:31 (+~20) | Major |
| PAR-025 | i18n | Pervasive hardcoded English in setup/join flows (validation msgs, labels, buttons) | SocietyForm.jsx:47, ProfileForm.jsx:251 | Major |
| PAR-026 | i18n | CI coverage gate checks JSON parity only — cannot catch hardcoded strings or missing referenced keys; comment overstates guarantee | scripts/check-i18n-coverage.mjs:107 | Major |
| PAR-027 | 🔒 Validation | Name fields accept zero-width/ZWJ/bidi-RLO/NFD input (`trim()` doesn't strip) → invisible/spoofed names in attribution trail; no NFC normalization | onboard/page.jsx:25, ProfileForm.jsx:137 | Major |
| PAR-028 | 🔒 Data isolation | `attachments` SELECT + storage UPDATE/DELETE are society-wide (no owner scope) → any member reads/overwrites/deletes another member's private complaint photos & fine PDFs | phase4_complaints.sql:169; storage_bucket_rls.sql:31 | Major |
| PAR-029 | Mobile | Society switcher is a `console.log` stub — multi-society members locked to one society | mobile (tabs)/index.jsx:355 | Major |
| PAR-030 | Mobile | My-Complaints unread badge `return 0` stub — in-app "notified" signal dead (core loop) | mobile/lib/complaint-unread.js:21 | Major |
| PAR-031 | Mobile | Same-user re-login doesn't re-register push (guard ref not reset on logout) → silent notification loss | mobile/lib/auth-store.js:25 | Major |
| PAR-032 | Mobile | No `AppState` start/stopAutoRefresh → token refresh unreliable after backgrounding | api-client/supabase.js:16 | Major |
| PAR-033 | Mobile/Web | Photos upload before row creation; abandon/remove/failure orphans storage objects (no cleanup) | mobile PhotoPicker.jsx:110; web PhotoPicker.jsx:48 | Major |
| PAR-034 | Moderation | A member can self-report & re-report any post (no dedupe/self-report guard) → griefing + single-user auto-hide | phase6…community.sql:647 | Major |

---

## MEDIUM / LOW (representative)

| ID | Module | Issue | Sev |
|----|--------|-------|-----|
| PAR-035 | Complaints | Owner flat never joined → attribution shows "Owned by Amit (—)" | Minor |
| PAR-036 | Complaints | Race-lost claim injects fabricated zero-UUID owner "Another board member", never refetches | Major |
| PAR-037 | Complaints | Realtime INSERT/UPDATE rows lack joined reporter/owner → cards show "—" until refetch | Minor |
| PAR-038 | Complaints | No server-side description validation (length/empty/trim); client-only 900 cap bypassable | Major |
| PAR-039 | Complaints | `push-fanout` pushes to reporter even when reporter is the responder; member-kind targets never notified | Minor |
| PAR-040 | Community/FlatAct | No server-side non-empty/length validation on post/comment/flat-action `body` (empty & multi-MB accepted) | Major |
| PAR-041 | Community | Audit-log by-line reads `actor_flat` never selected → always "—" | Minor |
| PAR-042 | Polls | No poll expiry/`closes_at`; deleting parent notice cascade-destroys votes with no audit | Minor |
| PAR-043 | Moderation | `moderate-image` mislabels transient download failure as content REJECT (should be retryable) | Minor |
| PAR-044 | Bookings | Member cannot cancel/withdraw a pending booking (no `cancelled` status/RPC) | Minor |
| PAR-045 | Bookings | Approver/rejecter name never embedded → "Approved by A board member (A-102)" | Minor |
| PAR-046 | Bookings | Reject handler shows nothing on `!ok` (already-actioned) — appears to hang | Minor |
| PAR-047 | Fines | `overdueDays` uses `ceil` → "1 minute late" shows "Overdue by 1 day" | Minor |
| PAR-048 | Dashboard | Gauge counts memberships not distinct flats → can exceed 100% if flat-race lands | Minor |
| PAR-049 | Setup | "No wings" injects literal wing "Main" → labels become "Main-101" | Minor |
| PAR-050 | Review queue | Lone `pending_review` (single claimant) never shown → member stuck pending forever | Minor |
| PAR-051 | Review queue | Co-secretary claimant can self-approve their own contested membership | Minor |
| PAR-052 | Auth | Resend ignores `sendOtpAction` result — timer resets/UI claims sent on a failed/throttled resend | Minor |
| PAR-053 | Auth | `verify?phone=` query param used unvalidated for verify + resend | Minor |
| PAR-054 | Auth | `signOut` is local-scope only — concurrent device sessions survive | Minor |
| PAR-055 | Auth | Middleware fetches user then discards it — protection is single-layer (layout only); a page added outside `(protected)` would be unguarded | Minor |
| PAR-056 | Mobile | Notification-tap pushes unvalidated `data.screen` into router | Minor |
| PAR-057 | Mobile | `atob` used with no explicit polyfill; camera upload path duplicates api-client logic (drift risk) | Minor |
| PAR-058 | Security | `test_otp` (fixed `123456` × 30 numbers) + committed hook secret in `config.toml` — deploy blocker if shipped | Major-if-deployed |
| PAR-059 | Security | Privileged RPCs mix live-DB vs up-to-1h-stale JWT `role` claim → demoted secretary keeps powers until refresh | Minor |
| PAR-060 | i18n | Grapheme fallback (Hermes, no `Intl.Segmenter`) slices Devanagari conjuncts → dangling-virama avatar initials | Minor |
| PAR-061 | i18n | `maxLength` counts UTF-16 units → Devanagari users get ~⅓ the effective character limit | Minor |
| PAR-062 | i18n | `auth` namespace not preloaded server-side → latent key-echo trap for future RSC auth copy | Minor |

*(Plus several Trivial/Info items: storage-key cast error on malformed paths, `formatSocietyCode` >8-char mangle, code charset hint, `MEMBERSHIP_STATUS` JS enum with no DB backing.)*

---

## What's actually solid (verified positives — no action)

- **Cross-society isolation spine is strong:** RLS enabled on 100% of society-scoped tables; `current_society_id()` derives from server-controlled `app_metadata` (not client-settable); auth hook fails closed on missing membership; no-RLS ledger tables grant-revoked; every RPC re-filters by `society_id`. A member **cannot** read another *society's* rows.
- **Double-booking prevention:** `btree_gist` EXCLUDE constraint + atomic `UPDATE…RETURNING` with 23P01 catch — concurrency-correct.
- **Poll one-vote/change-vote/vote-after-close:** DB-enforced (UNIQUE + UPSERT + status check).
- **No-payment constraint honored:** fines are record-only, no settlement logic leaked.
- **Moderation gate fails closed** on provider throw/timeout; enforces quarantine-prefix key guard.
- **No stored XSS:** all bodies render as React text children; no `dangerouslySetInnerHTML` anywhere.
- **Mobile secrets correct:** session in `expo-secure-store` (Keychain), not AsyncStorage; no hardcoded secrets.
- **Enum integrity:** JS constants match Postgres enums across the board.

---

## QA Summary

| Metric | Value |
|---|---|
| Surfaces audited | Web (Next.js), Mobile (Expo), 4 shared packages, 10 SQL migrations, 6 edge functions |
| Automated test files/suites | 59 |
| Automated tests | **718 passed, 0 failed** (1 todo/skip) |
| ⚠️ Coverage gap | Community, polls, bookings, flat-actions, setup, join, directory components: **~0 tests** (why blockers ship green) |
| Total distinct findings | **~90** |
| **Blockers** | **11** (PAR-001…011) |
| High | ~23 |
| Medium | ~20 |
| Low / Minor | ~28 |
| Trivial / Info | ~8 |
| Security findings | 9 (2 confirmed data-privacy breaches: phone exposure, vote secrecy) |
| i18n findings | 6 (hi/mr **not** shippable) |
| Functional (crash-class) | Module-scope `t()` across ~15 components |
| Business-logic | ~12 (state machine, orphaned society, races, griefing) |
| Verified-solid areas | 8 |

**Overall Quality Score: 46 / 100.** The backend security spine, DB constraints, and shared api-client are genuinely well-built (would score ~75 alone); the score is dragged down by render-crashing UI blockers, a broken production notification path, two data-privacy leaks, and hi/mr i18n being unfinished — none of which the passing test suite catches.

**Release Recommendation: 🔴 Needs Major Fixes — Not Ready for Release.**

### Suggested fix order (fastest path to a testable build)
1. **PAR-001** (module-scope `t()`), **PAR-002/003/009** (prop/column mismatches), **PAR-008** — mechanical, unblock the screens so real QA can even run.
2. **PAR-004 + PAR-007** (phone & vote privacy) and **PAR-006** (send-sms) — privacy/security, hard to walk back post-launch.
3. **PAR-005 + PAR-030/031** — restore the critical-loop "notified" beat.
4. **PAR-010/011/018** — data-integrity invariants (secretary, status machine, races).
5. Add render smoke tests for every screen + a second i18n gate — the current suite's green is not trustworthy.

---

## Method caveats (stated plainly)
- This was **static audit only** — no live clicking — so runtime-only issues (actual notification delivery, real device rendering, true race timing) are inferred from code, not observed.
- Confidence levels came from the audit agents; the 4 setup blockers (PAR-002/003/008/009) and the `t()` crash (PAR-001) were independently re-verified against source and held up.

---

# Re-Test Cycle 2 — Batch-1 Fix Verification + Regression (2026-07-01)

**Scope:** Verify the 5 claimed batch-1 fixes (PAR-001/002/003/008/009) against current source; regression-run the suite; re-confirm still-open items.
**Method:** Direct source verification (grep + hand-read of every touched site) + automated crash-site scanner across all web/mobile components + full test run.

## Batch-1 fix verification

| ID | Claim | Verdict | Evidence |
|----|-------|---------|----------|
| **PAR-002** | `SocietyForm` passes `coSecretaryPhone` | ✅ **FIXED** | `SocietyForm.jsx:87` passes correct key; `createSociety` normalizes internally via `normalizePhoneForCoSec()` in `packages/api-client/src/society.js`. |
| **PAR-003** | Directory selects `residency` | ✅ **FIXED (web + mobile)** | `directory/page.jsx:54`, `directory/[id]/page.jsx:81`, and mobile `directory.jsx:54` / `member-detail.jsx:94` all now select `residency`. Remaining `residency_type` hits are test fixtures + safe `??` fallbacks. |
| **PAR-008** | Join uses `t(dotKey)` | ✅ **FIXED** | `CodeEntry.jsx:60` `resolveI18nKey` returns `t(dotKey)`; no `en[ns]` reference remains. |
| **PAR-009** | Code-rotation uses `revoked_at` | ✅ **FIXED** | `code-rotation/page.jsx:85` → `.is('revoked_at', null)`. |
| **PAR-001** | All module-scope `t()` crashes fixed | ⚠️ **PARTIAL — REOPENED (see PAR-001-b)** | The `t("key.replace")(…)` anti-pattern is gone (0 sites), and main-component tables were moved inside. **But 9 nested sub-components still reference `t` with no `useTranslation` and no `t` prop.** |

## 🔴 REOPENED — PAR-001-b: 9 nested components still crash on render

- **Priority:** Critical | **Severity:** Blocker | **Status:** Open (incomplete fix of PAR-001)
- **Root cause:** The batch-1 fix corrected main components and `.replace` sites but **missed module-scope sub-components** — each file's only `useTranslation` is in the main component, so these still throw `ReferenceError: t is not defined` when rendered.

| File | Crashing sub-component(s) | Impact |
|------|---------------------------|--------|
| `PostDetailClient.jsx:299` | `CommentItem` | Post detail with any comment crashes |
| `BookingListClient.jsx` | `BookingCard` (344), `ApproverBanner` (484), `EmptyState` (521), `ErrorState` (542) | **`/bookings` crashes with *or without* data** (EmptyState too) |
| `FlatActionsClient.jsx` | `FlatActionCard` (205), `EmptyState` (288), `ErrorState` (310) | **`/flat-actions` crashes with or without data** |
| `ModerationClient.jsx:200` | `ReviewEmpty` | Moderation "review" empty state crashes |

- **Fix:** Add `const { t } = useTranslation("<ns>")` inside each sub-component (or thread `t` down as a prop from the parent). Same remedy as PAR-001, applied to the nested components that were skipped.
- **Why the suite didn't catch it (again):** all **718 tests still pass** — because these components have **zero coverage**. This is the third time the same blind spot has masked a blocker. Until render smoke tests exist, green CI is not evidence these screens load.

## Regression run (fresh, uncached)

| Package | Files/Suites | Tests | Result |
|---|---|---|---|
| web | 19 | 200 | ✅ pass |
| api-client | 12 | 195 | ✅ pass |
| i18n | 2 | 21 | ✅ pass (1 todo) |
| mobile | 26 | 302 | ✅ pass |
| **Total** | **59** | **718** | **0 failed** |

No regressions in *covered* code; the batch-1 edits didn't break any existing test.

## Still-open findings (unchanged — files not touched, prior verdicts carry forward)

Everything from Cycle 1 except the 4 confirmed-fixed items remains **Open**: PAR-004 (phone RLS leak), PAR-005 (dead push URL), PAR-006 (send-sms public/OTP log), PAR-007 (poll-vote secrecy), PAR-010 (orphaned society), PAR-011 (complaint state machine), plus all High/Medium/Low (PAR-012–062). None of the underlying files changed.

## Updated QA Summary (Cycle 2)

| Metric | Cycle 1 | Cycle 2 |
|---|---|---|
| Automated tests | 718 pass / 0 fail | 718 pass / 0 fail |
| Blockers | 11 | **7** (PAR-001-b + PAR-004/005/006/007/010/011) — 4 closed |
| Blockers fixed & verified | — | PAR-002, PAR-003, PAR-008, PAR-009 (+ PAR-001 partial) |
| New/reopened this cycle | — | **PAR-001-b (9 crash sites)** |
| Coverage gap | wide | **unchanged — still the root cause of masked blockers** |

**Overall Quality Score: 52 / 100** (up from 46 — four genuine blockers closed and verified, but a blocker reopened and the test blind spot persists).

**Release Recommendation: 🔴 Needs Major Fixes — Not Ready for Release.**

### Next actions (in order)
1. **PAR-001-b** — finish the job: add `useTranslation`/`t`-prop to the 9 listed sub-components (mechanical, ~1 file each).
2. **Add render smoke tests** for `/bookings`, `/flat-actions`, `/community`, `/community/[id]`, `/community/moderation`, `/community/new`, `/settings/notifications` — mount with the i18n provider, assert no throw. Permanently closes the blind spot that has now hidden the same blocker three times.
3. Then the privacy/security batch: **PAR-004, PAR-006, PAR-007**.

---

# Re-Test Cycle 3 — New-Dimension Deep Audit (2026-07-01)

**Why this cycle:** No source changed since Cycle 2, so all prior findings stand. Rather than re-print them, this cycle audited the **dimensions Cycles 1–2 under-covered**: Accessibility (WCAG 2.2 AA), Responsive/Visual-UI, Performance, Error-Handling/Edge-Cases, and Web-Platform Security (headers/cookies/CSRF). 5 parallel agents; **61 NEW findings** (PAR-063–PAR-123), none duplicating PAR-001–062. Contrast ratios were computed against actual token hex values.

> **Remediation status — 2026-07-01 (batch 4: cheapest class-closing Cycle-3 fixes):** FIXED and verified (web build green, mobile 302 green, full suite green):
> - **PAR-096** (zero security headers) — `next.config.js` now sends `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` + `object-src 'none'` + `base-uri 'self'`, `Referrer-Policy: strict-origin-when-cross-origin` (also closes **PAR-099** Referer PII leak), `X-Content-Type-Options: nosniff`, HSTS, and `Permissions-Policy` on every route. Clickjacking of the fine/take-down/waive actions is closed. A full script-src CSP (**PAR-097**) still needs a nonce strategy — tracked.
> - **PAR-101** (no error boundary) — added `app/global-error.jsx` + `app/(protected)/error.jsx`. Any render throw (incl. any future `t()`-class crash) is now contained to a recoverable "Try again" card instead of white-screening the app.
> - **PAR-102** (mobile splash-hang) — `auth-store.initialize` `getSession()` now has `.catch` → a corrupted SecureStore session fails open to signed-out instead of hanging the splash forever.
> - **PAR-070** (no reduced-motion) — `globals.css` now honors `prefers-reduced-motion: reduce` (shake/slide/spin + transitions near-instant).
> - **PAR-100** (debug UUID leak) — removed the society-UUID `console.log` in `AppSidebar`.
>
> **Remediation status — 2026-07-01 (batch 5: error-handling batch PAR-103–108, WEB half):** FIXED and verified (web build green, web 20 test files, mobile 302, full suite green; 2 new i18n keys added across en/hi/mr with the coverage + Devanagari gates green):
> - **PAR-103** (silent deletes) — `CommunityFeedClient.handleDeletePost` + `PostDetailClient` post/comment deletes now check `{ok}`, `catch`, and surface `community.deleteError` (new alert banner on the feed; on-page error slot on the detail) instead of fire-and-forget false success.
> - **PAR-104** (booking reject silent no-op) — `handleRejectConfirm` now has an `else` + `catch` → toasts `booking.submitError` and keeps the dialog open for retry.
> - **PAR-105** (poll close swallowed) — `handleClose` now has an `else` + `catch` → surfaces the new `poll.closeError` via the existing rendered error slot.
> - **PAR-106** (join data loss) — `ProfileForm` family-member insert **and** name update now capture `{error}` and surface it instead of discarding it. The membership RPC upserts on conflict, so the user can safely retry rather than silently lose family rows on the core join loop.
> - **PAR-107** (partial board setup = "success") — `BoardForm` now separates **benign skips** (unregistered member / flat not found — the documented behaviour, still advances) from **real insert failures**, which surface and **block navigation**. Previously errors showed only if EVERY insert failed. Raw PG error text no longer leaked (PAR-111 spirit).
> - **PAR-108** (non-atomic review-queue) — the approve `UPDATE`'s `{error}` is now checked **before** removing the other claimants (previously a failed activate + successful removals left the flat with nobody active); removal failures are collected not swallowed; and the handler now **re-`load()`s from the server** instead of optimistically dropping the group.
>
> **Remediation status — 2026-07-01 (batch 6: error-handling batch, MOBILE half — PAR-105/106/107/109/110):** FIXED and verified (mobile 302 green, full suite green, all 3 i18n gates green, web build green):
> - **PAR-109** (mobile auth) — `verify.jsx` no longer reads `data.user.id` unguarded (it threw into the generic `catch`, masking the real cause as "network error"); a failed profile lookup no longer falls through as "new user" (which would route an existing member into onboarding); and `handleResend` now surfaces failures incl. **429 rate-limit** and rethrows, so `ResendTimer` **only restarts the countdown on success** (it previously restarted in `finally`, hiding the error behind a fresh timer).
> - **PAR-106** (mobile join data loss) — family-member insert **and** name update now capture `{error}` and surface it instead of discarding it.
> - **PAR-107** (mobile partial board setup) — the `society_memberships` insert `{error}` was discarded entirely; failures are now collected, surfaced, and **block** wizard advance (unregistered-member skips stay benign).
> - **PAR-105** (mobile poll crash) — `options.map` guarded with `(options ?? [])`, removing the null-crash path.
> - **PAR-110** (mobile new-booking) — a failed `listAmenities` only `console.warn`ed, leaving the list empty and indistinguishable from "no amenities" with Submit disabled forever; it now surfaces `booking.loadError`.
>
> **Remediation status — 2026-07-01 (batch 7: PAR-103/104 mobile close-out + PAR-063 accessibility):** FIXED and verified (web build green, full suite green — web 20 files, mobile 302, api-client 195, i18n 2):
> - **PAR-103 (mobile)** — community post + comment deletes were `console.warn`-only; they now surface `community.deleteError` via `Alert` (the established pattern in this app). Deliberately NOT `setError()`, which drives a **full-screen** replacement and would have wiped the post view — the same bug class as PAR-104.
> - **PAR-104 (mobile)** — `load()` now takes `{ silent }`. A refetch that follows a **successful** approve/reject (or a realtime/reconnect event) no longer flips the whole screen to `ErrorState`; only the initial load and an explicit Retry surface the full-page error. **PAR-103–110 is now fully closed on both platforms.**
> - **PAR-063 (Critical, a11y)** — all 5 setup-wizard forms had **zero `htmlFor`**: labels were visual-only, so screen readers announced bare "edit text". Every control now has an associated accessible name — `SocietyForm` (name/address/secretary-phone/co-sec-phone, incl. `aria-invalid` + `aria-describedby` wiring errors and helper text), `WingsForm`, `AmenitiesForm`, `BoardForm` (name/phone/wing/flat), and `FlatsForm` (per-wing flat + bulk from/to use **wing-scoped ids** since they repeat, plus the secretary wing/flat selects).
>
> **Remediation status — 2026-07-01 (batch 8: contrast palette PAR-064–069 + PAR-071/072):** APPLIED and verified (web build green, full suite green — web 20 files, mobile 302, api-client 195, i18n 2; all 3 i18n gates green; isolation 147/147):
> - **PAR-064/067/069** — `ui-tokens/colors.js` is now an AA-compliant palette with the ratio recorded per token: `neutral.400` `#a3a3a3`→**`#6e6e6e`** (2.52:1 → 4.68:1 worst-case, verified against white / `#fafafa` / `#f5f5f5` / `#f5f7ff` — the obvious `#737373` was rejected because it fails at 4.35:1 on `neutral-100`); `success.500` `#10b981`→**`#047857`** (2.54→5.48); `danger.500` `#ef4444`→**`#c81e1e`** (3.76→5.74). Swept **115 source files** across web + mobile.
> - **PAR-065** — brand text/fills moved off `brand.500` (4.17:1, fails) to `brand.600` `#4a5add` (5.53:1). `brand.500` is retained deliberately for borders/rings/icons, which are non-text UI at a 3:1 bar. A follow-on pass fixed **15 files** where the sweep had collapsed base and hover to the same value (`hover:` now steps to `brand.700`).
> - **PAR-066** — the count badge used white on amber (2.15:1). Amber is a LIGHT fill, so the text went dark (`neutral-900`, **8.35:1**) rather than darkening the brand-amber fill. Fixed on web + mobile.
> - **PAR-068** — decorative empty/offline icons `#e5e5e5` (1.26:1, "effectively invisible") → **`#8a8a8a`** (3.45:1), clearing the 3:1 non-text bar. 14 files. `#e5e5e5` **borders** were deliberately left alone.
> - **PAR-071** — skip-to-content link in the protected layout (`sr-only` until focused, targets a new `#main-content`), so keyboard users skip the sidebar on every page.
> - **PAR-072** — `role="status"` on the clipboard "Copied!" confirmation in `CodeShare` + `CodeCard` so it is announced, not just shown.
> - An automated re-audit of every `text-[#hex]` in source now reports **0 AA failures** on white/neutral surfaces.
> - One test broke and was fixed *correctly*: `admin-screens-03-08` asserted raw source text `mode = 'member'` and failed purely because Biome normalised quotes. It now asserts the **contract** via a quote-agnostic regex rather than the formatter's style.
>
> **Superseded — original analysis (values now applied above):** Independently recomputed every ratio; the audit's numbers are exact. AA-passing replacements: secondary text `#a3a3a3` (2.52:1) → `#737373` (4.74:1); success fill `#10b981` (2.54:1) → `#047857` (5.48:1); danger `#ef4444` (3.76:1) → `#c81e1e` (5.74:1); brand `#5b6cff` (4.17:1) → `#4a5add` (5.53:1, already `brand.600`); warning badge — use `neutral-900` on `#f59e0b` (8.35:1) instead of white (2.15:1); tinted-pill text → `#b45309`/`#047857`/`#3a48b2`/`#c81e1e` (4.8–7.1:1). **Held for sign-off** because this repalettes both apps (dozens of hardcoded hex literals) and visibly changes the product's look — a design call, not a silent bug fix.
>
> **Still open (Cycle-3):** PAR-064–069 contrast (above), PAR-071 skip link, PAR-072–076 (a11y minor), PAR-111–119 (raw PGRST leak to users, login double-submit, mobile sign-out/push/offline/unmount-setTimeout, AmenitiesForm idempotency); a11y contrast/labels (PAR-063–069, 072–076); dark-mode (PAR-077+); performance latency (PAR-090–095); CSP script-src + cookie hardening (PAR-097/098); PAR-071 skip link.

## Accessibility (WCAG 2.2 AA)

| ID | Issue | File | Pri/Sev |
|----|-------|------|---------|
| PAR-063 | Setup wizard fields have **no label↔input association** (no `htmlFor`/`id`/`aria-label`) — SR announces "edit text" | SocietyForm/WingsForm/FlatsForm/AmenitiesForm/BoardForm | Critical/Critical |
| PAR-064 | `#a3a3a3` secondary/body text = **2.52:1** on white (needs 4.5:1) — pervasive (timestamps, helper text, empty states) | ui-tokens/colors.js:16 + ~12 components | High/Major |
| PAR-065 | Status/badge text fails contrast on tinted pills (need_info 2.07:1, resolved 2.41:1, checking 3.90:1) | StatusBadge/FlatActionKindBadge/FineStatusBadge/PostTypeChip | High/Major |
| PAR-066 | Warning count badge: white on `#f59e0b` = **2.15:1** | DashboardTile.jsx:160 | High/Major |
| PAR-067 | Buttons white-on-fill below AA: brand 4.17:1, danger 3.76:1, **success 2.54:1** | globals.css:158,164 + primary/destructive buttons | High/Major |
| PAR-068 | Empty/offline decorative icons `#e5e5e5` ≈ 1.2:1 — effectively invisible | ComplaintListClient.jsx:209,230; BookingListClient.jsx:549 | Med/Major |
| PAR-069 | Character-counter default `#a3a3a3` = 2.52:1 (aria-live wiring itself is correct) | FileComplaintForm/NoticeComposer/IssueActionForm | High/Major |
| PAR-070 | No `prefers-reduced-motion` support — shake/slide/spin always play | globals.css:177-191 | Med/Major |
| PAR-071 | No skip-to-content link; keyboard users tab through full sidebar each nav | app/layout.jsx; (protected)/layout.jsx | Med/Major |
| PAR-072 | Clipboard "Copied!" not announced (no `role="status"`) | CodeShare.jsx:66; CodeCard.jsx:123 | Med/Minor |
| PAR-073 | Photo-picker preview + detail lightbox button use `alt=""`/content-alt where informative | PhotoPicker.jsx:123; ComplaintDetailClient.jsx:242 | Med/Minor |
| PAR-074 | `MemberRow` nests an interactive phone chip inside a `<Link>` (invalid, ambiguous keyboard) | MemberRow.jsx:59-100 | Med/Minor |
| PAR-075 | `ReportReasonSheet` radios not in a `role="radiogroup"`; no arrow-key roving | ReportReasonSheet.jsx | Med/Minor |
| PAR-076 | `OtpInput aria-labelledby` depends on a page-level id (fragile cross-component contract) | OtpInput.jsx:71 | Low/Trivial |

*A11y positives verified: modal focus-trap/Escape/restore, `<html lang>` per locale, OtpInput keyboard model, DashboardTile button semantics, `role="alert"` on async errors, IssueActionForm radiogroup, icon-button `aria-label`s.*
**A11y verdict: NOT WCAG 2.2 AA — blocked by unlabeled setup fields + systemic contrast failures.**

## Responsive / Visual-UI

| ID | Issue | File | Pri/Sev |
|----|-------|------|---------|
| PAR-077 | **Dark mode declared but dead** — a light-hex `:root` inside `@layer base` overrides tokens, `.dark` never applied, and components hardcode `bg-white`/`text-[#171717]` app-wide | globals.css:130-174 + most components | High/Major |
| PAR-078 | Success toast is `fixed z-50` — **collides with sidebar Sheet + Dialog overlays (also z-50)**; can render behind a backdrop or over the mobile nav | 8 files (BookingListClient.jsx:330 et al.) | High/Major |
| PAR-079 | Community photo composer `grid-cols-4` → ~70px cells + 28px remove button at 320px | PostComposer.jsx:252,271 | Med/Major |
| PAR-080 | Sub-44px icon touch targets throughout (w-7/w-8, `p-1` ≈ 22–36px) | PostDetailClient/CommunityFeedClient/NoticeComposer/IssueActionForm | Med/Major |
| PAR-081 | List/directory headers lack `min-w-0`/`truncate` → long Devanagari titles clip/push count badge in fixed `h-14` | directory/page.jsx:117 + list headers | Med/Minor |
| PAR-082 | Wing-filter chip row `overflow-x-auto` with no scroll/fade affordance | directory/page.jsx:130 | Low/Minor |
| PAR-083 | Devanagari-unsafe tight line-heights (`leading-none`/`leading-tight` on localized headings/DialogTitle) | CodeEntry.jsx:187; CodeShare.jsx:48; dialog.jsx:124 | Low/Minor |
| PAR-084 | Booking amenity name `break-words` (not `line-clamp`) → unbounded card height | BookingListClient.jsx:378 | Low/Trivial |

*UI positives: dashboard tile grid scales at 320px, PhotoGrid aspect-ratio/object-cover, shadcn offcanvas sidebar, card-based (no tables), directory skeleton, SocietyHeaderPill truncation.*
**Responsive verdict: sound mobile-first skeleton; dead dark mode + toast z-index + touch targets are the systemic gaps.**

## Performance

| ID | Issue | File | Pri/Sev |
|----|-------|------|---------|
| PAR-085 | Unbounded directory SELECT (no `.limit()`, client-side filter of full member list); `fetchAuditLog` is `select('*')` unbounded too | directory/page.jsx:51; society.js:354 | Med (High at scale) |
| PAR-086 | All 9 i18n namespaces loaded + serialized into SSR HTML on every route | layout.jsx:24; namespaces.js | Med |
| PAR-087 | Directory double-fetches memberships (page + nested RecentJoinersSection) | directory/page.jsx:198; RecentJoinersSection.jsx | Med |
| PAR-088 | `getNoticeDetail` runs up to 6 **sequential** awaited queries (waterfall ~1.5–2s on mobile) | notifications.js:94-159 | Med |
| PAR-089 | SSR detail pages sign attachment URLs **sequentially in a loop** (community signs every photo) | community/[id]/page.jsx:57 + others | Med |
| PAR-090 | Dashboard SSR summary + client refetch on focus + 3 badge queries (incl. always-erroring `society_codes`) | dashboard/page.jsx:91; DashboardClient.jsx:137 | Med |
| PAR-091 | Board complaint/booking lists over-fetch full joined rows for client-side tab filter; `listBookings` queue has no pagination | complaints/page.jsx:38; bookings.js:54 | Med |
| PAR-092 | Web photo uploads NOT compressed (mobile resizes to ≤1600px/q0.7) — full-res over slow uplinks | complaints.js:422; notifications.js:391 | Low-Med |
| PAR-093 | Community feed comment counts via per-row `post_comments(count)` subquery (scaling watch) | community.js:56 | Low |
| PAR-094 | Dashboard opens a 2nd realtime channel (8 tables) → duplicate wire traffic | dashboard-realtime.js:87 | Low |
| PAR-095 | Detail helpers do 2 sequential independent awaits (row + attachments) | complaints/community/flat-actions helpers | Low |

*Perf positive: schema is well-indexed — every list `ORDER BY created_at DESC` + society filter and attachment read is index-backed; pagination is index-ready.*
**Performance verdict: no blocking N+1/index gaps; latency leaks (waterfalls, dup fetches, unbounded directory, uncompressed web uploads) bite first on Indian networks/large societies.**

## Web-Platform Security

| ID | Issue | File | Pri/Sev |
|----|-------|------|---------|
| PAR-096 | **Zero HTTP security headers** — no X-Frame-Options/CSP `frame-ancestors` (clickjackable fine/take-down/waive), no HSTS/nosniff/Referrer-Policy | next.config.js:1-13 | High/Major |
| PAR-097 | No CSP → no XSS defense-in-depth on a form-heavy app (React escaping is the only layer) | next.config.js | Med/Major |
| PAR-098 | Auth session in JS-readable (`document.cookie`) cookies with no explicit `Secure`/`SameSite` hardening and no CSP backstop → XSS = full token theft | lib/supabase/{client,server,middleware}.js | Med/Major |
| PAR-099 | Phone (PII) passed in URL query on verify; with no Referrer-Policy leaks via `Referer` + browser history | login/page.jsx:44; verify/page.jsx:21 | Low/Minor |
| PAR-100 | `console.log` of society UUID on every switch (debug leftover) | AppSidebar.jsx:125 | Low/Trivial |

*Security positives verified: no open redirect (all `redirect()` targets hardcoded), all `target="_blank"` carry `rel="noopener noreferrer"`, no `dangerouslySetInnerHTML`, no tokens/PII in localStorage, tight Supabase `additional_redirect_urls` allowlist, refresh-token rotation on, no route handlers bypassing server-action origin checks.*
**Web-platform verdict: well-behaved on redirects/CSRF/links/storage, but ships zero HTTP security headers — the must-fix gap before production.**

## Error Handling / Edge Cases (all NEW; excludes known PAR-033 orphaned-storage & PAR-036 claim-lost owner)

| ID | Issue | File | Pri/Sev |
|----|-------|------|---------|
| PAR-101 | **No React error boundary anywhere** (web `error.jsx`/mobile) — any render throw white-screens the route; uncontained given known `t()` crashes; mobile has no crash reporting | app/ (none); mobile/_layout.jsx | High/Critical |
| PAR-102 | Mobile `auth-store.initialize` — `getSession()` has no `.catch`; corrupted SecureStore session → **splash hangs forever** | mobile/lib/auth-store.js:14; secure-storage.js:19 | High/Major |
| PAR-103 | Community post/comment deletes fire-and-forget — failure invisible, UI shows false success (web) / no feedback (mobile) | CommunityFeedClient.jsx:129; PostDetailClient.jsx:145 | High/Major |
| PAR-104 | Booking reject (web) / approve-refetch (mobile) swallow failure — reject silently no-ops; mobile flips to full ErrorState after a successful approve | BookingListClient.jsx:193; mobile bookings/index.jsx:142 | High/Major |
| PAR-105 | PollBlock close swallows error (web); mobile `options.map` on null crashes + tally error shows fake "0 votes" | PollBlock.jsx:125; mobile PollBlock.jsx:180 | High/Major |
| PAR-106 | Join ProfileForm family-member insert + name update **ignore Supabase `{error}`** → silent data loss on the core join loop | ProfileForm.jsx:163; mobile:248 | High/Major |
| PAR-107 | Setup BoardForm surfaces error **only if EVERY insert fails** → partial board setup reported as success; mobile ignores `.error` | BoardForm.jsx:145; mobile:104 | High/Major |
| PAR-108 | Non-atomic review-queue approve+remove → half-resolved conflict, one generic error, no refresh | review-queue/page.jsx:203 | High/Major |
| PAR-109 | Mobile OTP verify unguarded `data.user.id` (throws→masked) + resend fire-and-forget (no 429 handling, timer resets) | mobile verify.jsx:67,85 | High/Major |
| PAR-110 | Mobile new-booking/flat-actions queries ignore `{error}` → broken form indistinguishable from "empty society", Submit disabled forever | mobile bookings/new.jsx:65; flat-actions | High/Major |
| PAR-111 | Detail-page load errors render **raw PGRST error strings** to users (internal leak + un-localized) | complaints/notices/community/flat-actions `[id]` pages | Med/Major |
| PAR-112 | Login double-submit sends two OTPs (no `if(loading)return`; disabled only on `!isReady`) | login/page.jsx:23 | Med/Major |
| PAR-113 | FileComplaintForm can submit while photo upload is in flight → complaint files with `storageKey:null`, photo dropped | FileComplaintForm.jsx:68; PhotoPicker | Med/Minor |
| PAR-114 | Mobile sign-out aborts on first failure (stays logged in); language-change blocked by AsyncStorage failure | mobile auth-store.js:35; i18n.js:75 | Med/Major |
| PAR-115 | Mobile push-token registration failure is permanent for the session (ref set before await resolves) | mobile _layout.jsx:104; push-registration.js:70 | Med/Major |
| PAR-116 | Mobile pervasive ignore-`{error}` pattern → RLS/network failures masquerade as empty data (directory/flat-actions/home/moderation/setup) | multiple mobile screens | Med/Major |
| PAR-117 | Mobile: no offline detection, no pull-to-refresh; dashboard shows stale counts as current with no "couldn't refresh" | mobile index/complaints/community/my-complaints | Med/Minor |
| PAR-118 | Mobile uncancelled success/nav `setTimeout`s → `router.back()` + setState after unmount | mobile bookings/notices/IssueActionForm | Med/Minor |
| PAR-119 | Mobile AmenitiesForm retry duplicates rows (no idempotency); FlatsForm strict-equality flat match ("007"≠"7") breaks finalize | mobile AmenitiesForm.jsx:91; FlatsForm.jsx:157 | Med/Minor |
| PAR-120 | Mobile onboard collapses `23505` unique-violation into generic "network error" → infinite retry against a permanent conflict | mobile onboard.jsx:52 | Med/Minor |
| PAR-121 | Realtime subscriptions ignore non-SUBSCRIBED statuses (CHANNEL_ERROR/TIMED_OUT/CLOSED) → silent "updates paused" | api-client subscribe callbacks | Low/Minor |
| PAR-122 | Community feed realtime drops `userId`/`role` from deps (stale closure); dashboard pages create unmemoized browser client per render | CommunityFeedClient.jsx:87; dashboard pages | Low/Minor |
| PAR-123 | Additional swallowed mobile failures (moderation restore/takedown, `markNoticeRead`, `SocietyPreview .split` on null name, review-queue null `flat_id` merge) | multiple mobile files | Low/Minor |

**Error-handling verdict: systemic — no error boundaries (uncontained white-screen), a mobile splash-hang, and a pervasive swallow-the-`{error}`/`{ok:false}` pattern on core write paths making failures invisible or falsely successful.**

## Updated aggregate (through Cycle 3)

| Metric | Value |
|---|---|
| Total tracked findings | **~123** (PAR-001–123) |
| Automated tests | 718 pass / 0 fail (still no coverage of the crash/UI/error paths) |
| Open blockers | 7 (PAR-001-b, 004, 005, 006, 007, 010, 011) |
| New this cycle | 61 (1 Critical-a11y, 18 High, 29 Medium, 13 Low) |
| Accessibility issues | 14 — **not WCAG 2.2 AA** |
| Security observations (total) | 14 (Cycle 1) + 5 web-platform (Cycle 3) = **19**; must-fix headers gap (PAR-096) |
| Performance observations | 11 (no blocking N+1) |
| UI/UX + Responsive | 8 + prior |
| Error-handling / edge | 23 |

**Overall Quality Score: 50 / 100** (Cycle-2 was 52; Cycle 3 didn't change the code but surfaced a broad new defect surface — a11y non-compliance, no security headers, no error boundaries, pervasive swallowed errors — that a release audit must weigh down).

**Release Recommendation: 🔴 Needs Major Fixes — Not Ready for Release.**

### Cheap, high-leverage Cycle-3 fixes
1. **PAR-096** — add `async headers()` to `next.config.js` (X-Frame-Options/CSP/HSTS/nosniff/Referrer-Policy). One file, closes the clickjacking + Referer-leak + defense-in-depth gaps at once.
2. **PAR-101** — add `app/(protected)/error.jsx` + `app/global-error.jsx` (web) and a mobile root boundary. Contains every render throw, including the known `t()` crashes.
3. **PAR-063 + contrast (PAR-064/065/066/067/069)** — a11y: add `htmlFor`/`id` to setup fields; darken secondary text token `#a3a3a3`→`#525252` and the badge/button fills. Mostly token-level.
4. **PAR-070/071** — reduced-motion media query + skip link (each a few lines in globals.css/layout).
5. **Error-handling batch (PAR-103–110)** — add `else`/`catch` + surfaced error state on the swallowed write paths; these hide real failures on core loops today.
