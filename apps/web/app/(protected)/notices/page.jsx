// /notices — SSR initial society-notice list.
//
// Pattern (Phase 4 SSR+CSR split):
//   1. Server component runs a cookie-bound @supabase/ssr server client.
//   2. Pulls initial notices (author + flat + poll marker) via listNotices.
//   3. Hands off to NoticeListClient which subscribes to Realtime INSERT and
//      renders the NoticeCard stack.
//
// Auth/society are validated by middleware + (protected)/layout.jsx upstream; we
// still read JWT app_metadata for role + society_id (role shapes the composer
// affordance: board roles see "New Notice").

import { listNotices } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { NoticeListClient } from "../../../components/notices/NoticeListClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  let initialNotices = [];
  let loadError = null;
  try {
    initialNotices = await listNotices(supabase, { limit: 30 });
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  return (
    <NoticeListClient
      initialNotices={initialNotices}
      societyId={societyId}
      role={role}
      loadError={loadError}
    />
  );
}
