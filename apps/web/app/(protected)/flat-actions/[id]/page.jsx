// /flat-actions/[id] — SSR flat-action detail (web). UI-SPEC Screen 2b.
//
// Server component:
//   1. Validates session + reads societyId + role from JWT app_metadata.
//   2. getFlatAction(supabase, id) — RLS gates visibility (D-05): a member sees only
//      their own flat's action; a board member sees any. Not visible → not-found.
//   3. Signs the fine PDF (1h) server-side for the FineDetailBlock pill.
//   4. Resolves isAdmin (gates Waive — D-04 / T-06-32) + isMemberResident (the
//      caller's own flat is the target — gates Acknowledge).
//   5. Hands off to FlatActionDetailClient (Realtime status flip).

import { FLAT_ACTIONS_BUCKET, getFlatAction } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { FlatActionDetailClient } from "../../../../components/flat-actions/FlatActionDetailClient";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { getServerT } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { DetailNotFound, logLoadError } from "../../_components/DetailNotFound";

export const dynamic = "force-dynamic";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default async function FlatActionDetailPage({ params }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  const { id } = await params;

  let detail = null;
  let loadFailed = false;
  try {
    detail = await getFlatAction(supabase, id);
  } catch (err) {
    loadFailed = true;
    logLoadError("flat-action-detail", err);
  }

  if (!detail?.action) {
    const { t } = await getServerT(["flat-actions", "auth"]);
    return (
      <DetailNotFound
        title={t("flatAction.notFoundTitle")}
        body={t("flatAction.notFoundBody")}
        errorText={loadFailed ? t("auth:common.loadFailed") : null}
        backHref="/flat-actions"
        backLabel={t("flatAction.backToList")}
      />
    );
  }

  // Sign the fine PDF (if any) server-side.
  let pdf = null;
  const att = detail.attachments?.[0];
  if (att?.storage_key) {
    try {
      const { data } = await supabase.storage
        .from(FLAT_ACTIONS_BUCKET)
        .createSignedUrl(att.storage_key, 3600);
      pdf = {
        url: data?.signedUrl ?? null,
        fileName: att.storage_key.split("/").pop() ?? "bylaw.pdf",
      };
    } catch {
      pdf = null;
    }
  }

  const isBoard = BOARD_ROLES.has(role);
  const isAdmin = ADMIN_ROLES.has(role);

  // Resolve whether the caller's own flat is the target flat (gates Acknowledge).
  let isMemberResident = false;
  if (!isBoard) {
    try {
      const { data: membership } = await supabase
        .from("society_memberships")
        .select("flat_id")
        .eq("user_id", user.id)
        .eq("society_id", societyId)
        .eq("status", "active")
        .maybeSingle();
      isMemberResident = !!membership?.flat_id && membership.flat_id === detail.action.flat_id;
    } catch {
      isMemberResident = false;
    }
  }

  return (
    <FlatActionDetailClient
      action={detail.action}
      pdf={pdf}
      isAdmin={isAdmin}
      isMemberResident={isMemberResident}
      isBoard={isBoard}
    />
  );
}
