// HiddenPendingBanner — the reporter's optimistic "Hidden, pending review" inline state.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Clock } from "lucide-react-native";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Text, View } from "react-native";

export function HiddenPendingBanner() {
  const { t } = useTranslation("community");
  const label = t("community.hiddenPending");

  useEffect(() => {
    try {
      AccessibilityInfo.announceForAccessibility?.(label);
    } catch {
      // best-effort a11y announce
    }
  }, [label]);

  return (
    <View
      className="flex-row items-start gap-3 rounded-xl bg-neutral-100 p-4"
      accessibilityRole="alert"
      accessibilityLabel={label}
    >
      <Clock size={20} color="#6e6e6e" />
      <Text className="flex-1 text-base text-neutral-600">{label}</Text>
    </View>
  );
}
