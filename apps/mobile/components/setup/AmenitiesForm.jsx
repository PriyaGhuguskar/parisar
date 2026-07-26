import { Baby, Building, Check, Star, Waves, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FormError } from "../auth/FormError";
import { WizardProgress } from "./WizardProgress";

// Default amenities with i18n keys and Lucide icons
const DEFAULT_AMENITY_KEYS = [
  { key: "swimmingPool", labelKey: "amenity.swimmingPool", Icon: Waves },
  { key: "temple", labelKey: "amenity.temple", Icon: Star },
  { key: "kidsArea", labelKey: "amenity.kidsArea", Icon: Baby },
  { key: "clubhouse", labelKey: "amenity.clubhouse", Icon: Building },
];

/**
 * AmenitiesForm — Step 5 of the Secretary wizard.
 */
export function AmenitiesForm({ supabase, societyId, onNext, onBack, onSkip }) {
  const { t } = useTranslation("auth");
  // Which default amenities are selected (by key)
  const [selected, setSelected] = useState(new Set());
  // Custom amenities (string names)
  const [customAmenities, setCustomAmenities] = useState([]);
  const [customInput, setCustomInput] = useState("");
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Build the default amenities list with localized labels
  const defaultAmenities = DEFAULT_AMENITY_KEYS.map((a) => ({
    key: a.key,
    label: t(a.labelKey),
    Icon: a.Icon,
  }));

  function toggleDefault(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name) return;
    if (name.length > 40) {
      setSubmitError("Custom amenity name must be 40 characters or fewer.");
      return;
    }
    setSubmitError(null);
    setCustomAmenities((prev) => [...prev, name]);
    setCustomInput("");
  }

  function removeCustom(name) {
    setCustomAmenities((prev) => prev.filter((a) => a !== name));
  }

  async function handleNext() {
    setSubmitError(null);
    setLoading(true);

    try {
      const rows = [];

      // Default amenities
      for (const amenity of defaultAmenities) {
        if (selected.has(amenity.key)) {
          rows.push({ society_id: societyId, name: amenity.label, is_custom: false });
        }
      }

      // Custom amenities
      for (const name of customAmenities) {
        rows.push({ society_id: societyId, name, is_custom: true });
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("amenities").insert(rows);
        if (error) throw error;
      }

      onNext(
        [...selected]
          .map((k) => defaultAmenities.find((a) => a.key === k)?.label ?? k)
          .concat(customAmenities),
      );
    } catch (err) {
      setSubmitError(err?.message ?? t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerClassName="pb-8 px-4 pt-2"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Progress */}
      <WizardProgress currentStep={5} totalSteps={6} />

      {/* Step card */}
      <View className="bg-white rounded-2xl p-6 shadow-sm mt-2">
        {/* Title */}
        <Text className="text-xl font-semibold text-neutral-900 mb-1">
          {t("setup.step5.title")}
        </Text>
        <Text className="text-base text-neutral-600 mb-5">{t("setup.step5.subtitle")}</Text>

        {/* Default amenity cards (2-column grid) */}
        <View className="flex-row flex-wrap gap-4 mb-5">
          {defaultAmenities.map(({ key, label, Icon }) => {
            const isSelected = selected.has(key);
            return (
              <TouchableOpacity
                key={key}
                onPress={() => toggleDefault(key)}
                className={[
                  "rounded-xl p-4 border",
                  isSelected
                    ? "bg-brand-50 border-brand-500 border-2"
                    : "bg-white border-neutral-200",
                ].join(" ")}
                style={{ width: "47%" }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={label}
              >
                {/* Checkmark badge when selected */}
                {isSelected && (
                  <View className="absolute top-2 right-2">
                    <Check size={16} color="#12715A" />
                  </View>
                )}

                <Icon
                  size={24}
                  color={isSelected ? "#12715A" : "#737373"}
                  style={{ marginBottom: 8 }}
                />
                <Text
                  className={[
                    "text-sm flex-wrap",
                    isSelected ? "text-brand-500 font-medium" : "text-neutral-900",
                  ].join(" ")}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amenity input */}
        <View className="mb-4">
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 h-12 rounded-lg bg-neutral-50 border border-neutral-200 px-3 text-base text-neutral-900"
              value={customInput}
              onChangeText={setCustomInput}
              placeholder={t("setup.step5.customPlaceholder")}
              placeholderTextColor="#6e6e6e"
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={addCustom}
            />
            <TouchableOpacity
              onPress={addCustom}
              className="h-10 px-4 rounded-lg border border-brand-500 items-center justify-center self-center"
              accessibilityRole="button"
            >
              <Text className="text-sm font-medium text-brand-500">Add</Text>
            </TouchableOpacity>
          </View>

          {/* Custom amenity chips */}
          {customAmenities.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-3">
              {customAmenities.map((name) => (
                <View
                  key={name}
                  className="flex-row items-center bg-neutral-100 border border-neutral-200 rounded-full px-3 py-1"
                >
                  <Text className="text-sm text-neutral-600 mr-1">{name}</Text>
                  <Pressable
                    onPress={() => removeCustom(name)}
                    className="p-1"
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={14} color="#737373" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit error */}
        {submitError && <FormError message={submitError} />}

        {/* Navigation buttons */}
        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={onBack}
            className="flex-1 h-14 rounded-xl border border-neutral-200 items-center justify-center"
            accessibilityRole="button"
          >
            <Text className="text-base font-medium text-neutral-900">Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
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
              <Text className="text-base font-semibold text-white">{t("auth.continue")}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Skip link */}
        <TouchableOpacity onPress={onSkip} className="items-center mt-4" accessibilityRole="button">
          <Text className="text-sm text-brand-500">{t("setup.step5.skip")}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
