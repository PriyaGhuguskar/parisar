import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { PhonePrivacyChip } from "./PhonePrivacyChip";

// ---------------------------------------------------------------------------
// Avatar color palette — cycles by initials hash
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  { bg: "#DCEFE6", text: "#12715A" }, // brand.50 / brand.500
  { bg: "#f0fdf4", text: "#16a34a" }, // green-50 / green-600
  { bg: "#fef3c7", text: "#d97706" }, // amber-50 / amber-600
  { bg: "#fdf2f8", text: "#db2777" }, // pink-50 / pink-600
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

/**
 * MemberRow — a single row in the member directory list.
 *
 * Props:
 *   membership       {object}
 *   currentUserRole  {string}
 *   onPress          {Function}
 */
export function MemberRow({ membership, currentUserRole, onPress }) {
  const router = useRouter();
  const { t } = useTranslation("auth");

  const name = membership?.profiles?.full_name ?? "Member";
  const flatNum = membership?.flats?.number ?? "";
  const wing = membership?.flats?.wings?.name ?? "";
  const flatLabel = [wing, flatNum].filter(Boolean).join("-");
  const residency = membership?.residency ?? membership?.residency_type ?? "";
  const userId = membership?.user_id ?? null;
  const membershipId = membership?.id ?? null;

  const colors = getAvatarColor(name);

  // Secretary and co-secretary get immediate reveal (still via RPC — no bypass)
  const chipMode =
    currentUserRole === "secretary" || currentUserRole === "co_secretary" ? "secretary" : "member";

  function handlePress() {
    if (onPress) {
      onPress(membership);
      return;
    }
    if (membershipId) {
      router.push(`/(protected)/(tabs)/member-detail?id=${membershipId}`);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center px-4 py-3 bg-white border-b border-neutral-100 min-h-[72px]"
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${flatLabel}`}
    >
      {/* Avatar */}
      <View
        className="w-11 h-11 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: colors.bg }}
      >
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
          {initials(name)}
        </Text>
      </View>

      {/* Name + flat + residency */}
      <View className="flex-1 mr-2">
        <Text className="text-base font-semibold text-neutral-900" numberOfLines={1}>
          {name}
        </Text>
        <View className="flex-row items-center gap-1 flex-wrap mt-0.5">
          {flatLabel ? <Text className="text-sm text-neutral-600">{flatLabel}</Text> : null}
          {residency ? (
            <View className="bg-neutral-100 rounded px-1.5 py-0.5">
              <Text className="text-xs text-neutral-600">
                {residency === "owner"
                  ? t("directory.owner")
                  : residency === "tenant"
                    ? t("directory.tenant")
                    : residency}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* PhonePrivacyChip — always calls revealPhone RPC, no bypass */}
      {userId ? <PhonePrivacyChip targetUserId={userId} mode={chipMode} /> : null}
    </Pressable>
  );
}
