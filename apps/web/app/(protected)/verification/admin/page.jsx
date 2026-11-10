// /verification/admin: resident records for the society's managers (Chairman,
// Secretary, Treasurer). The RPCs check the role again; this is the UI boundary.

import { AdminVerification } from "@/components/verification/AdminVerification";
import { MANAGER_ROLES } from "@/lib/auth/activeSociety";
import { requireSocietyRole } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resident verification — Parisar" };

export default async function AdminVerificationPage() {
  const { societyId } = await requireSocietyRole(MANAGER_ROLES);
  return <AdminVerification societyId={societyId} />;
}
