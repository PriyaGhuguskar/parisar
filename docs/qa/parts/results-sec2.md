# Parisar Security Testing — Section 7 execution (area: sec2)

Date: 10 November 2026. Tester: security test engineer (sec2). Environment: local only.
Web `next dev` at http://localhost:3000 (DEV), Supabase local at http://127.0.0.1:54321,
Postgres container `supabase_db_parisar`. Branch `feat/saas-onboarding`.

Authorisation: the owner authorised this testing of their own local environment. Only safe,
non-destructive techniques were used. No application code, migrations or config were changed.
No `supabase db reset`, no isolation suite, no `DELETE`/`TRUNCATE`/`DROP` on existing data.
Keys and tokens were never printed. Accounts: own 9000000029 / 9000000009 (no membership =
outsider); read-only owner 9000000017 and tenant 9000000019 (QA Sunrise Heights,
`06d44e6a-0eed-41c4-b64f-a21b30123ef7`).

Evidence: `docs/qa/evidence/sec2/`.

This file executes the rows marked **Not Tested / Partially tested** in section 7 of
`PARISAR_SECURITY_TESTING.md`. That file was not edited.

Status legend: Pass, Fail (finding raised), Blocked, Not Tested.

---

## 1. Proof-bucket upload validation

Bucket `parisar-proofs` (read-only SQL): `public=false`, `file_size_limit=10485760` (10 MB),
`allowed_mime_types={image/jpeg,png,webp,heic,heif,application/pdf}`. Write path
`{society_id}/{uploader_uid}/{file}` guarded by RLS `parisar_proofs_write` →
`public.can_write_proof_object(name)`. Review of that function shows it:
`return false` if the name contains `..`; requires exactly 3 path segments; requires
`parts[2] == auth.uid()` (no writing under another user's folder); filename must match
`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; and requires an active membership or a registered/approved
tenant in that society.

Live probes as **non-member 9000000029** (write policy requires membership → nothing can be
created; verified `storage.objects` count under uid29 = 0 after the run):

| Probe | Sent | Result | Status |
|---|---|---|---|
| Valid-shaped path, `Content-Type: application/pdf` | POST object | `403 new row violates row-level security policy` | Pass (write denied for non-member) |
| Disallowed MIME `application/x-msdownload` | POST object | `415 invalid_mime_type: mime type application/x-msdownload is not supported` | Pass (MIME allowlist enforced at storage layer) |
| Path traversal name `..%2f..%2fevil.pdf` | POST object | `403 RLS` (name with `..` rejected by `can_write_proof_object`) | Pass |

Not executed live: the **content-sniffing bypass** (`.exe` bytes with a *declared*
`Content-Type: application/pdf`). Supabase Storage validates only the declared MIME header,
not the bytes, so an allowed-but-mismatched declared type is accepted — the same class as the
existing finding **CORE-007** (corrupt 6 MB "image" accepted). A member-context live upload was
blocked by the environment's write-to-shared-resource guard, so this specific case is recorded
from config + code review, not a live run. Raised as **SEC-012 (Low)**. The 15 MB oversize case
was likewise not run live (member-context write blocked); the 10 MB `file_size_limit` in bucket
config is the server-side control and is enforced by Supabase Storage.

**Status: Pass** for MIME allowlist, path-traversal, cross-user and non-member write denial.
Content-sniffing / 15 MB live cases **Not Tested** (blocked) — SEC-012 covers the sniffing gap.
Evidence: `docs/qa/evidence/sec2/proof-upload.txt`.

---

## 2. Stored XSS

Static sink analysis across `apps/web/app`, `apps/web/components`, `apps/web/lib`, `packages`:
- `dangerouslySetInnerHTML`: **0 occurrences**.
- `.innerHTML=` / `insertAdjacentHTML` / `document.write` / `eval(`: **none**.

All user-supplied content (complaint description, notice title, community post, profile name,
connect-request message) is rendered through JSX, which auto-escapes. With no HTML sink present,
stored markup cannot execute as script in the web client.

CSV/Excel export ("Excel name cell" case): `apps/web/components/import/lib/excel.js` exposes
`neutraliseCell(text)` which prefixes `'` to any cell whose value starts with a formula lead
(`=`,`+`,`-`,`@`); it is applied to every exported cell (lines 193–196 of the error-report build).
Formula/CSV injection is therefore mitigated.

Live verbatim-storage round-trip on the **own** 9000000029 profile could not run because 29 has
no `profiles` row (never onboarded) — the PATCH affected 0 rows; a post-run check confirmed no
profile anywhere contains the probe string (`full_name like '%XSS probe%'` → 0). Nothing was
created or left behind.

Residual (recommended, not a defect): a full per-field browser render of a labelled
"QA-T XSS probe" payload, viewed as a second user, would be belt-and-suspenders confirmation; the
sink analysis is already definitive.

**Status: Pass** (web rendering structurally escapes; CSV export neutralised).
Evidence: `docs/qa/evidence/sec2/stored-xss.txt`.

---

## 3. Reflected XSS

| Probe | Observed | Status |
|---|---|---|
| `/login?next=javascript:alert(1)` | `javascript:alert(1)` appears **only** inside the RSC flight JSON as an escaped data string (`\"next\":\"javascript:alert(1)\"`), never in an `href`. `next` is consumed via `safeNextPath()` which returns the fallback unless the value matches `^/(?!/)` (must start with a single `/`; rejects control chars, `\`, whitespace, >2048). `javascript:` is discarded. | Pass |
| `/connect/success?code=<script>alert(1)</script>` | Payload not reflected verbatim (escaped / not used). | Pass |
| `/import?x="><svg onload=alert(1)>` | Protected route → tiny redirect response; payload not reflected. | Pass |

No script executes; open-redirect via `next` is also blocked by `safeNextPath`.

**Status: Pass.** Evidence: `docs/qa/evidence/sec2/reflected-xss.txt`.

---

## 4. SQL injection (RPC parameters and PostgREST filters)

Authenticated as owner 9000000017 and anon, injection strings were sent into PostgREST filters
and RPC text parameters.

| Vector | Sent | Result | Status |
|---|---|---|---|
| PostgREST filter value | `societies?name=eq.x'or'1'='1` | `[]` (value treated as literal, no rows) | Pass |
| PostgREST order param | `order=name;drop table societies` | `PGRST100` parse error, query refused | Pass |
| RPC text param (public) | `get_connect_request_status(p_request_code="' or 1=1--")` | `{"error":"REQUEST_NOT_FOUND"}` (literal) | Pass |
| RPC text param | `validate_society_code(p_code="x'; drop table societies;--")` and a `union select ... information_schema` | `42501 permission denied for function` (grant check; input never reached SQL) | Pass |

PostgREST binds filter values and RPC arguments as parameters; structural injection is rejected
by the parser and literal payloads return clean app errors. No extra rows and no raw SQL errors
caused by the payloads.

**Status: Pass.** Evidence: `docs/qa/evidence/sec2/sqli.txt`.

---

## 5. CSRF on server actions

Next.js 15 server actions. A cross-origin POST carrying a `Next-Action` header and
`Origin: https://evil.example` to `http://localhost:3000/` was **rejected**:
`Error "Invalid Server Actions request."`. The same POST with `Origin: http://localhost:3000`
(same-origin) was accepted (HTTP 200). The framework's Origin-vs-Host check refuses cross-origin
invocation before the action runs. The audited actions (`setLanguageAction`,
`ensurePreferencesAction`/`updatePreferenceAction`) additionally whitelist-validate input and
derive `user_id` from the server session, not from client arguments.

**Status: Pass.** Evidence: `docs/qa/evidence/sec2/csrf.txt`.

---

## 6. CORS

| Target | `Access-Control-Allow-Origin` | Credentials | Notes |
|---|---|---|---|
| Supabase REST (`OPTIONS`/`GET` with `Origin: https://evil.example`) | `*` (reflected as wildcard) | no `Access-Control-Allow-Credentials` | Auth is via bearer token, not cookies; a wildcard without credentials does not let a foreign page read a victim's authenticated responses. Standard Supabase/Kong behaviour. |
| Web app `http://localhost:3000/login` with evil Origin | no ACAO header | n/a | No cross-origin read exposure on the Next.js app. |

The `*` is acceptable for a token-based API but is noted so production does not combine
`ACAO: *` with `Allow-Credentials: true`. Raised as **SEC-011 (Low/informational)**.

**Status: Pass (with Low note).** Evidence: `docs/qa/evidence/sec2/cors.txt`.

---

## 7. Public rate limits

Limits from `submit_connect_request` / `get_connect_request_status` (migration
`20261106000060_connect_requests.sql`) via `app_private.assert_rate`.

| Endpoint | Limit | Live result | Status |
|---|---|---|---|
| `get_connect_request_status` | 10 / 600 s per code (30 / 600 s per IP) | reqs 1–10 → `REQUEST_NOT_FOUND`; reqs 11–13 → `RATE_LIMITED` (P0001) | Pass |
| `submit_connect_request` | 3 / hour per phone (10 / hour per IP) | req 1 → code issued; reqs 2–3 → `REQUEST_ALREADY_OPEN`; reqs 4–5 → `RATE_LIMITED` | Pass |

`REQUEST_ALREADY_OPEN` (not a leak of the code) confirms knowing a number never reveals an
existing request. Note: `app_private.caller_ip()` uses request headers (forgeable when no trusted
proxy overwrites them), but per-phone / per-code limits still apply and `throttle_public_lead`
caps total volume — this matches the already-documented SEC-005 observation and is not re-raised.
One QA-T connect request (`PR-XRZQ-VTG3`, society name "QA-T RL Probe 1") was created as test data.

**Status: Pass.** Evidence: `docs/qa/evidence/sec2/ratelimit.txt`.

---

## 8. Source maps and public env

Dev server (`next dev`): `.js.map` files are served (sample chunk `.js` → 200, `.js.map` → 200);
`apps/web/.next/static` holds 249 `.map` files. This is expected in development.

Public env: the only `NEXT_PUBLIC_*` names in source are `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` — all safe to expose. A direct scan of the
client bundle for the **actual values** of `SERVICE_ROLE_KEY`, `SECRET_KEY` and `JWT_SECRET`
found **none**; only the public anon key is present (12 files). The `SERVICE_ROLE`/`service_role`
string matches in the bundle are library comments and dev source-map text (env *names*, not
values).

**Must be re-checked on a production build** (not run here — QA rules forbid `next build`): confirm
`.map` files are not served and that no server-only env is inlined. On the current dev build no
secret value leaks.

**Status: Pass for public env; source maps Partial** (dev serves them as expected; prod build
re-check required). Evidence: `docs/qa/evidence/sec2/sourcemaps.txt`.

---

## 9. Error message leakage

| Trigger | Response to client | Leak? |
|---|---|---|
| `GET /rest/v1/profiles` as anon | `401 {"code":"42501","message":"permission denied for table profiles"}` | Terse PostgREST error; exposes table name only |
| Malformed JSON body to RPC | `400 {"code":"PGRST102","message":"Empty or invalid json"}` | No internals |
| Wrong-type RPC args | `200 {"error":"REQUEST_NOT_FOUND"}` | Clean app error |
| `GET /dashboard` unauthenticated | `307` redirect to `/dev-login?next=/dashboard` | No leak (note: `/dev-login` is the dev backdoor, SEC-001/002) |
| Bad web route param `/c/%00%ff` | no stack trace / SQL in body | No leak |

No stack traces or SQL statements reached the browser. PostgREST does surface table/column names
and error codes (e.g. `42703 column ... does not exist`) because the browser calls Supabase
directly; this is low-signal and inherent to the architecture. In dev, Next.js error bodies are
verbose (RSC flight includes `"env":"Server"`, `"b":"development"`); **production build must be
confirmed** to emit digest-only errors.

**Status: Pass** (no stack-trace/SQL leakage observed; prod build re-check recommended).
Evidence: `docs/qa/evidence/sec2/errors.txt`.

---

## 10. Logout / token invalidation

Sequence as own 9000000029: obtain session → confirm token works → `POST /auth/v1/logout?scope=global`
(204) → reuse the **same access token**.

| After global logout | Result |
|---|---|
| `GET /auth/v1/user` (GoTrue) | `403 session_not_found` — session revoked ✔ |
| `POST /auth/v1/token?grant_type=refresh_token` | `400` — refresh token revoked ✔ |
| `GET /rest/v1/society_memberships` (data API) | **`200`** — token still accepted (FAIL) |
| `POST /rest/v1/rpc/resident_dashboard` (data API) | **`NOT_A_MEMBER`** (function executed, so JWT accepted) (FAIL) |

The access JWT (`ttl = 3600 s`, carries `session_id`) **remains valid against the PostgREST data
API for up to its 1-hour lifetime after logout**, because PostgREST validates the JWT signature
statelessly and does not consult GoTrue session state. GoTrue's own `/user` and the refresh grant
are correctly revoked. A stolen access token therefore keeps full data access for up to ~1 hour
after the user logs out. This compounds SEC-007 (auth cookie is not HttpOnly and lives 400 days).

**Status: Fail → SEC-010 (Medium).** Evidence: `docs/qa/evidence/sec2/logout.txt`.

---

## Summary of new findings (this file)

| ID | Severity | Title |
|---|---|---|
| SEC-010 | Medium | Access token not invalidated on logout — reusable against the PostgREST data API until it expires (~1 h); refresh token and GoTrue session are correctly revoked |
| SEC-011 | Low | Supabase REST returns `Access-Control-Allow-Origin: *` to arbitrary origins (no credentials); ensure production never pairs a wildcard ACAO with `Allow-Credentials: true` |
| SEC-012 | Low | Proof/attachment bucket MIME check trusts the declared `Content-Type`, not the bytes (same class as CORE-007); exe payload with a declared allowed MIME would be accepted — live member-context confirmation still outstanding |
| SEC-013 | Low | Production build not verifiable here: must confirm no `.map` files are served and errors are digest-only (dev serves source maps and verbose RSC error bodies, as expected in dev) |
