// /join/code — share-link landing (e.g. /join/code?code=PAR7-XKM2).
//
// The legacy code-entry form called validate_society_code / list_society_structure
// and redeem_society_code, all revoked by migration 054. The live join flow is
// the /onboarding wizard (onboard_flats_for_code → onboard_resident), which
// takes the code as a prefill. A signed-out visitor is sent to sign in by the
// (protected) layout first; anyone already in a society is sent on to the
// dashboard by /onboarding.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { onboardingHrefForCode } from "../../../../lib/join-link";

export const dynamic = "force-dynamic";

export default async function JoinCodePage({ searchParams }) {
  const query = (await searchParams) ?? {};
  redirect(onboardingHrefForCode(query.code));
}
