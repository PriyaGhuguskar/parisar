// apps/web/app/(protected)/my-complaints/page.jsx
// Phase 7 Plan 07-08 — WEB-01 dedicated sidebar nav target for the member's
// complaints view.
//
// Re-exports the existing /complaints page default + dynamic export. RLS
// already scopes the data to the member's own complaints (the complaints
// SELECT policy filters by auth.uid()); this route exists purely so the
// sidebar nav target `/my-complaints` (lib/role-tiles.js + AppSidebar) has a
// stable URL without conditionally swapping hrefs per role.
//
// Per RESEARCH.md Open Q2 + UI-SPEC §Screen 6: no new screen design — the
// alias is COSMETIC. The protected layout guard (Plan 07-04 WR-01) still
// applies because this route lives under (protected)/ — missing JWT role
// claim → redirect to /login, same as /dashboard. The complaints page's own
// auth check (`if (!user) redirect("/login")`) is a defensive second layer.
//
// We re-export ONLY `default` and `dynamic` because those are the only
// top-level exports `apps/web/app/(protected)/complaints/page.jsx` exposes
// (no `metadata` export — verified via Read before finalizing).
//
// JavaScript only — no TypeScript per CLAUDE.md.

export { default, dynamic } from "../complaints/page";
