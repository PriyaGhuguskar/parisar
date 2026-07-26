// FlatPicker — flat selection field + RN Modal list grouped by wing.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Check, ChevronDown, Lock } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

const BRAND_500 = "#12715A";

/**
 * "{wing}-{number}" label for a flat row. Falls back to just the number, then "—".
 */
export function formatFlatLabel(flat) {
  if (!flat) return "—";
  const wing = flat?.wing?.name ?? "";
  const num = flat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

/**
 * Group flats by wing name for the sectioned modal list.
 */
function groupByWing(flats) {
  const groups = new Map();
  for (const f of flats) {
    const wing = f?.wing?.name ?? "";
    if (!groups.has(wing)) groups.set(wing, []);
    groups.get(wing).push(f);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wing, list]) => ({ wing, flats: list }));
}

/**
 * @param {{
 *   flats: Array<{ id: string, number?: string, wing?: { name?: string }|null }>,
 *   selectedId?: string|null,
 *   onSelect: (flat: object|null) => void,
 *   label?: string,
 *   allowAll?: boolean,
 *   allLabel?: string,
 * }} props
 */
export function FlatPicker({
  flats = [],
  selectedId = null,
  onSelect,
  label,
  allowAll = false,
  allLabel = "All flats",
}) {
  const { t } = useTranslation("flat-actions");
  const [open, setOpen] = useState(false);
  const isEmpty = flats.length === 0;
  const selected = flats.find((f) => f.id === selectedId) ?? null;
  const grouped = useMemo(() => groupByWing(flats), [flats]);

  const resolvedLabel = label ?? t("flatAction.flatLabel");
  const fieldText = selected
    ? formatFlatLabel(selected)
    : allowAll && !selectedId
      ? allLabel
      : resolvedLabel;
  const fieldIsPlaceholder = !selected && !(allowAll && !selectedId);

  return (
    <View className="gap-1">
      <Text className="text-sm text-neutral-600">{resolvedLabel}</Text>

      <Pressable
        onPress={() => {
          if (!isEmpty) setOpen(true);
        }}
        disabled={isEmpty}
        accessibilityRole="button"
        accessibilityState={{ disabled: isEmpty, expanded: open }}
        accessibilityLabel={selected ? formatFlatLabel(selected) : resolvedLabel}
        className={[
          "flex-row items-center justify-between h-12 px-3 rounded-xl border",
          isEmpty ? "border-neutral-200 bg-neutral-100" : "border-neutral-200 bg-white",
        ].join(" ")}
      >
        <Text
          className={
            fieldIsPlaceholder ? "text-base text-neutral-400" : "text-base text-neutral-900"
          }
          numberOfLines={1}
        >
          {fieldText}
        </Text>
        {!isEmpty ? <ChevronDown size={20} color={BRAND_500} /> : null}
      </Pressable>

      {isEmpty ? <Text className="text-sm text-neutral-400">{t("flatAction.noFlats")}</Text> : null}

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
            <Text className="text-xl font-semibold text-neutral-900 mb-3">{resolvedLabel}</Text>

            <ScrollView style={{ maxHeight: 420 }}>
              {allowAll ? (
                <Pressable
                  onPress={() => {
                    onSelect?.(null);
                    setOpen(false);
                  }}
                  className="flex-row items-center py-3 border-b border-neutral-100"
                  accessibilityRole="button"
                  accessibilityState={{ selected: !selectedId }}
                  accessibilityLabel={allLabel}
                >
                  <Text className="flex-1 text-base text-neutral-900">{allLabel}</Text>
                  {!selectedId ? <Check size={20} color={BRAND_500} /> : null}
                </Pressable>
              ) : null}

              {grouped.map((group) => (
                <View key={group.wing || "_nowing"}>
                  {group.wing ? (
                    <Text className="text-sm text-neutral-400 mt-3 mb-1">{group.wing}</Text>
                  ) : null}
                  {group.flats.map((f, idx) => {
                    const isActive = f.id === selectedId;
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => {
                          onSelect?.(f);
                          setOpen(false);
                        }}
                        className={[
                          "flex-row items-center py-3",
                          idx < group.flats.length - 1 ? "border-b border-neutral-100" : "",
                        ].join(" ")}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={formatFlatLabel(f)}
                      >
                        <Text className="flex-1 text-base text-neutral-900" numberOfLines={1}>
                          {formatFlatLabel(f)}
                        </Text>
                        {isActive ? <Check size={20} color={BRAND_500} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// A small "private to your flat" cue used by the member tab subtitle (D-05).
/**
 * @param {{ flatLabel: string }} props
 */
export function PrivateFlatSubtitle({ flatLabel }) {
  const { t } = useTranslation("flat-actions");
  const text = t("flatAction.memberSubtitle", { flat: flatLabel || "—" });
  return (
    <View
      className="flex-row items-center gap-1"
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <Lock size={14} color="#6e6e6e" />
      <Text className="text-sm text-neutral-600 flex-1" numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}
