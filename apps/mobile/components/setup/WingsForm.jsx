import { X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FormError } from "../auth/FormError";
import { WizardProgress } from "./WizardProgress";

/**
 * WingsForm — Step 2 of the Secretary wizard.
 */
export function WingsForm({ onNext, onBack }) {
  const { t } = useTranslation("auth");
  const [wingInput, setWingInput] = useState("");
  const [wings, setWings] = useState([]);
  const [noWings, setNoWings] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function addWing() {
    const name = wingInput.trim();
    if (!name) return;
    if (name.length > 20) {
      setError("Wing name must be 20 characters or fewer.");
      return;
    }
    if (wings.some((w) => w.toLowerCase() === name.toLowerCase())) {
      // Duplicate wing name
      setError(t("setup.step2.wingDuplicate", { name }));
      return;
    }
    setError(null);
    setWings((prev) => [...prev, name]);
    setWingInput("");
  }

  function removeWing(name) {
    setWings((prev) => prev.filter((w) => w !== name));
  }

  function handleNext() {
    setError(null);

    if (!noWings && wings.length === 0) {
      setError(t("setup.step2.wingsRequired"));
      return;
    }

    setLoading(true);
    // No DB writes — just pass local state forward
    const finalWings = noWings ? ["Main"] : wings;
    setLoading(false);
    onNext({ wings: finalWings });
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
        <WizardProgress currentStep={2} totalSteps={6} />

        {/* Step card */}
        <View className="bg-white rounded-2xl p-6 shadow-sm mt-2">
          {/* Title */}
          <Text className="text-xl font-semibold text-neutral-900 mb-1">
            {t("setup.step2.title")}
          </Text>
          <Text className="text-base text-neutral-600 mb-5">{t("setup.step2.subtitle")}</Text>

          {/* Wing input row */}
          {!noWings && (
            <View className="mb-3">
              <View className="flex-row gap-2 mb-3">
                <TextInput
                  className="flex-1 h-12 rounded-lg bg-neutral-50 border border-neutral-200 px-3 text-base text-neutral-900"
                  value={wingInput}
                  onChangeText={(v) => {
                    setError(null);
                    setWingInput(v);
                  }}
                  placeholder={t("setup.step2.wingPlaceholder")}
                  placeholderTextColor="#6e6e6e"
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={addWing}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  onPress={addWing}
                  className="h-10 px-4 rounded-lg border border-brand-500 items-center justify-center self-center"
                  accessibilityRole="button"
                  accessibilityLabel="Add wing"
                >
                  <Text className="text-sm font-medium text-brand-500">Add</Text>
                </TouchableOpacity>
              </View>

              {/* Wing chips */}
              {wings.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {wings.map((wing) => (
                    <View
                      key={wing}
                      className="flex-row items-center bg-brand-50 border border-brand-500 rounded-full px-3 py-1"
                    >
                      <Text className="text-sm text-brand-500 mr-1">{wing}</Text>
                      <Pressable
                        onPress={() => removeWing(wing)}
                        className="p-1"
                        accessibilityRole="button"
                        accessibilityLabel={`Remove wing ${wing}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={14} color="#12715A" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* No wings toggle */}
          <View className="flex-row items-center justify-between py-3 border-t border-neutral-100 mt-2">
            <Text className="text-base text-neutral-700 flex-1 flex-wrap mr-3">
              {t("setup.step2.noWings")}
            </Text>
            <Switch
              value={noWings}
              onValueChange={(v) => {
                setNoWings(v);
                setError(null);
                if (v) setWings([]);
              }}
              trackColor={{ false: "#e5e5e5", true: "#12715A" }}
              thumbColor="#ffffff"
              accessibilityRole="switch"
              accessibilityLabel={t("setup.step2.noWings")}
            />
          </View>

          {noWings && (
            <Text className="text-sm text-neutral-500 mt-1 mb-2">
              All flats will be under one block.
            </Text>
          )}

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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
