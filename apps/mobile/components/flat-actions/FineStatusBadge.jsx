// FineStatusBadge — outstanding / acknowledged / waived pill + the derived,
// VISUAL-ONLY overdue red state.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { isOverdue } from "../../lib/fine-overdue";

const STATUS_STYLES = {
  outstanding: { bg: "#fffbeb", text: "#f59e0b", border: "#f59e0b" },
  acknowledged: { bg: "#ecfdf5", text: "#047857", border: "#047857" },
  waived: { bg: "#f5f5f5", text: "#525252", border: "transparent" },
  // Derived display-only state (not a DB value).
  overdue: { bg: "#fef2f2", text: "#c81e1e", border: "#c81e1e" },
};

function resolveLabel(t, displayStatus) {
  if (displayStatus === "outstanding") return t("flatAction.statusOutstanding");
  if (displayStatus === "acknowledged") return t("flatAction.statusAcknowledged");
  if (displayStatus === "waived") return t("flatAction.statusWaived");
  if (displayStatus === "overdue") return t("flatAction.statusOverdue");
  return displayStatus;
}

/**
 * Fine status pill.
 *
 * @param {{
 *   status: 'outstanding'|'acknowledged'|'waived',
 *   dueDate?: string|number|Date|null,
 *   nowMs?: number,
 * }} props
 */
export function FineStatusBadge({ status, dueDate = null, nowMs = Date.now() }) {
  const { t } = useTranslation("flat-actions");
  // Derive overdue ONLY for display — never mutate or persist anything.
  const displayStatus =
    status === "outstanding" && isOverdue(status, dueDate, nowMs) ? "overdue" : status;

  const style = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.outstanding;
  const label = resolveLabel(t, displayStatus);

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
      accessibilityLabel={`Fine status: ${label}`}
    >
      <Text className="text-sm" style={{ color: style.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
