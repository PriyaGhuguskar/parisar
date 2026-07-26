import {
  formatSocietyCode,
  isValidSocietyCode,
  listSocietyStructure,
  mapSocietyCodeError,
  validateSocietyCode,
} from "@parisar/api-client";
import { Key } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, View } from "react-native";
import { getSupabase } from "../../lib/supabase";
import { PrimaryButton } from "../auth/PrimaryButton";

/**
 * Step 0 — Society Code Entry.
 *
 * Props:
 *   initialCode  — string (from deep link ?code= query param)
 *   onValid      — function({ preview, structure }) — called when code is confirmed valid
 */
export function CodeEntry({ initialCode = "", onValid }) {
  const { t } = useTranslation("auth");
  const [rawCode, setRawCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(false);

  // Derive formatted code from raw input for display purposes
  const canSubmit = isValidSocietyCode(rawCode) && !loading;

  /**
   * Auto-insert a hyphen after the 4th character.
   */
  function handleChange(text) {
    // Strip all non-alphanumeric chars, uppercase
    const cleaned = text.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    if (cleaned.length <= 4) {
      setRawCode(cleaned);
    } else {
      // Insert hyphen between position 4 and 5
      const withHyphen = cleaned.slice(0, 4) + "-" + cleaned.slice(4, 8);
      setRawCode(withHyphen);
    }
    setError(null);
  }

  // Resolve a dotted i18n key like 'join.codeNotFound' via t().
  function resolveErrorMessage(key) {
    const resolved = t(key);
    if (resolved && resolved !== key) return resolved;
    return t("auth.networkError");
  }

  async function handleFindSociety() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabase();

      // 1. Validate the code — returns society preview or { error }
      const preview = await validateSocietyCode(supabase, rawCode);
      if (preview.error) {
        const i18nKey = mapSocietyCodeError(preview);
        setError(resolveErrorMessage(i18nKey));
        return;
      }

      // 2. Load wings + flats (pre-membership lookup via list_society_structure)
      const structure = await listSocietyStructure(supabase, rawCode);
      if (structure && structure.error) {
        const i18nKey = mapSocietyCodeError(structure);
        setError(resolveErrorMessage(i18nKey));
        return;
      }

      onValid({ preview, structure, code: formatSocietyCode(rawCode) });
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="gap-6 pt-4">
      {/* Icon + heading */}
      <View className="items-center gap-3">
        <Key size={48} color="#12715A" />
        <Text className="text-[28px] font-semibold text-neutral-900 text-center">
          {t("join.heading")}
        </Text>
        <Text className="text-base text-neutral-600 text-center">{t("join.body")}</Text>
      </View>

      {/* Code input */}
      <View className="gap-2">
        <Text className="text-sm text-neutral-600">{t("join.codeLabel")}</Text>
        <TextInput
          value={rawCode}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="XXXX-XXXX"
          placeholderTextColor="#6e6e6e"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          style={{
            height: 72,
            fontFamily: "Courier New",
            fontSize: 28,
            fontWeight: "600",
            letterSpacing: 8,
            borderWidth: focused ? 2 : 1.5,
            borderColor: focused ? "#4338ca" : "#e5e5e5",
            borderRadius: 12,
            paddingHorizontal: 12,
            backgroundColor: "#ffffff",
            color: "#171717",
            textTransform: "uppercase",
          }}
          accessibilityLabel={t("join.codeLabel")}
          returnKeyType="search"
          onSubmitEditing={handleFindSociety}
        />

        {/* Error */}
        {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
      </View>

      {/* Find Society button */}
      <PrimaryButton
        label={loading ? t("join.lookingUp") : t("join.findSociety")}
        onPress={handleFindSociety}
        loading={loading}
        disabled={!canSubmit}
      />
    </View>
  );
}
