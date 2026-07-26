// AmenityPicker — amenity selection field + bottom-sheet list (BOOK-01).
//
// Visual contract per 05-UI-SPEC.md Screen 5:
//   - A Pressable field showing the selected amenity name (or placeholder), opening
//     an RN Modal list (the 04.1 SocietySwitcherSheet sheet pattern — NOT gorhom).
//   - Each amenity row shows its name + an open/close hours hint below
//     ("Open 06:00–22:00", booking.hoursHint from open_time/close_time).
//   - Empty case (no amenities configured): the field is disabled + an inline note
//     "No amenities are set up yet." (booking.noAmenities); the parent form disables Submit.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

const BRAND_500 = "#12715A";

// "06:00:00" / "06:00" → "06:00" for the hours hint.
function formatTime(time) {
  if (!time) return "—";
  const s = String(time);
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s;
}

export function hoursHint(amenity, t) {
  if (!amenity || !t) return "";
  return t("booking.hoursHint", {
    open: formatTime(amenity.open_time),
    close: formatTime(amenity.close_time),
  });
}

/**
 * @param {{
 *   amenities: Array<{ id: string, name: string, open_time?: string, close_time?: string }>,
 *   selectedId?: string|null,
 *   onSelect: (amenity: object) => void,
 * }} props
 */
export function AmenityPicker({ amenities = [], selectedId = null, onSelect }) {
  const { t } = useTranslation("bookings");
  const [open, setOpen] = useState(false);
  const isEmpty = amenities.length === 0;
  const selected = amenities.find((a) => a.id === selectedId) ?? null;

  return (
    <View className="gap-1">
      <Text className="text-sm text-neutral-600">{t("booking.amenityLabel")}</Text>

      <Pressable
        onPress={() => {
          if (!isEmpty) setOpen(true);
        }}
        disabled={isEmpty}
        accessibilityRole="button"
        accessibilityState={{ disabled: isEmpty, expanded: open }}
        accessibilityLabel={selected ? selected.name : t("booking.amenityLabel")}
        className={[
          "flex-row items-center justify-between h-12 px-3 rounded-xl border",
          isEmpty ? "border-neutral-200 bg-neutral-100" : "border-neutral-200 bg-white",
        ].join(" ")}
      >
        <View className="flex-1">
          <Text
            className={selected ? "text-base text-neutral-900" : "text-base text-neutral-400"}
            numberOfLines={1}
          >
            {selected ? selected.name : t("booking.amenityLabel")}
          </Text>
          {selected ? (
            <Text className="text-sm text-neutral-600" numberOfLines={1}>
              {hoursHint(selected, t)}
            </Text>
          ) : null}
        </View>
        {!isEmpty ? <ChevronDown size={20} color={BRAND_500} /> : null}
      </Pressable>

      {isEmpty ? (
        <Text className="text-sm text-neutral-400">{t("booking.noAmenities")}</Text>
      ) : null}

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="bg-white rounded-t-3xl p-4 mt-auto"
            onPress={(e) => e.stopPropagation()}
          >
            <View
              className="w-12 h-1 bg-neutral-200 rounded-full self-center mb-4"
              accessibilityElementsHidden
            />
            <Text className="text-xl font-semibold text-neutral-900 mb-3">
              {t("booking.amenityLabel")}
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {amenities.map((a, idx) => {
                const isActive = a.id === selectedId;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => {
                      onSelect?.(a);
                      setOpen(false);
                    }}
                    className={[
                      "flex-row items-center py-3",
                      idx < amenities.length - 1 ? "border-b border-neutral-100" : "",
                    ].join(" ")}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`${a.name}. ${hoursHint(a, t)}`}
                  >
                    <View className="flex-1">
                      <Text className="text-base text-neutral-900" numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text className="text-sm text-neutral-600" numberOfLines={1}>
                        {hoursHint(a, t)}
                      </Text>
                    </View>
                    {isActive ? <Check size={20} color={BRAND_500} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
