// /dashboard/code-rotation — rotate / resume the society join code.
//
// Server wrapper: secretary / co-secretary only. A member must never see the
// live code (it is the key to joining the society), so the gate runs before
// any UI ships. The UI itself is CodeRotationClient.jsx.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { MANAGER_ROLES } from "@/lib/auth/activeSociety";
import { requireSocietyRole } from "@/lib/auth/requireRole";
import { CodeRotationClient } from "./CodeRotationClient";

export const dynamic = "force-dynamic";

export default async function CodeRotationPage() {
  const { societyId } = await requireSocietyRole(MANAGER_ROLES);
  return <CodeRotationClient societyId={societyId} />;
}
