// /setup — RETIRED legacy setup-wizard entry.
//
// Society creation is staff-only since migration 054; the authority flow is
// /setup/structure (wings + flats) → /onboarding (join as a resident).
// /setup/structure redirects anyone who doesn't belong there to /dashboard.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";

export default function LegacySetupRootPage() {
  redirect("/setup/structure");
}
