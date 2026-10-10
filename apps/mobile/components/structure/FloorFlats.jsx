// apps/mobile/components/structure/FloorFlats.jsx
// Floor-by-floor flat builder (a From–To range per floor generates the flat
// numbers) — the mobile counterpart of apps/web/components/structure/
// FloorFlats.jsx. Used by the first-run wings/flats setup and the Society
// profile's "Add wing". Logic lives in lib/flats/floors.js.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { buildFlats, nextFloor } from "../../lib/flats/floors";
import { DashedButton, TextField } from "../onboarding/Form";

function previewOf(pf, tp) {
  if (pf?.invalid) return tp("rangeInvalid");
  if (!pf?.numbers.length) return tp("floorEmpty");
  return pf.numbers.length > 6
    ? `${pf.numbers.slice(0, 3).join(", ")} … ${pf.numbers.at(-1)} (${pf.numbers.length})`
    : pf.numbers.join(", ");
}

/**
 * @param {{ floors: Array, onChange: (floors: Array) => void }} props
 */
export function FloorFlats({ floors, onChange }) {
  const { t } = useTranslation("auth");
  const tp = (k) => t(`profile.${k}`);
  const { perFloor } = buildFlats(floors);
  const setFloor = (id, patch) =>
    onChange(floors.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <View className="gap-3">
      <Text className="text-xs text-neutral-600">{tp("floorHint")}</Text>
      {floors.map((f) => {
        const pf = perFloor.find((p) => p.id === f.id);
        return (
          <View key={f.id} className="gap-1">
            <View className="flex-row items-center gap-2">
              <Text className="w-16 text-sm font-semibold text-neutral-600">
                {tp("floorWord")} {f.level}
              </Text>
              <View className="flex-1">
                <TextField
                  value={f.from}
                  onChangeText={(v) => setFloor(f.id, { from: v.replace(/\D/g, "") })}
                  placeholder="101"
                  keyboardType="number-pad"
                  accessibilityLabel={`${tp("floorWord")} ${f.level} ${tp("fromLabel")}`}
                />
              </View>
              <Text className="text-neutral-400">–</Text>
              <View className="flex-1">
                <TextField
                  value={f.to}
                  onChangeText={(v) => setFloor(f.id, { to: v.replace(/\D/g, "") })}
                  placeholder="104"
                  keyboardType="number-pad"
                  accessibilityLabel={`${tp("floorWord")} ${f.level} ${tp("toLabel")}`}
                />
              </View>
              {floors.length > 1 ? (
                <Pressable
                  onPress={() => onChange(floors.filter((x) => x.id !== f.id))}
                  accessibilityRole="button"
                  accessibilityLabel={tp("removeFloor")}
                  className="p-1"
                >
                  <X size={16} color="#64748B" />
                </Pressable>
              ) : null}
            </View>
            <Text
              className={`pl-16 text-xs ${pf?.invalid ? "text-danger-500" : "text-neutral-600"}`}
            >
              {previewOf(pf, tp)}
            </Text>
          </View>
        );
      })}
      <DashedButton
        label={tp("addFloor")}
        onPress={() => onChange([...floors, nextFloor(floors)])}
      />
    </View>
  );
}
