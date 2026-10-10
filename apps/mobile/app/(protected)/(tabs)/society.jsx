// apps/mobile/app/(protected)/(tabs)/society.jsx
// Society profile — authorities only. Mobile port of apps/web/app/(protected)/
// society: society card + stats + wings → flats → residents (with Add wing),
// gate guards, and amenities. Same queries as the website's server page.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authorityOnly } from "../../../components/AuthorityOnly";
import { PageHeader } from "../../../components/kit";
import { AmenitiesSection } from "../../../components/society/AmenitiesSection";
import { GuardsSection } from "../../../components/society/GuardsSection";
import { SocietyOverview } from "../../../components/society/SocietyOverview";
import { getSupabase } from "../../../lib/supabase";
import { useMyContext } from "../../../lib/use-my-context";

function composeAddress(s) {
  const parts = [s.address_line, s.landmark, s.city, s.state, s.pincode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : (s.address ?? "").trim();
}
const byNumber = (a, b) =>
  String(a.number).localeCompare(String(b.number), undefined, { numeric: true });

async function loadProfile(societyId) {
  const supabase = getSupabase();
  const [{ data: soc }, { data: codeRow }, { data: wings }, { data: flats }, { data: members }] =
    await Promise.all([
      supabase
        .from("societies")
        .select("id, name, address, address_line, city, landmark, state, pincode")
        .eq("id", societyId)
        .maybeSingle(),
      supabase
        .from("society_codes")
        .select("code")
        .eq("society_id", societyId)
        .is("revoked_at", null)
        .limit(1)
        .maybeSingle(),
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
  let occupied = 0;
  for (const f of flats ?? []) {
    const residents = residentsByFlat.get(f.id) ?? [];
    if (residents.length) occupied += 1;
    const list = flatsByWing.get(f.wing_id) ?? [];
    list.push({ id: f.id, number: f.number, residents });
    flatsByWing.set(f.wing_id, list);
  }
  const wingsOut = (wings ?? [])
    .map((w) => ({ id: w.id, name: w.name, flats: (flatsByWing.get(w.id) ?? []).sort(byNumber) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return {
    society: soc
      ? { id: soc.id, name: soc.name, address: composeAddress(soc), code: codeRow?.code ?? null }
      : { id: societyId, name: "", address: "", code: null },
    structure: {
      wings: wingsOut,
      counts: {
        residents: (members ?? []).length,
        wings: (wings ?? []).length,
        flats: (flats ?? []).length,
        occupied,
      },
    },
  };
}

function SocietyProfileScreen() {
  const { t } = useTranslation(["auth", "dashboard"]);
  const { societyId } = useMyContext();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!societyId) return;
    setData(await loadProfile(societyId));
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator color="#12715A" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <ScrollView
        contentContainerClassName="px-5 pt-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <PageHeader
          backLabel={t("dashboard:nav.home")}
          backHref="/(protected)/(tabs)"
          title={t("profile.societyProfile")}
          description={t("profile.societyProfileLead")}
        />
        <View className="gap-8">
          <SocietyOverview society={data.society} structure={data.structure} onChanged={load} />
          <GuardsSection societyId={societyId} />
          <AmenitiesSection societyId={societyId} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Authorities only — same as the website (others go back to Home).
export default authorityOnly(SocietyProfileScreen);
