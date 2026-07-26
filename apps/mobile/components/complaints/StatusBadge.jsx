// StatusBadge — color-coded pill for complaint status.
//
// Visual contract per 04-UI-SPEC.md Status Badge Colors table:
//   open         → neutral.100 bg / neutral.600 text / no border
//   checking     → brand.50 bg / brand.500 text / 1px brand.500 border
//   will_resolve → brand.50 bg / brand.500 text / 1px brand.500 border (same as checking)
//   need_info    → #fffbeb bg / warning.500 text / 1px warning.500 border
//   resolved     → #ecfdf5 bg / success.500 text / 1px success.500 border
//
// Label text comes from i18n `response.*` (or `complaint.open` for "Open").
// Accessibility: the label text is rendered alongside color so color is never the sole signal.

import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const STATUS_STYLES = {
  open: { bg: "#f5f5f5", text: "#525252", border: "transparent" },
  checking: { bg: "#f5f7ff", text: "#12715A", border: "#12715A" },
  will_resolve: { bg: "#f5f7ff", text: "#12715A", border: "#12715A" },
  need_info: { bg: "#fffbeb", text: "#f59e0b", border: "#f59e0b" },
  resolved: { bg: "#ecfdf5", text: "#047857", border: "#047857" },
};

// Map DB enum → i18n key under `response.*` (which already has all four actionable labels).
// "open" has no response label; we use a synthetic "Open" string.
function resolveLabel(t, status) {
  if (status === "open") return "Open";
  if (status === "checking") return t("response.checking");
  if (status === "will_resolve") return t("response.willResolve");
  if (status === "need_info") return t("response.needInfo");
  if (status === "resolved") return t("response.resolved");
  return status;
}

/**
 * Status pill.
 *
 * @param {{ status: 'open'|'checking'|'will_resolve'|'need_info'|'resolved' }} props
 */
export function StatusBadge({ status }) {
  const { t } = useTranslation("complaints");
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  const label = resolveLabel(t, status);

  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        borderWidth: style.border === "transparent" ? 0 : 1,
        alignSelf: "flex-start",
      }}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <Text className="text-sm" style={{ color: style.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Export the style map so other components (ComplaintCard left stripe) can pick the
// same accent color without duplicating the table.
export const STATUS_ACCENT = {
  open: "#e5e5e5", // neutral.200 — softer than the badge text color for a calm stripe
  checking: "#12715A",
  will_resolve: "#12715A",
  need_info: "#f59e0b",
  resolved: "#047857",
};
