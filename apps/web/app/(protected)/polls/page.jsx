// /polls — SSR poll list (the Polls tile is a filtered notices view, DD-1).
//
// A poll is a notice with kind='poll' (DD-1) — this page SSR-fetches via
// listNotices({ pollsOnly: true }) and reuses NoticeListClient in pollsOnly mode.
// Tapping a card opens /notices/[id], where the shared NoticeDetailClient renders
// the embedded PollBlock. No separate poll-detail screen.

import { listNotices } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { NoticeListClient } from "../../../components/notices/NoticeListClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PollsPage() {
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
    initialNotices = await listNotices(supabase, { limit: 30, pollsOnly: true });
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  return (
    <NoticeListClient
      initialNotices={initialNotices}
      societyId={societyId}
      role={role}
      loadError={loadError}
      pollsOnly
    />
  );
}
