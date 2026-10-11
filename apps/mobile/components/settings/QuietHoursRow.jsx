// QuietHoursRow — paired "From"/"To" time pickers for the quiet-hours window (IST).
//
// Visual contract per 05-UI-SPEC.md Screen 7 (Section 2 Quiet hours, NOTF-06):
//   - Two datetimepicker `time` fields side by side: "From {{start}}" (prefs.quietFrom)
//     / "To {{end}}" (prefs.quietTo). Default 22:00 → 07:00 (D-04).
//   - Note prefs.quietWrapNote — the window spans midnight when From is later than To
//     (the 22:00→07:00 overnight wrap, RESEARCH Pitfall 2).
//
// Values are "HH:mm" strings (matching the notification_preferences quiet_start/quiet_end
// columns). onChange reports the new "HH:mm" for the edited end.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

// "HH:mm" → a Date (today) carrying that time, for seeding the native picker.
function toDate(hhmm) {
  const d = new Date();
  const m = String(hhmm ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function toHHmm(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * @param {{
 *   start: string,            // "HH:mm"
 *   end: string,              // "HH:mm"
 *   onChangeStart: (hhmm: string) => void,
 *   onChangeEnd: (hhmm: string) => void,
 * }} props
 */
export function QuietHoursRow({ start = "22:00", end = "07:00", onChangeStart, onChangeEnd }) {
  const { t } = useTranslation("preferences");
  const [showPicker, setShowPicker] = useState(null); // 'start' | 'end' | null

  function onPickerChange(event, value) {
    if (Platform.OS !== "ios") setShowPicker(null);
    if (event?.type === "dismissed" || !value) return;
    const hhmm = toHHmm(value);
    if (showPicker === "start") onChangeStart?.(hhmm);
    else if (showPicker === "end") onChangeEnd?.(hhmm);
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-sm text-neutral-600">{t("prefs.quietFrom")}</Text>
          <Pressable
            onPress={() => setShowPicker("start")}
            accessibilityRole="button"
            accessibilityLabel={`${t("prefs.quietFrom")} ${start}`}
            className="h-12 px-3 rounded-xl border border-neutral-200 bg-white justify-center"
          >
            <Text className="text-base text-neutral-900">{start}</Text>
          </Pressable>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-sm text-neutral-600">{t("prefs.quietTo")}</Text>
          <Pressable
            onPress={() => setShowPicker("end")}
            accessibilityRole="button"
            accessibilityLabel={`${t("prefs.quietTo")} ${end}`}
            className="h-12 px-3 rounded-xl border border-neutral-200 bg-white justify-center"
          >
            <Text className="text-base text-neutral-900">{end}</Text>
          </Pressable>
        </View>
      </View>

      <Text className="text-sm text-neutral-400">{t("prefs.quietWrapNote")}</Text>

      {showPicker ? (
        <DateTimePicker
          value={toDate(showPicker === "start" ? start : end)}
          mode="time"
          is24Hour
          onChange={onPickerChange}
        />
      ) : null}
    </View>
  );
}
