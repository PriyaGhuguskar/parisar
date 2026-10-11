// /join/profile — RETIRED legacy join step.
//
// Its form called redeem_society_code + direct family_members inserts, both
// revoked by migration 054. The /onboarding wizard does join + name + family in
// one onboard_resident call.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";

export default function LegacyJoinProfilePage() {
  redirect("/onboarding");
}
