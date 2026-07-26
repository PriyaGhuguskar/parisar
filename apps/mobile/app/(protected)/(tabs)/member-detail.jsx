import { removeMember } from "@parisar/api-client";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { PhonePrivacyChip } from "../../../components/directory/PhonePrivacyChip";
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
// Toast helper (simple timed text banner)
// ---------------------------------------------------------------------------
function Toast({ message }) {
  if (!message) return null;
  return (
    <View
      className="absolute bottom-8 left-6 right-6 bg-success-500 rounded-xl px-4 py-3 items-center"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-white text-sm font-medium">{message}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// MemberDetailScreen
// ---------------------------------------------------------------------------
export default function MemberDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { id: membershipId } = useLocalSearchParams();

  const session = useAuthStore((s) => s.session);
  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const currentUserRole = jwtMeta.role ?? "member";

  const [membership, setMembership] = useState(null);
  const [familyCount, setFamilyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState(null);

  // ---------------------------------------------------------------------------
  // Load member data on focus
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        if (!membershipId) return;
        setLoading(true);
        setError(null);
        try {
          const supabase = getSupabase();

          const [memberRes, familyRes] = await Promise.all([
            supabase
              .from("society_memberships")
              .select(`
                id, user_id, flat_id, residency, joined_at, role, status,
                profiles:user_id (full_name),
                flats:flat_id (number, wings:wing_id (name))
              `)
              .eq("id", membershipId)
              .single(),
            supabase
              .from("family_members")
              .select("id", { count: "exact", head: true })
              .eq("membership_id", membershipId),
          ]);

          if (memberRes.error) throw memberRes.error;
          if (!active) return;

          setMembership(memberRes.data);
          setFamilyCount(familyRes.count ?? 0);
        } catch (err) {
          if (active) setError(err.message ?? "Failed to load member.");
        } finally {
          if (active) setLoading(false);
        }
      }

      load();
      return () => {
        active = false;
      };
    }, [membershipId]),
  );

  // ---------------------------------------------------------------------------
  // Remove member — called after DestructiveConfirmDialog confirms
  // ---------------------------------------------------------------------------
  async function handleRemoveConfirm() {
    setRemoving(true);
    try {
      await removeMember(getSupabase(), membershipId);
      setDialogOpen(false);
      setToast(t("removal.success"));
      // Navigate back after short delay so the toast is visible
      setTimeout(() => {
        router.back();
      }, 1200);
    } catch (err) {
      setError(err.message ?? "Failed to remove member.");
      setDialogOpen(false);
    } finally {
      setRemoving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const name = membership?.profiles?.full_name ?? "Member";
  const flatNum = membership?.flats?.number ?? "";
  const wing = membership?.flats?.wings?.name ?? "";
  const flatLabel = [wing, flatNum].filter(Boolean).join("-");
  const residency = membership?.residency ?? membership?.residency_type ?? "";
  const joinedAt = membership?.joined_at
    ? new Date(membership.joined_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const userId = membership?.user_id ?? null;
  const colors = getAvatarColor(name);

  // Chip mode for PhonePrivacyChip
  const chipMode =
    currentUserRole === "secretary" || currentUserRole === "co_secretary" ? "secretary" : "member";

  // Dialog copy with interpolation
  const removalBody = t("removal.warningBody", { name, flat: flatLabel });
  const confirmButtonLabel = t("removal.confirm", { name });
  const mismatchError = t("removal.nameMismatch", { name });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }

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
        <Text className="text-xl font-semibold text-neutral-900 flex-1" numberOfLines={1}>
          {name}
        </Text>
      </View>

      {/* Error banner */}
      {error ? (
        <View className="mx-4 mt-3 bg-danger-50 border border-danger-200 rounded-xl p-3">
          <View className="flex-row items-center gap-2">
            <AlertTriangle size={16} color="#c81e1e" />
            <Text className="text-sm text-danger-700 flex-1">{error}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View className="bg-white rounded-2xl p-6 items-center gap-3">
          {/* Large avatar */}
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.bg }}
          >
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 20 }}>
              {initials(name)}
            </Text>
          </View>

          <Text className="text-xl font-semibold text-neutral-900 text-center">{name}</Text>

          {flatLabel ? <Text className="text-sm text-neutral-600">{flatLabel}</Text> : null}

          {residency ? (
            <View className="bg-neutral-100 rounded-full px-3 py-1">
              <Text className="text-sm text-neutral-600">
                {residency === "owner" ? t("directory.owner") : t("directory.tenant")}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Detail rows card */}
        <View className="bg-white rounded-2xl p-6 gap-4">
          {/* Phone */}
          {userId ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-neutral-600">Phone</Text>
              <PhonePrivacyChip targetUserId={userId} mode={chipMode} />
            </View>
          ) : null}

          {/* Join date */}
          {joinedAt ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-neutral-600">Joined</Text>
              <Text className="text-sm text-neutral-900">{joinedAt}</Text>
            </View>
          ) : null}

          {/* Family members count */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-neutral-600">Family members</Text>
            <Text className="text-sm text-neutral-900">{familyCount}</Text>
          </View>

          {/* Role */}
          {membership?.role ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-neutral-600">Role</Text>
              <View className="bg-brand-50 rounded-full px-3 py-0.5">
                <Text className="text-xs font-medium text-brand-500 capitalize">
                  {membership.role.replace(/_/g, " ")}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Remove action — only for Secretary / Co-secretary */}
        {currentUserRole === "secretary" || currentUserRole === "co_secretary" ? (
          <View className="bg-white rounded-2xl p-6">
            <Pressable
              onPress={() => setDialogOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("directory.removeMember")}
            >
              <Text className="text-base font-semibold text-danger-500 text-center">
                {t("directory.removeMember")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Destructive confirm dialog for removal */}
      <DestructiveConfirmDialog
        open={dialogOpen}
        onClose={() => !removing && setDialogOpen(false)}
        title={t("removal.title")}
        body={removalBody}
        confirmMatchText={name}
        confirmMatchLabel={t("removal.typedNameLabel")}
        confirmButtonLabel={confirmButtonLabel}
        cancelLabel={t("removal.cancel")}
        mismatchError={mismatchError}
        onConfirm={handleRemoveConfirm}
        isLoading={removing}
      />

      {/* Toast */}
      <Toast message={toast} />
    </View>
  );
}
