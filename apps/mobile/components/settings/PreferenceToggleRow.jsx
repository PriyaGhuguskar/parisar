// PreferenceToggleRow — one mute-category row on the Notification Settings screen.
//
// Visual contract per 05-UI-SPEC.md Screen 7 (Section 1 Mute):
//   - min-h-[56px] row: lucide icon (20px neutral.600) + label (Body 16) + RN Switch.
//   - INVERTED semantics (DD-11): the switch shows "notifications ON" (natural mental
//     model). `checked = !muted`; toggling OFF sets the underlying mute_* to true.
//   - Switch ON track: brand.500.
//   - accessibilityLabel "{category} notifications" + accessibilityState checked=!muted.
//
// The parent owns the mute_* boolean; this row just inverts for display and reports
// the NEW muted value via onChangeMuted so the parent can persist mute_x.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Switch, Text, View } from "react-native";

const BRAND_500 = "#12715A";
const NEUTRAL_200 = "#e5e5e5";
const NEUTRAL_600 = "#525252";

/**
 * @param {{
 *   icon: React.ComponentType<{ size: number, color: string }>,
 *   label: string,
 *   muted: boolean,
 *   onChangeMuted: (nextMuted: boolean) => void,
 *   isLast?: boolean,
 * }} props
 */
export function PreferenceToggleRow({ icon: Icon, label, muted, onChangeMuted, isLast = false }) {
  const checked = !muted; // ON = receiving = NOT muted

  return (
    <View
      className={[
        "flex-row items-center gap-3 min-h-[56px] py-2",
        isLast ? "" : "border-b border-neutral-100",
      ].join(" ")}
    >
      <Icon size={20} color={NEUTRAL_600} />
      <Text className="flex-1 text-base text-neutral-900">{label}</Text>
      <Switch
        value={checked}
        onValueChange={(nextChecked) => onChangeMuted(!nextChecked)}
        trackColor={{ false: NEUTRAL_200, true: BRAND_500 }}
        thumbColor="#ffffff"
        accessibilityRole="switch"
        accessibilityLabel={`${label} notifications`}
        accessibilityState={{ checked }}
      />
    </View>
  );
}
