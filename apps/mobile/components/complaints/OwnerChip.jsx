// OwnerChip — inline "Owned by Amit (A-102)" pill, used on ComplaintCard.
//
// Visual contract per 04-UI-SPEC.md ComplaintCard spec:
//   neutral.100 bg / neutral.600 text / 14px / px-2 py-0.5 rounded-full
//   User icon 12px + interpolated "complaint.ownedBy" label.
//
// Phase 5 (NoticeCard / notice detail) reuses this verbatim for attribution by
// passing a pre-built `label` string (e.g. notice.postedBy "Posted by Rahul (B-203)").
// When `label` is provided it takes precedence over the complaint.ownedBy template.
//
// Hidden when both ownerName and label are falsy.

import { User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

/**
 * @param {{ ownerName?: string|null, ownerFlat?: string|null, label?: string|null }} props
 */
export function OwnerChip({ ownerName, ownerFlat, label = null }) {
  const { t } = useTranslation("complaints");
  if (!label && !ownerName) return null;

  const flat = ownerFlat ?? "—";
  // Pre-built label (Phase 5 attribution) wins; else the complaint.ownedBy template.
  const text = label ?? t("complaint.ownedBy", { name: ownerName, flat });

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5 bg-neutral-100"
      style={{ alignSelf: "flex-start" }}
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <User size={12} color="#525252" />
      <Text className="text-sm text-neutral-600" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
