// apps/web/app/(protected)/profile/page.jsx
// Minimal v1 profile page. Full edit screen (name/photo/phone) is Phase 8
// (needs DPDP-compliant edit flow). For 04.1 this page exists so the sidebar
// /profile menu link resolves to a real route, not a 404.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ProfileMenuDropdown } from "@/components/dashboard/ProfileMenuDropdown";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const meta = user.app_metadata ?? {};
  // society_id/role live in the JWT, not the getUser() record — resolve from the
  // active membership so the profile menu's society-scoped actions work.
  const { societyId, role } = await resolveActiveSociety(supabase, user);

  return (
    <main className="bg-neutral-50 min-h-screen px-8 py-6">
      <h1 className="text-2xl font-semibold text-neutral-900 mb-4">Profile</h1>
      <p className="text-neutral-600 mb-6">
        Edit name, photo and phone — coming in a later phase. Use the menu below to sign out or
        transfer Secretary role.
      </p>
      <ProfileMenuDropdown
        userId={user.id}
        societyId={societyId}
        role={role}
        fullName={meta.full_name ?? user.user_metadata?.full_name ?? "Member"}
      />
    </main>
  );
}
