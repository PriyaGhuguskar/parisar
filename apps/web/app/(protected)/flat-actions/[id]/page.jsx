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
import Link from "next/link";
import { redirect } from "next/navigation";
import { FlatActionDetailClient } from "../../../../components/flat-actions/FlatActionDetailClient";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

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
  let loadError = null;
  try {
    detail = await getFlatAction(supabase, id);
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  if (!detail?.action) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)] flex flex-col items-center justify-center gap-3 px-8 text-center">
        <h2 className="text-xl font-semibold text-[#171717]">Action not found</h2>
        <p className="text-base text-[#525252]">
          This action may have been removed, or you may not have permission to view it.
        </p>
        {loadError ? <p className="text-sm text-[#6e6e6e]">{loadError}</p> : null}
        <Link
          href="/flat-actions"
          className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
        >
          Back to flat actions
        </Link>
      </div>
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
