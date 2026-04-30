<!-- GSD:project-start source:PROJECT.md -->
## Project

**Parisar**

Parisar is a society management platform — a mobile app (iOS/Android) and companion website — that lets Indian residential societies run their day-to-day operations: complaints, notifications/polls, amenity bookings, and flat-level actions (warnings, fines, notices). Two roles drive the system: **Secretary** (sets up the society, takes flat actions, posts notices) and **Member** (joins via society code, files complaints, books amenities, votes in polls). Board Members are members with extra response powers.

**Core Value:** A resident can file a complaint and a board member can resolve it within the app — without WhatsApp groups, paper notices, or lost messages — and the entire society sees a clear, attributed status trail ("Posted by Rahul (B-203)", "Approved by Amit (A-102)").

If everything else fails, this loop must work: **Member → Complaint → Board Member responds → Status updates → Member notified.**

### Constraints

- **Tech stack — Web:** Next.js (App Router) for the companion website.
- **Tech stack — Mobile:** React Native + Expo for iOS/Android.
- **Tech stack — Backend:** Supabase (Postgres + Auth + Realtime + Storage). Single source of truth for both clients.
- **OTP provider:** Decision deferred. Auth must be wrapped in a swappable adapter so that MSG91 / Twilio / Firebase can be plugged in later. Dev environment uses a stub OTP (e.g., `123456`) until provider is chosen.
- **Push:** FCM via Expo Notifications (mobile). Web uses in-app + browser push where supported.
- **i18n:** English, Hindi, Marathi from v1. All user-facing strings localized; no hard-coded copy.
- **Repository layout:** Two codebases (Next.js web and Expo mobile) sharing a common types/API package — pnpm or Turbo monorepo recommended.
- **Compliance:** OTP/SMS sent in India must be DLT-compliant once a provider is chosen. Plan for this in the auth phase.
- **No payments:** Fines are recorded only — no payment gateway, no settlement, no PCI scope.
- **Data isolation:** Strict row-level security per society — a member must never see data from another society.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Side | Purpose | Why Recommended |
|------------|---------|------|---------|-----------------|
| **Next.js** | `15.2.x` (App Router) | web | Companion website framework | Stable since Oct 2024, React 19, Turbopack dev stable, native SSR/RSC support for Supabase auth cookies. Pin to 15.x — do **not** jump to 16 yet (still settling). |
| **React** | `19.x` | web/mobile | UI runtime | Bundled with Next 15 and Expo SDK 55. Use the version each framework ships with — do not upgrade independently. |
| **Expo SDK** | `55.x` | mobile | RN framework + native modules + EAS | SDK 55 (Feb 2026) ships React Native 0.83 and the New Architecture is mandatory and always-on. EAS Build handles FCM credentials, code signing, OTA updates. |
| **React Native** | `0.83.x` (locked by Expo 55) | mobile | Native runtime | Do not upgrade RN independently — Expo pins it. New Arch (Fabric + TurboModules) is on by default in SDK 55+. |
| **Expo Router** | `5.x` (ships with SDK 55) | mobile | File-based routing | Default in `create-expo-app` since SDK 50. Built on React Navigation; auto-generates deep-link config (critical for FCM notification taps). Do **not** hand-wire React Navigation. |
| **TypeScript** | `5.6.x` | shared | Type safety everywhere | Strict mode required. Drives Supabase generated types, Zod schema inference, RHF form types. |
| **Supabase JS** | `@supabase/supabase-js@2.103.x` | shared | DB + Auth + Realtime + Storage client | Single SDK powers both web and mobile. Use generated types from `supabase gen types typescript`. |
| **Supabase SSR** | `@supabase/ssr@0.10.x` | web | Cookie-based auth for Next.js App Router | The deprecated `@supabase/auth-helpers-nextjs` package is end-of-life; **all new projects must use `@supabase/ssr`**. Handles RSC, route handlers, middleware, server actions correctly. |
| **Tailwind CSS** | `4.x` | web | Utility-first styling for the web | v4 ships native CSS variables, zero-config content detection, ~10x faster builds. Pairs with shadcn/ui for the dominant 2026 Next.js UI stack. |
| **shadcn/ui** | latest CLI (copy-in components, no version pin) | web | Accessible Radix-based component primitives | Components live in your repo, not `node_modules` — full ownership, no upstream API fights. CLI now natively initializes against Tailwind v4. |
| **NativeWind** | `4.x` | mobile | Tailwind utility classes for React Native | Best-of-breed RN styling in 2026: compiles utilities ahead-of-time (no runtime cost), reuses Tailwind muscle memory from the web side, works on web/iOS/Android. **Only RN UI lib that lets the team share design tokens with the web.** |
| **TanStack Query** | `@tanstack/react-query@5.100.x` | shared | Server-state caching, mutations, optimistic updates | Wraps every Supabase read/mutate. Gives offline cache, retry, dedupe, optimistic UI for complaint status changes — critical for the realtime-feel bar. v6 is Svelte-only; React stays on v5. |
### Supporting Libraries
#### Forms & Validation
| Library | Version | Side | Purpose | When to Use |
|---------|---------|------|---------|-------------|
| **React Hook Form** | `7.x` | shared | Form state management | Every form (login, society setup, complaint, booking, profile). Uncontrolled inputs → minimal re-renders → smooth keyboard UX on mobile. **Do not use Formik** (perf-heavy, more boilerplate). |
| **Zod** | `4.x` | shared | Schema validation + TS inference | One schema per form/API boundary. Zod 4 is ~14× faster string parsing and 2.3× smaller bundle than v3. `z.infer<typeof Schema>` powers RHF types end-to-end. |
| **@hookform/resolvers** | `5.x` (zod sub-import) | shared | Glue between RHF and Zod | `import { zodResolver } from "@hookform/resolvers/zod"`. |
#### Internationalization (en / hi / mr)
| Library | Version | Side | Purpose | Why |
|---------|---------|------|---------|-----|
| **i18next** | `25.x` | shared | i18n core engine (key lookup, plurals, interpolation) | The cross-platform pick. **Use i18next on BOTH sides instead of next-intl** — even though next-intl is the better Next.js-only choice, sharing the i18n stack with React Native is far more valuable than RSC-native loading. One translation pipeline, one set of keys, one Locize/Crowdin export. |
| **react-i18next** | `16.x` | shared | React bindings (`useTranslation`, `<Trans>`) | Used inside Next.js client components and React Native screens. RSC pages use `i18next` directly via a server-side init helper. |
| **i18next-resources-to-backend** | `1.x` | shared | Lazy-load translation JSON per locale | Avoids shipping all 3 languages in the initial bundle on web. |
| **expo-localization** | bundled in SDK 55 | mobile | Read device locale on RN | `getLocales()[0].languageCode` → seeds i18next default. Combine with AsyncStorage for user override. |
| **@react-native-async-storage/async-storage** | `2.x` (Expo-pinned) | mobile | Persist user-selected language | i18next plugin reads/writes locale here. |
| **@expo-google-fonts/noto-sans-devanagari** | `0.4.x` | mobile | Devanagari script font (covers Hindi + Marathi) | **Critical: do not rely on the device default font for hi/mr.** Indian budget Android devices ship inconsistent Devanagari support; bundling Noto Sans Devanagari guarantees correct rendering of conjuncts (e.g., क्ष, ज्ञ, मराठी matra forms). Load via `useFonts` with the Latin Inter/Noto Sans companion. |
| **next/font/google** (Noto Sans + Noto Sans Devanagari) | built-in | web | Self-hosted web fonts with subset support | Use `next/font/google` to pull Noto Sans Devanagari with `subsets: ['devanagari']`. Self-hosting eliminates Google Fonts CDN risk and FOUT for non-Latin scripts. |
#### Data, Server State & Realtime
| Library | Version | Side | Purpose | Why |
|---------|---------|------|---------|-----|
| **Supabase Realtime** | bundled in `supabase-js` | shared | Postgres CDC subscriptions for complaint/booking/poll updates | Subscribe per-society channel. Combine with TanStack Query's `setQueryData` to push updates into the cache without refetching. |
| **Zustand** | `5.x` | shared | Tiny client-state store | For ephemeral UI state that doesn't belong in TanStack Query: active society id, modal open/close, draft complaint text. **Do not use Redux Toolkit** — overkill for a 2-person team and the domain is server-state-heavy (TanStack Query already covers 80% of state). |
| **date-fns** | `4.x` + locale imports (`hi`, `enIN`) | shared | Date formatting and arithmetic | Tree-shakable per-locale imports. **Marathi locale (`mr`) is supported in date-fns v4** via `import { mr } from 'date-fns/locale'`. Hindi via `import { hi } from 'date-fns/locale'`. Pair with i18next's date formatter. **Do not use Moment** (deprecated) or Day.js (less locale coverage for Indian languages). |
#### Mobile-Specific
| Library | Version | Side | Purpose | Why |
|---------|---------|------|---------|-----|
| **expo-notifications** | bundled in SDK 55 | mobile | Push notification primitives wrapping FCM/APNs | The standard. Token registration, foreground/background handlers, notification taps → deep links via Expo Router. |
| **expo-image-picker** | bundled in SDK 55 | mobile | Camera + gallery for complaint/community-post photos | Handles permissions, returns URI. |
| **expo-image-manipulator** | bundled in SDK 55 | mobile | Resize/compress before upload | **Mandatory for Indian network conditions.** Resize to ≤1600px longest side, JPEG quality 0.7, before pushing to Supabase Storage. Cuts typical 4MB phone photo to <300KB. |
| **expo-file-system** | bundled in SDK 55 | mobile | Read URI as ArrayBuffer for Supabase upload | The Supabase JS client cannot upload a `file://` URI directly — convert via `FileSystem.readAsStringAsync(uri, { encoding: 'base64' })` then `decode(base64)` to ArrayBuffer. (Documented Supabase + Expo gotcha.) |
| **expo-image** | bundled in SDK 55 | mobile | Cached, performant image rendering | Replaces RN's built-in `<Image>`. Disk cache, blurhash placeholders, SVG support. |
| **react-native-reanimated** | `4.x` (Expo-pinned) | mobile | Native-thread animations | Used directly for complaint-status transitions, pull-to-refresh, list item entry. |
| **moti** | `0.30.x` | mobile | Declarative animation API on top of Reanimated | Optional: use for simple `<MotiView>` declarative animations to avoid Reanimated boilerplate. **Reanimated is the foundation; Moti is the convenience layer.** Skip Moti if the team is fluent in Reanimated. |
| **react-native-mmkv** | `3.x` | mobile | High-performance key-value store | Optional but recommended: replaces AsyncStorage for hot-path reads (active society, auth tokens). 30× faster, synchronous. |
#### Web-Specific
| Library | Version | Side | Purpose | Why |
|---------|---------|------|---------|-----|
| **@radix-ui/react-*** | latest (per shadcn install) | web | Accessible primitives under shadcn | Auto-installed by shadcn CLI. Don't install directly. |
| **lucide-react** | `0.4xx.x` | web | Icon set | shadcn default icon set; tree-shakable. |
| **lucide-react-native** | `0.4xx.x` | mobile | Same icon set on RN | Use on the mobile side so icons match across web + mobile. |
| **next-safe-action** or RSC server actions | latest | web | Type-safe server actions for complaint/booking forms | Optional. RSC + server actions is fine without a wrapper for v1. Add `next-safe-action` if forms grow complex. |
#### Cross-Cutting
| Library | Version | Side | Purpose | Why |
|---------|---------|------|---------|-----|
| **@sentry/nextjs** | `9.x` | web | Crash + perf monitoring | Auto source-map upload, Web Vitals, RSC error capture. |
| **@sentry/react-native** | `7.x` (with `@sentry/react-native/expo` config plugin) | mobile | Crash + perf monitoring | Works inside EAS Build. **Do not use the deprecated `sentry-expo` package.** |
| **PostHog** (optional) | `posthog-js` `1.x` web, `posthog-react-native` `4.x` mobile | shared | Product analytics + feature flags | Useful for measuring "did the member-files-complaint loop actually work?". Self-hostable for India data residency. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **pnpm** `9.x` | Package manager + workspaces | Use `pnpm-workspace.yaml`. Symlink-based `node_modules` is the only PM that handles a Next + Expo monorepo cleanly. |
| **Turborepo** `2.x` | Task orchestration + remote cache | Add on top of pnpm workspaces. `turbo run build`, `turbo run lint` per app. Vercel Remote Cache is free and zero-config — `turbo login && turbo link`. |
| **Biome** `2.3.x` | Lint + format in one binary | Single `biome.json` at repo root, every package picks it up automatically. **20× faster than ESLint+Prettier.** Replaces both. |
| **TypeScript project references** | Cross-package type checking | One `tsconfig.base.json` at root, per-package `tsconfig.json` extends it with `references` to `packages/shared`. |
| **Vitest** `2.x` | Unit + integration tests on the web side | Native ESM, ~10× faster than Jest, Jest-compatible API. Use with `@testing-library/react`. |
| **Jest** (Expo preset) bundled with SDK 55 | Unit tests on the RN side | Vitest does not yet have first-class RN support. Stay on Expo's `jest-expo` preset for mobile. **Two test runners is fine** — they target different runtimes. |
| **@testing-library/react** + `@testing-library/react-native` | Component tests | Same query API on both sides. |
| **Maestro** `1.x` | E2E mobile testing | YAML flows, no native build mods, runs against EAS-built dev clients. **Choose Maestro over Detox** for a 2-person team — Detox's gray-box setup cost is not worth it at this scale. |
| **Playwright** `1.x` | E2E web testing | Standard. Run against Vercel preview deployments. |
| **Supabase CLI** `2.x` | Local stack, migrations, type generation | `supabase start` for local dev. `supabase gen types typescript --linked` writes `packages/shared/src/database.types.ts`. |
| **EAS Build / EAS Submit** | Mobile CI/CD | Required for FCM credentials and store submissions. Free tier covers a 2-person team. |
| **Husky** + **lint-staged** | Pre-commit hooks | Run Biome on staged files. |
| **commitlint** with conventional config | Commit message format | Matches `~/.claude/rules/common/git-workflow.md`. |
## Installation
# Bootstrap monorepo
# Set "private": true and "packageManager": "pnpm@9.x" in root package.json
# Web app
# Mobile app
# Shared package (types, supabase client factory, i18n keys, auth adapter interface)
# Root dev tooling
# Supabase local + types
## Repository Structure (Recommended)
## OTP-Adapter Pattern (Deferred Provider)
- Client code never changes when MSG91 ↔ Twilio ↔ Firebase swap happens.
- Supabase keeps owning the OTP value, expiration, and session — you don't reimplement OTP state.
- DLT-compliance burden lives in the Edge Function, not in clients.
- Dev work proceeds with `stub-otp` until the provider decision is made.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **i18next + react-i18next** (cross-platform) | **next-intl** | If web were the only target. next-intl has better RSC ergonomics but no React Native story — splitting i18n stacks across two apps doubles translation-pipeline cost. |
| **NativeWind 4** | **Tamagui** | If the app needed extremely tight web↔native style sharing in a single codebase. Tamagui has the best perf and a real cross-platform compiler, but config-heavy and a separate paradigm from web Tailwind. NativeWind keeps the team on one mental model (Tailwind utility classes everywhere). |
| **NativeWind 4** | **React Native Paper** | If a strict Material Design language is non-negotiable. Paper is heavy and locks UI into MD3 — not appropriate for a custom-branded society app. |
| **NativeWind 4** | **Gluestack UI v3** | If an off-the-shelf accessible component library is more important than design ownership. Gluestack is good but adds a vocabulary the team has to learn; shadcn-equivalents for RN aren't there yet. |
| **Zustand** | **Jotai** | If client state were highly atomic and derived (e.g., complex canvas/drawing). Parisar's client state is simple — Zustand wins. |
| **Zustand** | **Redux Toolkit** | If a 5+ engineer team needed enforced patterns and time-travel debugging. For 2 people, RTK is overhead. |
| **TanStack Query v5** | **SWR** | If the app were read-mostly and barely mutated. Parisar mutates constantly (status changes, votes, approvals) — TanStack's mutation + optimistic-update story is materially better. |
| **Maestro** | **Detox** | If you need gray-box synchronization (animations, network idle) for very flaky flows. Maestro's black-box approach with auto-retry is enough at v1 scale. |
| **Vitest** (web) | **Jest** (web) | If migrating an existing Jest-heavy codebase. Greenfield → Vitest. |
| **Biome** | **ESLint + Prettier** | If you depend on a specific ESLint plugin Biome doesn't yet support (e.g., some niche framework rules). For Next + RN + TS, Biome 2.3 is sufficient. |
| **pnpm workspaces + Turborepo** | **Nx** | If the team grew past 5 packages with code-generation needs. For 2 apps + 1 shared package, Nx's ceremony is wasted. |
| **MSG91** (when chosen) | **Twilio** | If global SMS delivery matters more than India pricing. For Indian-only audience, MSG91 wins on price + DLT compliance. |
| **MSG91** (when chosen) | **Firebase Phone Auth** | If you want to eliminate SMS billing entirely (Firebase handles delivery). Trades cost for vendor lock-in on the auth layer specifically. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@supabase/auth-helpers-nextjs`** | Officially deprecated; bug fixes have moved to `@supabase/ssr`. | `@supabase/ssr` |
| **`sentry-expo`** | Deprecated; replaced by `@sentry/react-native` with the `expo` config plugin. | `@sentry/react-native/expo` |
| **Moment.js** | Frozen, oversized, mutable API. | `date-fns@4` (or Temporal API once stabilized) |
| **`@react-navigation/*` directly** | Working against Expo Router's grain; you lose deep-link auto-config which the FCM tap flow needs. | Expo Router (which is built on top of React Navigation — you still get the components) |
| **Formik** | Heavy re-renders, bigger bundle, poor TypeScript story compared to RHF. | React Hook Form |
| **Yup** | Less powerful TS inference than Zod, separate type+validator definition. | Zod 4 |
| **next-i18next** | Pages-router-era package; `react-i18next` works directly with Next 15 App Router. | `react-i18next` |
| **Day.js** for Indian-language dates | Less curated locale data for `hi`/`mr` plural rules and conjuncts. | `date-fns@4` with `hi` and `mr` locales |
| **Single-codebase RN-Web (Solito / RN Web)** | User explicitly chose two codebases. Don't backslide. | Two apps + shared package via NativeWind for design-token reuse |
| **Hand-rolled OTP state machine on the client** | Reimplements what Supabase Auth already does and creates DLT-compliance leaks. | Supabase Auth Hooks → Edge Function → SMS provider |
| **Bundling all 3 locales eagerly on web** | Wastes ~50-100KB JS for the 2 unused languages on every page. | `i18next-resources-to-backend` for lazy locale loading |
| **Relying on device default font for Devanagari** | Indian budget Android OEM ROMs render conjunct glyphs inconsistently — visible to every Hindi/Marathi user. | Bundle Noto Sans Devanagari via `@expo-google-fonts/noto-sans-devanagari` (mobile) and `next/font/google` with `subsets: ['devanagari']` (web) |
| **Uploading `file://` URI directly to Supabase Storage** | The JS client cannot consume a RN URI as-is — silently fails or sends 0-byte files. | Read via `expo-file-system` → ArrayBuffer → `supabase.storage.upload(buffer)` |
| **Redux Toolkit** for v1 | Boilerplate not justified at this scale. | Zustand for client state, TanStack Query for server state |
| **react-native-paper for screens** | MD3-locked, defeats the custom-branded society feel. | NativeWind + handcrafted components |
| **Auth via custom JWT signing in Edge Functions** | You'd be reimplementing Supabase Auth. | `supabase.auth.signInWithOtp` + Auth Hook for SMS dispatch |
## Stack Patterns by Variant
- Add Nx **on top of** the pnpm+Turbo setup (Nx supports both). Don't migrate package manager.
- Introduce module boundaries via Nx's enforced project graph.
- Reason: code generation + affected detection start paying off at >5 packages.
- Implement the Supabase Send SMS Hook in `supabase/functions/send-sms/index.ts`.
- Pass `template_id` and `dlt_principal_entity_id` from env vars (DLT compliance).
- Keep `stub-otp` provider available behind `EXPO_PUBLIC_OTP_PROVIDER=stub` for E2E tests and demos.
- The Supabase JS client no longer owns the OTP. You'd `signInWithIdToken` after Firebase verifies the OTP on-device.
- Your `OtpProvider` adapter changes shape: `sendOtp` and `verifyOtp` both call Firebase SDK; `verifyOtp` returns a Firebase ID token that you exchange for a Supabase session.
- Document this as a decision branch — implementation is meaningfully different from the MSG91/Twilio path.
- Move read-only public pages (society public landing, login) to RSC with `noStore()` removed and Vercel ISR.
- Keep authenticated dashboards client-side rendered (TanStack Query already handles caching).
- Add `next-pwa` (community plugin) — service worker + manifest. Not in v1 scope but useful for India where app-store install friction is high.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Expo SDK 55 | React Native 0.83.x | Expo pins RN. Do not upgrade RN independently. New Architecture is mandatory and always-on in SDK 55+. |
| Expo SDK 55 | Reanimated 4.x | Use the version Expo installs via `expo install`. |
| Expo SDK 55 | NativeWind 4.x | NativeWind 4 currently expects Tailwind 3 syntax — check NativeWind release notes before bumping to Tailwind 4 on the mobile side. **The web side runs Tailwind 4; the mobile side may run Tailwind 3 — that's OK because they're separate builds.** Keep design tokens in a shared JS object, not a shared `tailwind.config`. |
| Next.js 15.2 | React 19.x | Next 15 requires React 19. |
| Next.js 15.2 | Tailwind 4.x | Fully supported; use `@tailwindcss/postcss` plugin. |
| `@supabase/ssr@0.10` | `@supabase/supabase-js@2.103+` | The SSR package depends on supabase-js v2; bump together. |
| Zod 4 | `@hookform/resolvers@5` | Resolvers v5+ adds Zod 4 support. v4 only supported Zod 3. |
| TanStack Query 5 | React 18 / 19 | Both supported. |
| Sentry React Native 7.x | Expo SDK 55 | Use `@sentry/react-native/expo` config plugin in `app.json`. |
| Biome 2.3 | TypeScript 5.x | Type-aware lint rules require TS 5.x. |
| date-fns 4 | i18next 25 | Independent; date-fns provides locale objects, i18next handles key lookup. |
## Confidence Assessment per Recommendation
| Choice | Confidence | Why |
|--------|------------|-----|
| Next.js 15 App Router | HIGH | Verified npm + official docs, Apr 2026. |
| Expo SDK 55 | HIGH | Expo changelog confirmed `55.0.18` Apr 2026. |
| `@supabase/ssr` | HIGH | Official deprecation notice for auth-helpers verified. |
| `@supabase/supabase-js@2.103.x` | HIGH | npm verified. |
| TanStack Query v5 (React) | HIGH | npm verified `5.100.x` Apr 2026; v6 confirmed Svelte-only. |
| RHF + Zod 4 | HIGH | Both shipped, both have RHF resolver support, community consensus is strong. |
| i18next on both sides | MEDIUM-HIGH | Strong technical justification (one pipeline). next-intl is genuinely better for Next.js alone — willing to defend i18next given the RN constraint. |
| NativeWind 4 | MEDIUM-HIGH | Best 2026 RN styling pick per ecosystem reviews; there's a real Tailwind-version-sync wrinkle vs web that the team must accept. |
| shadcn/ui + Tailwind 4 | HIGH | Verified as the dominant 2026 Next.js UI stack; CLI now Tailwind-4 native. |
| Noto Sans Devanagari | HIGH | Devanagari rendering on Android OEM ROMs is a documented, recurring failure mode. Bundling Noto is the safe default. |
| OTP Adapter via Supabase Auth Hook | HIGH | Supabase officially documents this exact pattern; MSG91 integrations published. |
| pnpm + Turborepo (skip Nx) | HIGH | Industry consensus for sub-5-package monorepos. |
| Biome over ESLint+Prettier | MEDIUM-HIGH | Biome 2.3 covers TypeScript + React; potential gap is RN-specific lint rules — verify before fully removing ESLint. If a critical RN ESLint rule is missing, run Biome for format + a slim ESLint config for RN-specific rules. |
| Maestro over Detox | MEDIUM | Black-box testing is right for v1; revisit if flaky animation-driven flows emerge. |
| Vitest (web) + Jest (mobile) | HIGH | Two runtimes, two best-of-class runners. Don't fight it. |
| Zustand | MEDIUM | Defensible default; could be replaced by `useState` + Context for v1 if desired. Pick is conservative. |
| Moti | LOW-MEDIUM | Reanimated alone is sufficient. Moti is sugar — defer if bundle size is a concern. |
## Sources
- [Next.js 15 release blog](https://nextjs.org/blog/next-15) — verified App Router stable, React 19 support, Turbopack dev stable. **HIGH**
- [Next.js current version article (March 2026)](https://www.abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new) — confirmed 15.2.4 stable. **MEDIUM**
- [Expo SDK 55 npm](https://www.npmjs.com/package/expo) — verified `55.0.18` Apr 2026, RN 0.83, mandatory New Arch. **HIGH**
- [Expo Localization docs](https://docs.expo.dev/versions/latest/sdk/localization/) — verified `expo-localization` API. **HIGH**
- [Expo Router docs](https://docs.expo.dev/router/introduction/) — confirmed default since SDK 50, deep-link auto-config. **HIGH**
- [@supabase/ssr npm](https://www.npmjs.com/package/@supabase/ssr) — verified `0.10.2` Apr 2026 and auth-helpers deprecation. **HIGH**
- [@supabase/supabase-js npm](https://www.npmjs.com/package/@supabase/supabase-js) — verified `2.103.3` Apr 2026. **HIGH**
- [Supabase Send SMS Hook docs](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook) — confirmed Auth Hook → Edge Function → custom provider pattern. **HIGH**
- [Custom SMS auth via SMS Hook + MSG91 (Medium, Dec 2025)](https://medium.com/@shreebhagwat94/implementing-custom-sms-authentication-in-supabase-using-sms-hook-and-msg91-366d13acc81c) — confirmed MSG91 integration is a documented production pattern. **MEDIUM**
- [TanStack Query npm](https://www.npmjs.com/package/@tanstack/react-query) — verified `5.100.5` Apr 2026; v6 React-only confirmed not released. **HIGH**
- [TanStack Query v6 (Svelte) blog](https://medium.com/better-dev-nextjs-react/tanstack-query-v6-breaking-changes-that-actually-improve-your-app-bec0d8e4ed1b) — confirmed v6 is Svelte-only. **MEDIUM**
- [Zod v4 release notes](https://zod.dev/v4) — confirmed Zod 4 stable, perf improvements. **HIGH**
- [react-hook-form/resolvers GitHub](https://github.com/react-hook-form/resolvers) — confirmed Zod 4 + Valibot + ArkType support. **HIGH**
- [next-intl vs i18next vs Lingui (BuildPilot, 2026)](https://trybuildpilot.com/910-next-intl-vs-i18next-vs-lingui-2026) — confirmed cross-platform tradeoff: next-intl wins on Next.js alone, i18next wins on cross-platform reuse. **MEDIUM**
- [@expo-google-fonts/noto-sans-devanagari npm](https://www.npmjs.com/package/@expo-google-fonts/noto-sans-devanagari) — verified package availability. **HIGH**
- [Expo Font docs](https://docs.expo.dev/versions/latest/sdk/font/) — confirmed config plugin (build-time) is preferred over runtime `useFonts`. **HIGH**
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — confirmed CLI initializes with Tailwind 4. **HIGH**
- [NativeWind vs Tamagui vs Unistyles (Medium, Apr 2026)](https://medium.com/react-native-journal/nativewind-vs-tamagui-vs-unistyles-which-styling-library-should-you-use-in-2026-cf4f4d78b76f) — confirmed NativeWind as cross-platform-friendly default. **MEDIUM**
- [Turborepo vs Nx vs Moon (PkgPulse, 2026)](https://www.pkgpulse.com/blog/turborepo-vs-nx-monorepo-2026) — confirmed pnpm + Turbo for sub-5-package repos, Nx for >5 packages or enterprise. **MEDIUM**
- [Biome migration guide (DEV, 2026)](https://dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m) — confirmed Biome 2.3, monorepo config simplicity. **MEDIUM**
- [Vitest vs Jest for Next.js 2026 (DEV)](https://dev.to/whoffagents/vitest-vs-jest-for-nextjs-in-2026-setup-speed-and-when-to-switch-224a) — confirmed Vitest as default for new Next projects. **MEDIUM**
- [Maestro vs Detox (PkgPulse, 2026)](https://www.pkgpulse.com/blog/detox-vs-maestro-vs-appium-react-native-e2e-testing-2026) — confirmed Maestro recommendation for Expo. **MEDIUM**
- [State Management 2026 (DEV)](https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge) — Zustand as pragmatic default. **MEDIUM**
- [Sentry React Native + Expo docs](https://docs.expo.dev/guides/using-sentry/) — confirmed `@sentry/react-native/expo` is the current path; `sentry-expo` deprecated. **HIGH**
- [Supabase + Expo push notifications example](https://github.com/supabase/supabase/blob/master/examples/user-management/expo-push-notifications/README.md) — confirmed Edge Function + DB webhook + Expo Push pattern. **HIGH**
- [date-fns v4 vs Temporal vs Day.js (PkgPulse, 2026)](https://www.pkgpulse.com/guides/date-fns-v4-vs-temporal-api-vs-dayjs-date-handling-2026) — confirmed date-fns 4 as 2026 default with tree-shakable locales. **MEDIUM**
- [Reanimated + Moti relationship (Moti docs)](https://moti.fyi/reanimated) — confirmed Moti is a Reanimated wrapper. **HIGH**
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
