// apps/mobile/components/profile/LanguageSelector.jsx
// Phase 7 (Plan 07-03) — L10N-04 RN Modal language selector.
//
// UI-SPEC §Screen 4 (Mobile):
//   - RN Modal, transparent, slide animation, backdrop dismiss
//   - 3 rows: English / हिन्दी / मराठी (script-native labels)
//   - Selected row: brand.50 bg + Check icon brand.500
//   - Row label fontFamily MUST be NotoSansDevanagari_400Regular on EVERY row
//     so the script-native हिन्दी / मराठी glyphs render in the bundled font,
//     not the device-default font that fails on budget Android (UI-SPEC
//     §Typography lines 249-253 — the whole reason L10N-03 exists).
//   - On select: changeLanguage(lng) → close → optional onChanged callback
//     (host can surface a toast); persistence failure surfaces an inline
//     `language.saveError` toast via accessibility announcement.
//
// JavaScript only per CLAUDE.md.

import { Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Modal, Pressable, Text, View } from "react-native";
import { FONT_DEVANAGARI_REGULAR } from "../../lib/fonts";
import { changeLanguage } from "../../lib/i18n";

const BRAND_500 = "#12715A";
const BRAND_50 = "#f5f7ff";
const NEUTRAL_0 = "#ffffff";
const NEUTRAL_100 = "#f5f5f5";
const NEUTRAL_900 = "#171717";
const DANGER_500 = "#c81e1e";

const OPTIONS = [
  { lng: "en", labelKey: "language.english" },
  { lng: "hi", labelKey: "language.hindi" },
  { lng: "mr", labelKey: "language.marathi" },
];

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {(lng: string, name: string) => void} [props.onChanged]
 *   Fired after persist + i18n.changeLanguage; host can show a toast.
 */
export function LanguageSelector({ visible, onClose, onChanged }) {
  const { t, i18n } = useTranslation("dashboard");
  const active = i18n.language;
  const [errorKey, setErrorKey] = useState(null);

  const handleSelect = async (lng, labelKey) => {
    setErrorKey(null);
    try {
      await changeLanguage(lng);
      const name = t(labelKey);
      onChanged?.(lng, name);
      onClose?.();
    } catch (_err) {
      // T-07-10: persistence failure is non-fatal — the in-memory i18next
      // change still succeeded if reached; surface a saveError toast.
      setErrorKey("language.saveError");
      try {
        AccessibilityInfo.announceForAccessibility(t("language.saveError"));
      } catch {
        // fire-and-forget — RN runtime missing the module in test envs
      }
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("language.cancel")}
      >
        <Pressable
          className="rounded-t-3xl p-4 mt-auto"
          style={{ backgroundColor: NEUTRAL_0 }}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            className="w-12 h-1 rounded-full self-center mb-4"
            style={{ backgroundColor: NEUTRAL_100 }}
            accessibilityElementsHidden
          />

          <Text className="text-xl font-semibold mb-6" style={{ color: NEUTRAL_900 }}>
            {t("language.title")}
          </Text>

          {OPTIONS.map((opt, idx) => {
            const isSelected = active === opt.lng;
            const isLast = idx === OPTIONS.length - 1;
            return (
              <Pressable
                key={opt.lng}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t(opt.labelKey)}
                onPress={() => handleSelect(opt.lng, opt.labelKey)}
                className={["flex-row items-center py-4 px-4", isLast ? "" : "border-b"].join(" ")}
                style={{
                  backgroundColor: isSelected ? BRAND_50 : NEUTRAL_0,
                  minHeight: 56,
                  borderBottomColor: NEUTRAL_100,
                }}
              >
                {isSelected ? (
                  <Check size={20} color={BRAND_500} />
                ) : (
                  <View style={{ width: 20, height: 20 }} />
                )}
                <Text
                  className="ml-3 text-base"
                  style={{
                    color: NEUTRAL_900,
                    // UI-SPEC §Typography lines 249-253 compliance: the
                    // font-family declaration MUST apply to Language Selector
                    // rows so the script-native हिन्दी / मराठी labels render
                    // in the bundled Noto Sans Devanagari font, not the
                    // device-default font that fails on budget Android. The
                    // bundled font also covers Latin glyphs adequately for
                    // the "English" row, so applying it uniformly keeps row
                    // metrics consistent.
                    fontFamily: FONT_DEVANAGARI_REGULAR,
                  }}
                >
                  {t(opt.labelKey)}
                </Text>
              </Pressable>
            );
          })}

          {errorKey ? (
            <Text className="text-sm mt-4 text-center" style={{ color: DANGER_500 }}>
              {t(errorKey)}
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
