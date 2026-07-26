// apps/mobile/components/dashboard/SocietySwitcherSheet.jsx
// Slide-up RN Modal listing the user's active society memberships.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

const BRAND_500 = "#12715A";

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {Array<{society_id: string, society_name: string}>} props.memberships
 * @param {string|null} props.activeSocietyId
 * @param {(societyId: string) => void} props.onSelect
 * @param {() => void} props.onClose
 */
export function SocietySwitcherSheet({
  visible,
  memberships = [],
  activeSocietyId,
  onSelect,
  onClose,
}) {
  const { t } = useTranslation("dashboard");
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="bg-white rounded-t-3xl p-4 mt-auto"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View
            className="w-12 h-1 bg-neutral-200 rounded-full self-center mb-4"
            accessibilityElementsHidden
          />

          <Text className="text-xl font-semibold text-neutral-900 mb-3">{t("switcher.title")}</Text>

          <ScrollView style={{ maxHeight: 400 }}>
            {memberships.map((m, idx) => {
              const isActive = m.society_id === activeSocietyId;
              return (
                <Pressable
                  key={m.society_id}
                  onPress={() => {
                    if (!isActive) onSelect?.(m.society_id);
                    onClose?.();
                  }}
                  className={[
                    "flex-row items-center py-3",
                    idx < memberships.length - 1 ? "border-b border-neutral-100" : "",
                  ].join(" ")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={m.society_name}
                >
                  <Text className="flex-1 text-base text-neutral-900">{m.society_name}</Text>
                  {isActive ? <Check size={20} color={BRAND_500} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
