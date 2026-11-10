# Parisar QA: Shared Brief for Testers

Read this before doing anything. It applies to every tester on this QA pass.

## Goal

Test Parisar as a real product and document what actually works. Each tester owns one area and writes its files under `docs/qa/`. A final step merges everything into the deliverables and a PDF.

## Environment

- Repo: `/home/nexapp/Documents/personal/parisar`, branch `feat/saas-onboarding`. Web: Next.js 15 (JavaScript), backend: Supabase (Postgres RPCs + row-level security). Read `docs/onboarding/API.md` and `docs/onboarding/REPORT.md` first.
- **Web app is already running** at http://localhost:3000 (dev server). Do not start another server and do not run `next build`.
- Local Supabase API at http://127.0.0.1:54321. Get keys from `supabase status -o env` inside scripts; **never print keys or the contents of `apps/web/.env.local`**.
- Dev login: phone `+91 90000 000NN`, OTP `123456`. Returning users may be asked for a PIN; set PIN `1357` when asked (record which accounts you set it on).
- Browser automation: install Playwright **outside the repo** in your own folder under `/tmp/claude-1000/-home-nexapp-Documents-personal-parisar/f8c5d3b8-f794-42ac-b54f-2d6d8c8a59cb/scratchpad/<your-area>/`, and launch with `executablePath: '/usr/bin/google-chrome'`. Save evidence screenshots to `docs/qa/evidence/<your-area>/`.

## Hard safety rules

1. **Never** run `supabase db reset`, `supabase stop`, the `tests/isolation` suite, or any SQL `DELETE`/`TRUNCATE`/`DROP` on existing data. The old isolation helper wipes all societies. A backup is at `~/parisar-backups/`, but do not rely on it.
2. Create new test data only, with names starting `QA-T ` (e.g. `QA-T Lotus Society`). Use only your allocated phone numbers.
3. Do not edit application code, migrations or config. This is a testing pass: record bugs, do not fix them.
4. No git commits.
5. Read-only SQL (`select`) via `docker exec supabase_db_parisar psql -U postgres -d postgres` is allowed for database verification. Role simulation with `set local role authenticated; set local request.jwt.claims ...` must be inside `begin; ... rollback;`.
6. Do not claim a test passed unless you executed it and saw the result. Mark it `Not Tested` otherwise, with the reason.
7. Write your output files **as you go** (after each module), not only at the end: the session may be interrupted.

## Phone numbers by tester

| Tester | Own numbers (create new data) | Existing accounts you may use read-mostly |
|---|---|---|
| onboarding | 9000000001, 9000000002, 9000000023, 9000000024 | 14 (authority of QA Sunrise Heights), 15, 16, 30 (platform admin) |
| core-modules | 9000000025, 9000000026 | 14-21 (QA Sunrise Heights: authorities 14-16, owners 17-18, tenant 19, household 20, family 21) |
| roles-api | 9000000003, 9000000004, 9000000006, 9000000007, 9000000027 | all of the above, read only |
| security-perf | 9000000009, 9000000028, 9000000029 | all of the above, read only |

Number 30 is the platform admin. The console is at `/c/<routeId>`; find the route from `apps/web/app/c/[routeId]/page.jsx` or the admin login flow.

## Output formats

**Markdown:** plain, specific, tester-executable. Each test case: ID, title, preconditions, steps, test data, expected result, actual result, status (`Pass`, `Fail`, `Blocked`, `Not Tested`), evidence path.

**Field/button rows** (`docs/qa/data/fields-<area>.json`): a JSON array of objects with keys
`module, screen, route, role, element_kind ("field"|"button"), name, type, mandatory, placeholder, default, allowed_values, validation, min_len, max_len, invalid_behavior, error_message, db_mapping, expected_action, actual_action, api_called, success_behavior, failure_behavior, status, notes`. Use "" for keys that do not apply.

**Bugs** (`docs/qa/data/bugs-<area>.json`): a JSON array with keys
`id (e.g. ONB-001), module, screen, title, steps, expected, actual, severity (Critical|High|Medium|Low), priority (P0|P1|P2|P3), environment, screenshot, api_error, status ("Open")`.

**Feature status** (`docs/qa/data/features-<area>.json`): JSON array with keys `module, feature, classification, evidence, notes`. `classification` is one of: Fully Working, Partially Working, UI Only, Backend Only, Not Working, Not Implemented, Blocked, Not Tested.

**Counts** (`docs/qa/data/counts-<area>.json`): `{ "test_cases": n, "passed": n, "failed": n, "blocked": n, "not_tested": n }`. These must equal what your markdown records.
