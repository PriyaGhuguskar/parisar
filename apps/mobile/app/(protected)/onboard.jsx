import { useRouter } from "expo-router";
import { Shield, Users } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { FormError } from "../../components/auth/FormError";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { RoleCard } from "../../components/auth/RoleCard";
import { LogoutButton } from "../../components/LogoutButton";
import { getSupabase } from "../../lib/supabase";

/**
 * Screen 4 — Role Selection / Onboard (new users only)
 * Collects full_name and role (secretary|member), inserts profiles row.
 * signup_intent is stored on profiles for Phase 3 to consume.
 */
export default function OnboardScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [selectedRole, setSelectedRole] = useState(null);
  const [name, setName] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const nameValid = name.trim().length >= 2 && name.trim().length <= 60;
  const canContinue = selectedRole !== null && nameValid;

  async function handleContinue() {
    if (!canContinue) {
      if (!nameValid) setError(t("auth.nameRequired"));
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabase();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError(t("auth.networkError"));
        return;
      }

      const { error: insertError } = await supabase.from("profiles").insert({
        user_id: user.id,
        full_name: name.trim(),
        phone: user.phone ? `+${user.phone}` : null,
        signup_intent: selectedRole,
      });

      if (insertError) {
        setError(t("auth.networkError"));
        return;
      }

      if (selectedRole === "secretary") {
        router.replace("/(protected)/setup");
      } else {
        router.replace("/(protected)/join");
      }
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {/* Header with logout */}
      <View className="flex-row justify-end pt-4">
        <LogoutButton />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-4">
            {/* Heading */}
            <Text className="text-xl font-semibold text-neutral-900">
              {t("auth.roleSelectHeading")}
            </Text>

            {/* Sub-heading */}
            <Text className="text-base text-neutral-600">{t("auth.roleSelectSubheading")}</Text>

            {/* Role cards — stacked vertically (D5: Devanagari needs full width) */}
            <View className="gap-4">
              <RoleCard
                icon={Shield}
                title={t("auth.roleSecretary")}
                description={t("auth.roleSecretaryDesc")}
                selected={selectedRole === "secretary"}
                onPress={() => setSelectedRole("secretary")}
              />
              <RoleCard
                icon={Users}
                title={t("auth.roleMember")}
                description={t("auth.roleMemberDesc")}
                selected={selectedRole === "member"}
                onPress={() => setSelectedRole("member")}
              />
            </View>

            {/* Name input */}
            <View className="gap-1">
              <Text className="text-sm text-neutral-600">{t("auth.nameLabel")}</Text>
              <TextInput
                className={[
                  "h-14 rounded-lg bg-neutral-0 px-3 text-base text-neutral-900",
                  nameFocused ? "border-2 border-brand-700" : "border border-neutral-200",
                ].join(" ")}
                value={name}
                onChangeText={setName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder={t("auth.namePlaceholder")}
                placeholderTextColor="#6e6e6e"
                maxLength={60}
                accessibilityLabel={t("auth.nameLabel")}
                returnKeyType="done"
                textContentType="name"
                autoCapitalize="words"
              />
              <FormError message={error} />
            </View>

            {/* Continue button */}
            <PrimaryButton
              label={loading ? t("auth.saving") : t("auth.continue")}
              onPress={handleContinue}
              loading={loading}
              disabled={!canContinue}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
