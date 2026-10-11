// apps/mobile/components/dashboard/SocietyHeaderPill.jsx
// The home screen's title — matches the website's SocietyHeaderPill: a small
// brand-tinted building mark next to the society name in brand green. (The old
// "· N% joined" suffix was removed on the website at the user's request.)
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Building2 } from "lucide-react-native";
import { Text, View } from "react-native";

/**
 * @param {object} props
 * @param {string} [props.societyName]
 */
export function SocietyHeaderPill({ societyName }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
        <Building2 size={20} color="#0E5A48" />
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="flex-1 text-xl font-semibold capitalize text-brand-700"
      >
        {societyName || " "}
      </Text>
    </View>
  );
}
