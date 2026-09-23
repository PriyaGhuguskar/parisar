// /admin — kept as a redirect to the console's opaque route.
//
// The console itself moved to /c/<routeId> when Parisar went to six role
// dashboards. This stub stays because /admin is in people's bookmarks, in the
// OTP redirect, and in support notes — silently 404ing them would be worse than
// a hop. It performs no auth check of its own: /c/<routeId> resolves the
// caller's role from the database and bounces anyone who does not belong.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ROUTE_ID, SURFACE } from "@parisar/api-client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  redirect(`/c/${ROUTE_ID[SURFACE.CONSOLE_ADMIN]}`);
}
