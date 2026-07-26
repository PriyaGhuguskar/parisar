// /community/moderation — Secretary moderation queue + audit log (web). UI-SPEC
// Screen 8. THE ONLY web surface that renders hidden content (D-03 / DD2).
//
// Server component:
//   1. Validates session + reads societyId + role from JWT app_metadata.
//   2. ADMIN-GATE (T-06-27 defence in depth): non-admin roles redirect to /community.
//      listModerationQueue + the restore/takedown RPCs are also admin-gated server-side.
//   3. listModerationQueue (hidden, not-taken-down posts+comments) + listAuditLog.
//   4. Hands off to ModerationClient (Realtime + Restore/Takedown).

import { listAuditLog, listModerationQueue } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { ModerationClient } from "../../../../components/community/ModerationClient";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default async function ModerationPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  // Admin-gate: only the Secretary/Co-Secretary moderate (COMM-04/06).
  if (!ADMIN_ROLES.has(role)) redirect("/community");

  let initialQueue = { posts: [], comments: [] };
  let initialAudit = [];
  let loadError = null;
  try {
    initialQueue = await listModerationQueue(supabase);
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }
  try {
    initialAudit = await listAuditLog(supabase, { limit: 50 });
  } catch {
    initialAudit = [];
  }

  return (
    <ModerationClient
      initialQueue={initialQueue}
      initialAudit={initialAudit}
      societyId={societyId}
      loadError={loadError}
    />
  );
}
