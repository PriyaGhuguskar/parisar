// /flat-actions — SSR initial flat-action list (web). UI-SPEC Screen 2 (member) +
// Screen 3 (board).
//
// Server component:
//   1. Validates session + reads societyId + role from JWT app_metadata.
//   2. listFlatActions(supabase) — RLS scopes per-flat (member sees only their own
//      flat; board sees the society — D-05). The client never filters by flat.
//   3. MEMBER: resolves their own flat_id + label for the privacy subtitle (D-05).
//      BOARD: loads the society's flats for the per-flat filter.
//   4. Hands off to FlatActionsClient (CSR Realtime + role-aware view).

import { listFlatActions } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { FlatActionsClient } from "../../../components/flat-actions/FlatActionsClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

function flatLabel(flat) {
  if (!flat) return "—";
  const wing = flat?.wing?.name ?? "";
  const num = flat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

export default async function FlatActionsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  const isBoard = BOARD_ROLES.has(role);

  let initialActions = [];
  let loadError = null;
  try {
    initialActions = await listFlatActions(supabase, { limit: 50 });
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  // Member: resolve own flat_id + label for the privacy subtitle + Realtime scope.
  let memberFlatId = null;
  let memberFlatLabel = null;
  if (!isBoard) {
    try {
      const { data: membership } = await supabase
        .from("society_memberships")
        .select("flat_id, flat:flat_id ( number, wing:wing_id ( name ) )")
        .eq("user_id", user.id)
        .eq("society_id", societyId)
        .eq("status", "active")
        .maybeSingle();
      memberFlatId = membership?.flat_id ?? null;
      memberFlatLabel = flatLabel(membership?.flat);
    } catch {
      memberFlatId = null;
    }
  }

  // Board: load the society's flats for the per-flat filter.
  let flats = [];
  if (isBoard) {
    try {
      const { data } = await supabase
        .from("flats")
        .select("id, number, wing:wing_id ( name )")
        .eq("society_id", societyId)
        .order("number", { ascending: true });
      flats = data ?? [];
    } catch {
      flats = [];
    }
  }

  return (
    <FlatActionsClient
      initialActions={initialActions}
      societyId={societyId}
      role={role}
      memberFlatId={memberFlatId}
      memberFlatLabel={memberFlatLabel}
      flats={flats}
      loadError={loadError}
    />
  );
}
