import { bootstrapSocietyStructure, finalizeSocietySetup } from "@parisar/api-client";
import { X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FormError } from "../auth/FormError";
import { WizardProgress } from "./WizardProgress";

/**
 * FlatsForm — Step 3 of the Secretary wizard.
 */
export function FlatsForm({ supabase, societyId, wings, onNext, onBack }) {
  const { t } = useTranslation("auth");
  // flatsByWing: { [wingName]: string[] }
  const [flatsByWing, setFlatsByWing] = useState(() => {
    const init = {};
    wings.forEach((w) => {
      init[w] = [];
    });
    return init;
  });

  // Per-wing flat input state
  const [flatInputs, setFlatInputs] = useState(() => {
    const init = {};
    wings.forEach((w) => {
      init[w] = "";
    });
    return init;
  });

  // Bulk range state per wing
  const [bulkFrom, setBulkFrom] = useState(() => {
    const init = {};
    wings.forEach((w) => {
      init[w] = "";
    });
    return init;
  });
  const [bulkTo, setBulkTo] = useState(() => {
    const init = {};
    wings.forEach((w) => {
      init[w] = "";
    });
    return init;
  });
  const [bulkExpanded, setBulkExpanded] = useState(() => {
    const init = {};
    wings.forEach((w) => {
      init[w] = false;
    });
    return init;
  });

  // Secretary flat selection
  const [selectedWing, setSelectedWing] = useState("");
  const [selectedFlat, setSelectedFlat] = useState("");

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Flat management helpers
  // ---------------------------------------------------------------------------
  function addFlat(wingName) {
    const num = (flatInputs[wingName] ?? "").trim();
    if (!num) return;
    if ((flatsByWing[wingName] ?? []).includes(num)) {
      setError(`Flat ${num} already added to Wing ${wingName}.`);
      return;
    }
    setError(null);
    setFlatsByWing((prev) => ({
      ...prev,
      [wingName]: [...(prev[wingName] ?? []), num],
    }));
    setFlatInputs((prev) => ({ ...prev, [wingName]: "" }));
    // Reset selected flat if it was this one
    if (selectedWing === wingName && selectedFlat === num) setSelectedFlat("");
  }

  function removeFlat(wingName, num) {
    setFlatsByWing((prev) => ({
      ...prev,
      [wingName]: (prev[wingName] ?? []).filter((f) => f !== num),
    }));
    if (selectedWing === wingName && selectedFlat === num) setSelectedFlat("");
  }

  function addBulkRange(wingName) {
    const from = parseInt(bulkFrom[wingName], 10);
    const to = parseInt(bulkTo[wingName], 10);

    if (isNaN(from) || isNaN(to) || from > to) {
      setError(`Invalid range for Wing ${wingName}. From must be ≤ To.`);
      return;
    }
    const count = to - from + 1;
    if (count > 50) {
      setError(`Maximum 50 flats per range. Split this range.`);
      return;
    }

    setError(null);
    const newFlats = [];
    for (let n = from; n <= to; n++) {
      const num = String(n);
      if (!(flatsByWing[wingName] ?? []).includes(num)) {
        newFlats.push(num);
      }
    }
    setFlatsByWing((prev) => ({
      ...prev,
      [wingName]: [...(prev[wingName] ?? []), ...newFlats],
    }));
    setBulkFrom((prev) => ({ ...prev, [wingName]: "" }));
    setBulkTo((prev) => ({ ...prev, [wingName]: "" }));
    setBulkExpanded((prev) => ({ ...prev, [wingName]: false }));
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    setError(null);

    // Validate: at least one flat in at least one wing
    const totalFlats = Object.values(flatsByWing).reduce((acc, arr) => acc + arr.length, 0);
    if (totalFlats === 0) {
      setError("Please add at least one flat before continuing.");
      return;
    }

    // Validate: secretary flat selected
    if (!selectedWing || !selectedFlat) {
      setError(t("setup.step3.secretaryFlatRequired"));
      return;
    }

    setLoading(true);
    try {
      const wingsPayload = wings.map((name) => ({ name }));
      const flatsPayload = [];
      for (const [wingName, numbers] of Object.entries(flatsByWing)) {
        for (const num of numbers) {
          flatsPayload.push({ wing_name: wingName, number: num });
        }
      }

      const result = await bootstrapSocietyStructure(supabase, {
        societyId,
        wings: wingsPayload,
        flats: flatsPayload,
      });

      // Find the secretary's flat in the returned flats list
      const secretaryFlatRow = (result.flats ?? []).find(
        (f) => f.wing_name === selectedWing && f.number === selectedFlat,
      );

      if (!secretaryFlatRow) {
        setError("Could not locate your flat. Please verify and try again.");
        setLoading(false);
        return;
      }

      await finalizeSocietySetup(supabase, {
        societyId,
        flatId: secretaryFlatRow.id,
      });

      onNext({ flats: result.flats ?? [], secretaryFlatId: secretaryFlatRow.id });
    } catch (err) {
      setError(err?.message ?? t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="pb-8 px-4 pt-2"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <WizardProgress currentStep={3} totalSteps={6} />

        {/* Step card */}
        <View className="bg-white rounded-2xl p-6 shadow-sm mt-2">
          {/* Title */}
          <Text className="text-xl font-semibold text-neutral-900 mb-1">
            {t("setup.step3.title")}
          </Text>
          <Text className="text-base text-neutral-600 mb-5">{t("setup.step3.subtitle")}</Text>

          {/* Wings sections */}
          {wings.map((wingName) => (
            <View key={wingName} className="mb-6">
              {/* Wing sub-heading */}
              <Text className="text-lg font-semibold text-neutral-900 mb-3">Wing {wingName}</Text>

              {/* Individual flat input */}
              <View className="flex-row gap-2 mb-3">
                <TextInput
                  className="flex-1 h-12 rounded-lg bg-neutral-50 border border-neutral-200 px-3 text-base text-neutral-900"
                  value={flatInputs[wingName] ?? ""}
                  onChangeText={(v) => setFlatInputs((prev) => ({ ...prev, [wingName]: v }))}
                  placeholder={t("setup.step3.flatPlaceholder")}
                  placeholderTextColor="#6e6e6e"
                  maxLength={10}
                  returnKeyType="done"
                  onSubmitEditing={() => addFlat(wingName)}
                />
                <TouchableOpacity
                  onPress={() => addFlat(wingName)}
                  className="h-10 px-4 rounded-lg border border-brand-500 items-center justify-center self-center"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-medium text-brand-500">Add</Text>
                </TouchableOpacity>
              </View>

              {/* Flat chips */}
              {(flatsByWing[wingName] ?? []).length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {(flatsByWing[wingName] ?? []).map((num) => (
                    <View
                      key={num}
                      className="flex-row items-center bg-neutral-100 border border-neutral-200 rounded-full px-3 py-1"
                    >
                      <Text className="text-sm text-neutral-900 mr-1">{num}</Text>
                      <Pressable
                        onPress={() => removeFlat(wingName, num)}
                        className="p-1"
                        accessibilityRole="button"
                        accessibilityLabel={`Remove flat ${num}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={14} color="#737373" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Flat count */}
              <Text className="text-sm text-neutral-600 mb-2">
                {t("setup.step3.flatCount", {
                  count: String((flatsByWing[wingName] ?? []).length),
                })}
              </Text>

              {/* Bulk range toggle */}
              <TouchableOpacity
                onPress={() =>
                  setBulkExpanded((prev) => ({ ...prev, [wingName]: !prev[wingName] }))
                }
                className="mb-2"
              >
                <Text className="text-sm text-brand-500 underline">
                  {bulkExpanded[wingName] ? "Hide range entry" : "Add a range"}
                </Text>
              </TouchableOpacity>

              {/* Bulk range row */}
              {bulkExpanded[wingName] && (
                <View className="flex-row gap-2 items-center mb-2">
                  <TextInput
                    className="flex-1 h-10 rounded-lg bg-neutral-50 border border-neutral-200 px-3 text-base text-neutral-900"
                    value={bulkFrom[wingName] ?? ""}
                    onChangeText={(v) => setBulkFrom((prev) => ({ ...prev, [wingName]: v }))}
                    placeholder="From"
                    placeholderTextColor="#6e6e6e"
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                  <Text className="text-neutral-400">—</Text>
                  <TextInput
                    className="flex-1 h-10 rounded-lg bg-neutral-50 border border-neutral-200 px-3 text-base text-neutral-900"
                    value={bulkTo[wingName] ?? ""}
                    onChangeText={(v) => setBulkTo((prev) => ({ ...prev, [wingName]: v }))}
                    placeholder="To"
                    placeholderTextColor="#6e6e6e"
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                  <TouchableOpacity
                    onPress={() => addBulkRange(wingName)}
                    className="h-10 px-3 rounded-lg bg-brand-500 items-center justify-center"
                  >
                    <Text className="text-sm font-semibold text-white">Add All</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Divider */}
              <View className="h-px bg-neutral-100 mt-2" />
            </View>
          ))}

          {/* Secretary flat picker */}
          <View className="mt-2 mb-4">
            <Text className="text-xl font-semibold text-neutral-900 mb-1">
              {t("setup.step3.secretaryFlatLabel")}
            </Text>
            <Text className="text-sm text-neutral-600 mb-3">
              {t("setup.step3.secretaryFlatHelper")}
            </Text>

            {/* Wing picker */}
            <Text className="text-sm text-neutral-700 mb-1">Wing</Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {wings.map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => {
                    setSelectedWing(w);
                    setSelectedFlat("");
                  }}
                  className={[
                    "px-4 py-2 rounded-full border",
                    selectedWing === w
                      ? "bg-brand-500 border-brand-500"
                      : "bg-neutral-100 border-neutral-200",
                  ].join(" ")}
                >
                  <Text
                    className={
                      selectedWing === w
                        ? "text-white text-sm font-medium"
                        : "text-neutral-700 text-sm"
                    }
                  >
                    {w}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Flat picker (chained on wing selection) */}
            {selectedWing ? (
              <>
                <Text className="text-sm text-neutral-700 mb-1">Flat</Text>
                {(flatsByWing[selectedWing] ?? []).length === 0 ? (
                  <Text className="text-sm text-neutral-400">
                    No flats added for Wing {selectedWing} yet.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {(flatsByWing[selectedWing] ?? []).map((num) => (
                      <TouchableOpacity
                        key={num}
                        onPress={() => setSelectedFlat(num)}
                        className={[
                          "px-4 py-2 rounded-full border",
                          selectedFlat === num
                            ? "bg-brand-500 border-brand-500"
                            : "bg-neutral-100 border-neutral-200",
                        ].join(" ")}
                      >
                        <Text
                          className={
                            selectedFlat === num
                              ? "text-white text-sm font-medium"
                              : "text-neutral-700 text-sm"
                          }
                        >
                          {selectedWing}-{num}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text className="text-sm text-neutral-400">Select a wing first.</Text>
            )}
          </View>

          {/* Error */}
          {error && <FormError message={error} />}

          {/* Navigation buttons */}
          <View className="flex-row gap-3 mt-6">
            <TouchableOpacity
              onPress={onBack}
              className="flex-1 h-14 rounded-xl border border-neutral-200 items-center justify-center"
              accessibilityRole="button"
            >
              <Text className="text-base font-medium text-neutral-900">Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
              className={[
                "flex-1 h-14 rounded-xl items-center justify-center",
                loading ? "bg-neutral-200" : "bg-brand-500",
              ].join(" ")}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-base font-semibold text-white">Save & Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
