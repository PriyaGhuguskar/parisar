import { transferSecretaryRole } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertOctagon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { DestructiveConfirmDialog } from "../../../components/shared/DestructiveConfirmDialog";
import { useAuthStore } from "../../../lib/auth-store";
import { getSupabase } from "../../../lib/supabase";

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  { bg: "#DCEFE6", text: "#12715A" },
  { bg: "#f0fdf4", text: "#16a34a" },
  { bg: "#fef3c7", text: "#d97706" },
  { bg: "#fdf2f8", text: "#db2777" },
];

function getAvatarColor(name = "") {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// EligibleMemberRow — radio-selectable row for role transfer candidate
// ---------------------------------------------------------------------------
function EligibleMemberRow({ membership, selected, onSelect }) {
  const name = membership?.profiles?.full_name ?? "Member";
  const flatNum = membership?.flats?.number ?? "";
  const wing = membership?.flats?.wings?.name ?? "";
  const flatLabel = [wing, flatNum].filter(Boolean).join("-");
  const role = membership?.role ?? "";
  const colors = getAvatarColor(name);

  return (
    <Pressable
      onPress={() => onSelect(membership)}
      className="flex-row items-center gap-3 py-3 border-b border-neutral-100"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {/* Radio indicator */}
      <View
        className={`w-5 h-5 rounded-full border items-center justify-center ${
          selected ? "border-brand-500 bg-brand-500" : "border-neutral-200"
        }`}
      >
        {selected ? <View className="w-2 h-2 rounded-full bg-white" /> : null}
      </View>

      {/* Avatar */}
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.bg }}
      >
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>
          {initials(name)}
        </Text>
      </View>

      {/* Name + flat + role chip */}
      <View className="flex-1">
        <Text className="text-base font-medium text-neutral-900" numberOfLines={1}>
          {name}
        </Text>
        <View className="flex-row items-center gap-1 flex-wrap mt-0.5">
          {flatLabel ? <Text className="text-sm text-neutral-600">{flatLabel}</Text> : null}
          <View className="bg-neutral-100 rounded-full px-2 py-0.5">
            <Text className="text-xs text-neutral-600 capitalize">{role.replace(/_/g, " ")}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// RoleTransferScreen
// ---------------------------------------------------------------------------
export default function RoleTransferScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const session = useAuthStore((s) => s.session);
  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const currentUserId = session?.user?.id ?? null;

  // Secretary's own full name — needed for DestructiveConfirmDialog typed-name gate
  const [secretaryName, setSecretaryName] = useState("");
  const [eligible, setEligible] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // selected membership
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // ---------------------------------------------------------------------------
  // Load eligible candidates (co_secretary, board_member) on focus
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        if (!societyId || !currentUserId) return;
        setLoading(true);
        setError(null);
        try {
          const supabase = getSupabase();

          const [eligibleRes, selfRes] = await Promise.all([
            // Eligible: co_secretary or board_member, active, not the current user
            supabase
              .from("society_memberships")
              .select(`
                id, user_id, role, status,
                profiles:user_id (full_name),
                flats:flat_id (number, wings:wing_id (name))
              `)
              .eq("society_id", societyId)
              .eq("status", "active")
              .in("role", ["co_secretary", "board_member"])
              .neq("user_id", currentUserId)
              .order("role", { ascending: true }),
            // Secretary's own profile for typed-name gate
            supabase
              .from("profiles")
              .select("full_name")
              .eq("id", currentUserId)
              .single(),
          ]);

          if (eligibleRes.error) throw eligibleRes.error;
          if (!active) return;

          setEligible(eligibleRes.data ?? []);
          setSecretaryName(selfRes.data?.full_name ?? "");
        } catch (err) {
          if (active) setError(err.message ?? "Failed to load eligible members.");
        } finally {
          if (active) setLoading(false);
        }
      }

      load();
      return () => {
        active = false;
      };
    }, [societyId, currentUserId]),
  );

  // ---------------------------------------------------------------------------
  // Handle transfer confirmation
  // transferSecretaryRole calls refreshSession() internally (api-client Plan 02)
  // ---------------------------------------------------------------------------
  async function handleTransferConfirm() {
    if (!selected) return;
    setTransferring(true);
    try {
      await transferSecretaryRole(getSupabase(), selected.user_id);
      setDialogOpen(false);
      // Route to dashboard with banner param — dashboard can show it if desired
      router.replace("/(protected)/(tabs)?transferSuccess=1");
    } catch (err) {
      setError(err.message ?? "Transfer failed.");
      setDialogOpen(false);
    } finally {
      setTransferring(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const selectedName = selected?.profiles?.full_name ?? "";
  const confirmTitle = t("roleTransfer.confirmTitle", { name: selectedName });
  const confirmBody = t("roleTransfer.confirmBody", { name: selectedName });

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pt-12 pb-4 bg-white border-b border-neutral-100">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("roleTransfer.heading")}
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        {/* Warning banner */}
        <View className="border border-danger-500 bg-red-50 rounded-xl p-4 flex-row gap-3 items-start">
          <AlertOctagon size={20} color="#c81e1e" />
          <Text className="text-base text-neutral-700 flex-1">{t("roleTransfer.warning")}</Text>
        </View>

        {/* Error */}
        {error ? (
          <View className="bg-danger-50 border border-danger-200 rounded-xl p-3">
            <Text className="text-sm text-danger-700">{error}</Text>
          </View>
        ) : null}

        {/* Eligible members list */}
        <View className="bg-white rounded-2xl px-4 py-2">
          <Text className="text-xl font-semibold text-neutral-900 py-3">
            {t("roleTransfer.selectLabel")}
          </Text>

          {loading ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="large" color="#12715A" />
            </View>
          ) : eligible.length === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-sm text-neutral-600 text-center">
                No eligible members found. A co-secretary or board member must exist to transfer the
                role.
              </Text>
            </View>
          ) : (
            eligible.map((m) => (
              <EligibleMemberRow
                key={m.id}
                membership={m}
                selected={selected?.id === m.id}
                onSelect={setSelected}
              />
            ))
          )}
        </View>

        {/* Transfer Role button */}
        <Pressable
          onPress={() => selected && setDialogOpen(true)}
          disabled={!selected || transferring}
          className={`h-14 rounded-xl items-center justify-center ${
            selected && !transferring ? "bg-danger-500" : "bg-neutral-200"
          }`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selected }}
        >
          <Text
            className={`text-base font-semibold ${
              selected && !transferring ? "text-white" : "text-neutral-400"
            }`}
          >
            {t("roleTransfer.confirmCta")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Destructive confirm dialog — Secretary types their OWN name */}
      <DestructiveConfirmDialog
        open={dialogOpen}
        onClose={() => !transferring && setDialogOpen(false)}
        title={confirmTitle}
        body={confirmBody}
        confirmMatchText={secretaryName}
        confirmMatchLabel={t("roleTransfer.typedSelfLabel")}
        confirmButtonLabel={t("roleTransfer.confirmCta")}
        cancelLabel={t("roleTransfer.cancel")}
        mismatchError="Name does not match. Type your own name exactly."
        onConfirm={handleTransferConfirm}
        isLoading={transferring}
      />
    </View>
  );
}
