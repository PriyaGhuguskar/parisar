// PostTypeChip — color-coded pill for a community post's type (sell / help / general).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { HelpCircle, MessageCircle, Tag } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const TYPE_STYLES = {
  sell: {
    bg: "#ecfdf5",
    text: "#047857",
    border: "#047857",
    Icon: Tag,
    labelKey: "community.typeSell",
  },
  help: {
    bg: "#fffbeb",
    text: "#f59e0b",
    border: "#f59e0b",
    Icon: HelpCircle,
    labelKey: "community.typeHelp",
  },
  general: {
    bg: "#f5f5f5",
    text: "#525252",
    border: "transparent",
    Icon: MessageCircle,
    labelKey: "community.typeGeneral",
  },
};

/**
 * @param {{ kind: 'sell'|'help'|'general' }} props
 */
export function PostTypeChip({ kind }) {
  const { t } = useTranslation("community");
  const style = TYPE_STYLES[kind] ?? TYPE_STYLES.general;
  const Icon = style.Icon;
  const label = t(style.labelKey);

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        borderWidth: style.border === "transparent" ? 0 : 1,
        alignSelf: "flex-start",
      }}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Icon size={14} color={style.text} />
      <Text className="text-sm" style={{ color: style.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Export the type style map so other components can reuse the accent without
// duplicating the table.
export const POST_TYPE_STYLES = TYPE_STYLES;
