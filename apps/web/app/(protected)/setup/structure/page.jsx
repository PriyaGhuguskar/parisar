// /setup/structure — RETIRED. The one-screen wings + flats setup created flats
// with no floor records, which setup_complete (migration 064) cannot accept.
// The step-by-step wizard on /setup replaces it; old links, the dashboard and
// onboarding redirects that still point here land on the wizard, which does its
// own manager check.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyStructurePage() {
  redirect("/setup");
}
