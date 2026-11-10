// /staff/manage/<id> — edit a staff member and their ID proof (managers only).
// manager_get_staff returns STAFF_NOT_FOUND for another society's record and for
// one that does not exist, so both 404 the same way.
// JavaScript only — no TypeScript per CLAUDE.md.

import { managerGetStaff } from "@parisar/api-client";
import { notFound, redirect } from "next/navigation";
import { StaffForm } from "@/components/staff/StaffForm";
import { StaffLoadError } from "@/components/staff/StaffLoadError";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditStaffPage({ params, searchParams }) {
  const { id } = await params;
  const { created } = (await searchParams) ?? {};
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/staff");

  let staff;
  try {
    staff = await managerGetStaff(supabase, id);
  } catch (err) {
    console.error("[staff] get failed:", err?.message ?? err);
    return <StaffLoadError />;
  }
  if (!staff || staff.error || staff.society_id !== societyId) notFound();

  return (
    <StaffForm societyId={societyId} userId={user.id} staff={staff} justCreated={created === "1"} />
  );
}
