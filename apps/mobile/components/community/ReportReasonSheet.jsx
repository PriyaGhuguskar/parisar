// ReportReasonSheet — reason chooser bottom sheet for reporting a post OR a comment.
//
// Visual contract per 06-UI-SPEC.md Screen 7 §ReportReasonSheet (COMM-04, D-03).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

const BRAND_500 = "#12715A";
const DANGER_500 = "#c81e1e";
const NOTE_MAX = 300;

const REASON_KEYS = ["spam", "harassment", "inappropriate", "misinfo", "other"];

/**
 * @param {{
 *   visible: boolean,
 *   targetKind: 'post'|'comment',
 *   submitting?: boolean,
 *   error?: string|null,
 *   onClose: () => void,
 *   onConfirm: (payload: { reason: string, note: string|null }) => void,
 * }} props
 */
export function ReportReasonSheet({
  visible,
  targetKind = "post",
  submitting = false,
  error = null,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation("community");
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");

  // Reset the selection each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote("");
    }
  }, [visible]);

  const targetLabel =
    targetKind === "comment" ? t("community.targetComment") : t("community.targetPost");
  const title = t("community.reportTitle", { target: targetLabel });
  const canConfirm = !!reason && !submitting;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="bg-white rounded-t-3xl p-4 mt-auto gap-3"
          onPress={(e) => e.stopPropagation()}
        >
          <View
            className="w-12 h-1 bg-neutral-200 rounded-full self-center mb-1"
            accessibilityElementsHidden
          />

          <Text className="text-xl font-semibold text-neutral-900">{title}</Text>
          <Text className="text-base text-neutral-600">{t("community.reportSubhead")}</Text>

          {/* Reason rows */}
          <View className="gap-2">
            {REASON_KEYS.map((key) => {
              const selected = reason === key;
              const reasonLabel = t(`community.reason.${key}`);
              return (
                <Pressable
                  key={key}
                  onPress={() => setReason(key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={reasonLabel}
                  className="rounded-xl px-3 justify-center"
                  style={{
                    minHeight: 48,
                    backgroundColor: selected ? "#f5f7ff" : "#ffffff",
                    borderWidth: 1,
                    borderColor: selected ? BRAND_500 : "#e5e5e5",
                  }}
                >
                  <Text className="text-base" style={{ color: selected ? BRAND_500 : "#171717" }}>
                    {reasonLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Optional note */}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t("community.reportNotePlaceholder")}
            placeholderTextColor="#6e6e6e"
            maxLength={NOTE_MAX}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
            style={{ minHeight: 44 }}
            accessibilityLabel={t("community.reportNotePlaceholder")}
          />

          {error ? (
            <Text className="text-sm" style={{ color: DANGER_500 }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          {/* Confirm (danger fill) */}
          <Pressable
            onPress={() => onConfirm?.({ reason, note: note.trim() ? note.trim() : null })}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityLabel={t("community.reportConfirm")}
            accessibilityState={{ disabled: !canConfirm, busy: submitting }}
            className="h-12 w-full rounded-xl items-center justify-center"
            style={{ backgroundColor: canConfirm ? DANGER_500 : "#e5e5e5" }}
          >
            <Text
              className={`text-base font-semibold ${canConfirm ? "text-white" : "text-neutral-400"}`}
            >
              {submitting ? "…" : t("community.reportConfirm")}
            </Text>
          </Pressable>

          {/* Cancel */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="h-10 items-center justify-center"
          >
            <Text className="text-base text-neutral-600">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
