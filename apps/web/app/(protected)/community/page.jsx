// /community — SSR initial community feed (web). UI-SPEC Screen 4.
//
// Server component:
//   1. Validates session + reads societyId + role + userId from JWT app_metadata.
//   2. listPosts(supabase) — RLS scopes to the society + filters hidden/deleted
//      rows SERVER-SIDE (D-03). The client renders the result as-is (NO hide logic).
//   3. Hands off to CommunityFeedClient (CSR Realtime; admin ShieldAlert → moderation).

import { listPosts } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { CommunityFeedClient } from "../../../components/community/CommunityFeedClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  let initialPosts = [];
  let loadError = null;
  try {
    initialPosts = await listPosts(supabase, { limit: 50 });
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  return (
    <CommunityFeedClient
      initialPosts={initialPosts}
      societyId={societyId}
      role={role}
      userId={user.id}
      loadError={loadError}
    />
  );
}
