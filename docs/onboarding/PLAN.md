# Society Onboarding: Implementation Plan

Shared contract for everyone working on this feature. Read it before writing code.

## Existing architecture (reuse it)

- Monorepo: pnpm + Turbo. `apps/web` is Next.js 15 App Router, **JavaScript only** (no TS). `apps/mobile` is Expo.
- Backend: Supabase (Postgres, Auth, Storage). Business logic lives in `SECURITY DEFINER` RPCs and RLS. There is no separate API server.
- Web UI: Tailwind 4, shadcn/base-ui in `components/ui`, shared pieces in `components/kit`, `lib/fonts.js`.
- Client wrappers: `packages/api-client/src`. Translations: `packages/i18n/locales/{en,hi,mr}`.
- Auth: phone OTP (dev fixed code `123456` for +91 90000 00001-00030, see `supabase/config.toml`) plus PIN for returning users.

### Already built: extend, do not replace

| Brief | Existing |
|---|---|
| Landing page | `app/page.jsx`, `components/landing/*` |
| Connect With Us | `app/enroll`, `EnrollForm.jsx`, `society_enrollment_requests` |
| Platform Admin | `app/admin`, `components/admin/console/*`, `admin_*` RPCs, `platform_features`, `society_features` |
| Register society, code | `admin_create_society`, `generate_society_code`, `CreateSocietySection.jsx` |
| Authorities | `society_authorities`, `claim_society_authority`, `society-dashboard` |
| Structure setup | `setup/structure`, `StructureSetup.jsx`, `bootstrap_society_structure` |
| Resident onboarding | `onboarding`, `OnboardingWizard.jsx`, `onboard_resident` |
| Family | `family_members`, `add_family_members`, `claim_family_membership` |
| Second person on a flat | `pending_review` membership plus `review-queue` |
| Staff, guard | `society_staff`, `society_guards`, `app/guard`, `StaffDirectory.jsx` |
| Visitors, SOS, amenities, notices, polls, complaints | Already implemented |

### Gaps this work fills

Multiple authority numbers and structured schedule on requests; request ID and status; reschedule; registration fields; floors as records with flat attributes; setup-progress tracking with drafts; Excel import pipeline; resident verification statuses and invitation; owner, tenant and family detail records and documents; tenant approval chain; explicit same-flat household flow; staff detail fields; role-based dashboards and feature-gated navigation.

## Decisions

1. **An authority is a person, not a title.** Confirmed by the product owner: an authority may be the chairman or any member chosen to handle the app for their society, and every authority can access the Society Dashboard. Being an authority must not depend on holding a particular society title. **Authority Number means that person's mobile number on the `society_authorities` list.** Possession is proven by OTP to that number; the number alone never grants access.
2. **Roles stay separate.** Resident type (owner, tenant, family), society role (resident, chairman, secretary, treasurer, committee member) and staff role are separate fields. The existing `membership_role` keeps driving permissions and the JWT hook; a new society-title field carries the display role and maps onto it. Do not widen the JWT.
3. **One person, one membership** in a society (the JWT hook issues one role from it).
4. **Modules with no backend are not faked.** Parking, accounting/finance, vendors and events have no real module unless added here. Items for missing modules are hidden from navigation and listed in `docs/onboarding/REPORT.md`. No dead buttons.
5. **Invitations are not sent.** No SMS/email provider is chosen, so invite records are created and the UI offers a copyable link or message and says plainly that nothing was sent automatically. Never display "Invitation sent".
6. **Excel** uses `exceljs`, dynamically imported in the browser so it stays out of the main bundle. All validation and record creation is enforced again server-side in RPCs.
7. **Web first.** `apps/mobile` is out of scope and must not be edited.
8. **Typeface: Inter** as the single UI family with Noto Sans Devanagari for hi/mr. Keep the existing Parisar brand colours as tokens rather than inventing a palette.
9. **Every new user-facing string goes through i18n** in en, hi and mr, in per-domain namespace shards.

## Hard rules

- **No git commits or pushes.** Leave changes in the working tree on `feat/saas-onboarding`.
- **Never run `supabase db reset`**, `supabase stop`, or anything else that drops local data. The local DB holds the user's test data. Apply migrations with `supabase migration up --local --include-all`.
- **Migrations are additive and new files only.** Never edit an existing migration. Use the number range you are allocated.
- **Do not weaken security.** Every new table has RLS. Writes go through `SECURITY DEFINER` RPCs with `set search_path`, explicit auth, role and society checks, and explicit `revoke`/`grant`. `profiles.phone` stays unselectable by clients. Public RPCs are rate limited (see `svc_rate_limit_hit` and `20261011000055`-`57`).
- **Tenant isolation:** no RPC may accept a society id without verifying that the caller belongs to it or is platform staff.
- **Memory is tight (about 2 GB free).** Do not run `next build` or leave a dev server running during parallel work. Run vitest for your own files and `biome check` on your own files. Build and browser testing happen in the QA stage.
- **Stay in your owned paths.** If you need a change elsewhere, record it in your final report.
- Remember [JWT society claims](../../CLAUDE.md): resolve society from `society_memberships` via `lib/auth/activeSociety.js`; call `refreshSession()` after any flow that creates a membership.

## Baseline before this work

- Web: 7 tests failing, 306 passing (pre-existing; see `REPORT.md`). api-client: 244 passing.
- DB migrated to `20261011000057`. A backup exists outside the repo.
