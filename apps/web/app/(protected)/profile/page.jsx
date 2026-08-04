// apps/web/app/(protected)/profile/page.jsx
// Personal profile — "Your details" (editable name + emergency contact) and the
// account menu. Society management now lives on its own /society page.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ProfileClient } from "../../../components/profile/ProfileClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { societyId, role } = await resolveActiveSociety(supabase, user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  let membership = null;
  if (societyId) {
    const { data } = await supabase
      .from("society_memberships")
      .select("id, emergency_contact, flats:flat_id(number, wings:wing_id(name))")
      .eq("user_id", user.id)
      .eq("society_id", societyId)
      .eq("status", "active")
      .maybeSingle();
    membership = data;
  }

  const flatLabel = membership?.flats
    ? [membership.flats.wings?.name, membership.flats.number].filter(Boolean).join("-")
    : null;

  const me = {
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? "",
    phone: profile?.phone ?? (user.phone ? `+${user.phone}` : null),
    flatLabel,
    emergency: membership?.emergency_contact ?? null,
    membershipId: membership?.id ?? null,
  };

  return <ProfileClient userId={user.id} role={role} societyId={societyId} me={me} />;
}
