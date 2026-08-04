// apps/web/app/(protected)/society/page.jsx
// Society profile — the secretary's management hub: wings/flats/residents, gate
// guards, and amenities (with status). Secretary/co-secretary only; anyone else
// is sent to the dashboard (society data is not theirs to manage).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { SocietyProfileClient } from "../../../components/society/SocietyProfileClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set(["secretary", "co_secretary"]);

function composeAddress(s) {
  const parts = [s.address_line, s.landmark, s.city, s.state, s.pincode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : (s.address ?? "").trim();
}

function byNumber(a, b) {
  return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
}

export default async function SocietyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!MANAGER_ROLES.has(role)) redirect("/dashboard");

  const { data: soc } = await supabase
    .from("societies")
    .select("id, name, address, address_line, city, landmark, state, pincode")
    .eq("id", societyId)
    .maybeSingle();

  const { data: codeRow } = await supabase
    .from("society_codes")
    .select("code")
    .eq("society_id", societyId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  const society = soc
    ? { id: soc.id, name: soc.name, address: composeAddress(soc), code: codeRow?.code ?? null }
    : { id: societyId, name: "Your Society", address: "", code: null };

  const [{ data: wings }, { data: flats }, { data: members }] = await Promise.all([
    supabase.from("wings").select("id, name").eq("society_id", societyId),
    supabase.from("flats").select("id, wing_id, number").eq("society_id", societyId),
    supabase
      .from("society_memberships")
      .select("user_id, flat_id, profiles:user_id(full_name)")
      .eq("society_id", societyId)
      .eq("status", "active"),
  ]);

  const residentsByFlat = new Map();
  for (const m of members ?? []) {
    if (!m.flat_id) continue;
    const list = residentsByFlat.get(m.flat_id) ?? [];
    list.push({ userId: m.user_id, name: m.profiles?.full_name ?? "Member" });
    residentsByFlat.set(m.flat_id, list);
  }

  const flatsByWing = new Map();
  let occupiedFlats = 0;
  for (const f of flats ?? []) {
    const residents = residentsByFlat.get(f.id) ?? [];
    if (residents.length) occupiedFlats += 1;
    const list = flatsByWing.get(f.wing_id) ?? [];
    list.push({ id: f.id, number: f.number, residents });
    flatsByWing.set(f.wing_id, list);
  }

  const wingsOut = (wings ?? [])
    .map((w) => ({ id: w.id, name: w.name, flats: (flatsByWing.get(w.id) ?? []).sort(byNumber) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const structure = {
    wings: wingsOut,
    counts: {
      residents: (members ?? []).length,
      wings: (wings ?? []).length,
      flats: (flats ?? []).length,
      occupied: occupiedFlats,
    },
  };

  return <SocietyProfileClient society={society} structure={structure} />;
}
