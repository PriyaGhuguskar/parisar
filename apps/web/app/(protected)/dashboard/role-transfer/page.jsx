// /dashboard/role-transfer — Secretary hand-off.
//
// Server wrapper: only the live Secretary may open this (transfer_secretary_role
// requires it too). Members / board / co-secretary are redirected before any
// UI ships. The UI itself is RoleTransferClient.jsx.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { requireSocietyRole } from "@/lib/auth/requireRole";
import { RoleTransferClient } from "./RoleTransferClient";

export const dynamic = "force-dynamic";

const SECRETARY_ONLY = Object.freeze(["secretary"]);

export default async function RoleTransferPage() {
  const { societyId } = await requireSocietyRole(SECRETARY_ONLY);
  return <RoleTransferClient societyId={societyId} />;
}
