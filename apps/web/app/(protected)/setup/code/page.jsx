// /setup/code — RETIRED legacy setup-wizard step.
//
// Migration 054 made society creation staff-only (create_society_with_secretary
// and finalize_society_setup are revoked) and revoked the direct table writes
// the old 6-step wizard relied on. A society authority now sets up wings/flats
// on /setup/structure (bootstrap_society_structure) and then joins as a
// resident on /onboarding. Old links and bookmarks land there instead of on a
// form that can only fail. /setup/structure itself redirects anyone who
// doesn't belong there (non-authority, or setup already done) to /dashboard.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";

export default function LegacySetupStepPage() {
  redirect("/setup/structure");
}
