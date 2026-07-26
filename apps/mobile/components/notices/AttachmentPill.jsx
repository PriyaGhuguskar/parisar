// AttachmentPill — "PDF" / "Photo" chip shown on a NoticeCard and reused on the
// notice detail attachment row.
//
// Visual contract per 05-UI-SPEC.md Screen 1 (NoticeCard) + §Component Inventory:
//   neutral.100 bg / neutral.600 text / rounded-full px-2 py-0.5
//   Paperclip 12px + "PDF" or "Photo" by mime type
//   i18n: notice.attachmentPdf / notice.attachmentPhoto
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Paperclip } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

/**
 * Decide the label by mime type. PDFs → "PDF", everything image-ish → "Photo".
 *
 * @param {Function} t
 * @param {string|null|undefined} mimeType
 * @returns {string}
 */
export function attachmentLabel(t, mimeType) {
  if (mimeType === "application/pdf") return t("notice.attachmentPdf");
  return t("notice.attachmentPhoto");
}

/**
 * @param {{ mimeType?: string|null }} props
 */
export function AttachmentPill({ mimeType }) {
  const { t } = useTranslation("notifications");
  const label = attachmentLabel(t, mimeType);

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5 bg-neutral-100"
      style={{ alignSelf: "flex-start" }}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Paperclip size={12} color="#525252" />
      <Text className="text-sm text-neutral-600" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
