// FlatActionKindBadge — warning / fine / notify pill.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { AlertCircle, AlertTriangle, Bell } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const KIND_STYLES = {
  warning: { bg: "#fffbeb", text: "#f59e0b", border: "#f59e0b", Icon: AlertTriangle },
  fine: { bg: "#fef2f2", text: "#c81e1e", border: "#c81e1e", Icon: AlertCircle },
  notify: { bg: "#f5f7ff", text: "#12715A", border: "#12715A", Icon: Bell },
};

function resolveLabel(t, kind) {
  if (kind === "warning") return t("flatAction.kindWarning");
  if (kind === "fine") return t("flatAction.kindFine");
  if (kind === "notify") return t("flatAction.kindNotify");
  return kind;
}

// Stripe accent per kind — exported so FlatActionCard picks the same color for its
// left accent stripe without duplicating the table.
export const KIND_ACCENT = {
  warning: "#f59e0b",
  fine: "#c81e1e",
  notify: "#12715A",
};

/**
 * @param {{ kind: 'warning'|'fine'|'notify' }} props
 */
export function FlatActionKindBadge({ kind }) {
  const { t } = useTranslation("flat-actions");
  const style = KIND_STYLES[kind] ?? KIND_STYLES.notify;
  const label = resolveLabel(t, kind);
  const Icon = style.Icon;

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        borderWidth: 1,
        alignSelf: "flex-start",
      }}
      accessibilityRole="text"
      accessibilityLabel={`Action type: ${label}`}
    >
      <Icon size={14} color={style.text} />
      <Text className="text-sm" style={{ color: style.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
