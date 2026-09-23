// /guard — kept as a redirect to the security dashboard's opaque route.
//
// The guard surface moved to /c/<routeId> with the other five. This stub stays
// because apps/web/app/(auth)/verify/page.jsx sends a guard to /guard after the
// claim-and-refresh dance, and because a gate tablet may have it bookmarked.
// No auth check here — /c/<routeId> does it against the database.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ROUTE_ID, SURFACE } from "@parisar/api-client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GuardPage() {
  redirect(`/c/${ROUTE_ID[SURFACE.SECURITY]}`);
}
