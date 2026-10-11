// GrievanceOfficerCard — read-only Grievance Officer surface on About/Help (COMM-05, IT Rules 2021).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Scale } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { openExternalUrl } from "../../lib/safe-link";
import { Text } from "../ui/Text";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function contactHref(contact) {
  const v = (contact ?? "").trim();
  if (!v) return null;
  if (EMAIL_RE.test(v)) return `mailto:${v}`;
  // Otherwise treat as a phone number.
  return `tel:${v.replace(/[\s\-().]/g, "")}`;
}

/**
 * @param {{
 *   officer: { name?: string, contact?: string, is_default?: boolean } | null,
 * }} props
 */
export function GrievanceOfficerCard({ officer }) {
  const { t } = useTranslation("moderation");
  const name = officer?.name ?? "—";
  const contact = officer?.contact ?? "";
  const href = contactHref(contact);

  const openContact = () => {
    if (href) openExternalUrl(href).catch(() => {});
  };

  return (
    <View className="bg-white rounded-xl p-6 gap-2">
      <View className="flex-row items-center gap-2">
        <Scale size={16} color="#475569" />
        <Text className="text-sm text-neutral-600">{t("grievance.cardLabel")}</Text>
      </View>

      <Text className="text-xl font-semibold text-neutral-900">{name}</Text>

      {contact ? (
        <Pressable
          onPress={openContact}
          accessibilityRole="link"
          accessibilityLabel={contact}
          disabled={!href}
        >
          <Text className="text-base" style={{ color: "#12715A" }}>
            {contact}
          </Text>
        </Pressable>
      ) : null}

      <Text className="text-sm text-neutral-400">{t("grievance.cardNote")}</Text>
    </View>
  );
}
