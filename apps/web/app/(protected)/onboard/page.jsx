// /onboard — RETIRED role picker.
//
// It inserted into `profiles` directly (revoked by migration 054) and sent
// "secretaries" to the self-serve society wizard, which no longer exists —
// societies are created by Parisar staff and their authorities sign in with a
// code. The /onboarding wizard captures the resident's name (upsert via
// onboard_resident), so old links land there.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";

export default function LegacyOnboardPage() {
  redirect("/onboarding");
}
