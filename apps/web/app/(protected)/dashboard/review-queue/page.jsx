// /dashboard/review-queue — flat-conflict review queue (secretary / co-secretary).
//
// Server wrapper: role-gates the page BEFORE any UI ships, so a member never
// sees the queue (names + join dates of pending claimants). The UI itself is
// the client component in ReviewQueueClient.jsx.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { MANAGER_ROLES } from "@/lib/auth/activeSociety";
import { requireSocietyRole } from "@/lib/auth/requireRole";
import { ReviewQueueClient } from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const { societyId } = await requireSocietyRole(MANAGER_ROLES);
  return <ReviewQueueClient societyId={societyId} />;
}
