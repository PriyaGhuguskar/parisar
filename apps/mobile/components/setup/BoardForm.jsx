import { Trash2 } from "lucide-react-native";
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
 * BoardForm — Step 4 of the Secretary wizard.
 */
export function BoardForm({
  supabase,
  societyId,
  flatsByWing,
  coSecPhone,
  onNext,
  onBack,
  onSkip,
}) {
  const { t } = useTranslation("auth");
  const wings = Object.keys(flatsByWing);

  // Form fields for the current "add member" row
  const [memberName, setMemberName] = useState("");
  const [memberWing, setMemberWing] = useState("");
  const [memberFlatId, setMemberFlatId] = useState("");
  const [memberFlatDisplay, setMemberFlatDisplay] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // List of added board members
  const [boardMembers, setBoardMembers] = useState([]);
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Check if entered phone matches co-sec phone
  const isCoSecPhone =
    coSecPhone && memberPhone && memberPhone.replace(/\D/g, "") === coSecPhone.replace(/\D/g, "");

  // ---------------------------------------------------------------------------
  // Add a board member to the local list
  // ---------------------------------------------------------------------------
  function handleAddMember() {
    const errs = {};

    if (!memberName.trim() || memberName.trim().length < 2) {
      errs.name = "Name must be at least 2 characters.";
    }
    if (!memberWing || !memberFlatId) {
      errs.flat = "Please select a wing and flat.";
    }
    if (!/^[6-9]\d{9}$/.test(memberPhone)) {
      errs.phone = "Please enter a valid 10-digit mobile number.";
    }
    if (isCoSecPhone) {
      errs.phone =
        "This number is your Co-Secretary — they will be auto-elevated on join. No need to add them here.";
    }

    const duplicate = boardMembers.some((m) => m.phone === memberPhone);
    if (duplicate) {
      errs.phone = t("setup.step4.duplicateMobile");
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setFieldErrors({});
    setBoardMembers((prev) => [
      ...prev,
      {
        name: memberName.trim(),
        wing: memberWing,
        flatId: memberFlatId,
        flatDisplay: memberFlatDisplay,
        phone: memberPhone,
      },
    ]);

    // Reset form
    setMemberName("");
    setMemberWing("");
    setMemberFlatId("");
    setMemberFlatDisplay("");
    setMemberPhone("");
  }

  function removeBoardMember(index) {
    setBoardMembers((prev) => prev.filter((_, i) => i !== index));
  }

  // ---------------------------------------------------------------------------
  // Submit — INSERT board members into society_memberships
  // ---------------------------------------------------------------------------
  async function handleNext() {
    setSubmitError(null);
    setLoading(true);

    try {
      // PAR-107: a real insert failure is NOT success. Previously the {error} was
      // discarded entirely, so a partially-configured board advanced the wizard
      // as if every member had been added. Skips (unregistered member) stay benign.
      const failures = [];

      for (const member of boardMembers) {
        // Look up the user by phone to get their user_id
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("phone", `+91${member.phone}`)
          .maybeSingle();

        if (!profileRows?.user_id) {
          // User not yet registered — skip (they'll join via code later)
          continue;
        }

        const { error: insErr } = await supabase.from("society_memberships").insert({
          society_id: societyId,
          user_id: profileRows.user_id,
          flat_id: member.flatId,
          role: "board_member",
          status: "active",
        });

        if (insErr) failures.push(member.name);
      }

      if (failures.length > 0) {
        // Stay on this step so the Secretary can retry instead of continuing with
        // a partially-configured board.
        setSubmitError(`Could not add: ${failures.join(", ")}. Please try again.`);
        return;
      }

      onNext(boardMembers);
    } catch (err) {
      setSubmitError(err?.message ?? t("auth.networkError"));
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
        <WizardProgress currentStep={4} totalSteps={6} />

        {/* Step card */}
        <View className="bg-white rounded-2xl p-6 shadow-sm mt-2">
          {/* Title */}
          <Text className="text-xl font-semibold text-neutral-900 mb-1">
            {t("setup.step4.title")}
          </Text>

          {/* Info alert — Co-Secretary auto-elevation explanation */}
          <View className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-5">
            <Text className="text-sm text-neutral-700 flex-wrap">{t("setup.step4.subtitle")}</Text>
          </View>

          {/* Secretary pre-populated row (locked) */}
          <View className="flex-row items-center p-3 bg-neutral-50 rounded-xl mb-4 border border-neutral-100">
            <View className="w-9 h-9 rounded-full bg-brand-50 items-center justify-center mr-3">
              <Text className="text-sm font-semibold text-brand-500">SC</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base text-neutral-900 font-medium">You (Secretary)</Text>
              <View className="mt-1">
                <View className="bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5 self-start">
                  <Text className="text-xs text-brand-500">Secretary</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Added board members */}
          {boardMembers.map((member, idx) => {
            const initials = member.name.slice(0, 2).toUpperCase();
            const maskedPhone = member.phone.slice(0, 3) + "XXXX" + member.phone.slice(-2);
            return (
              <View
                key={idx}
                className="flex-row items-center p-3 bg-neutral-50 rounded-xl mb-3 border border-neutral-100"
              >
                <View className="w-9 h-9 rounded-full bg-brand-50 items-center justify-center mr-3">
                  <Text className="text-sm font-semibold text-brand-500">{initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base text-neutral-900 font-medium">{member.name}</Text>
                  <Text className="text-sm text-neutral-600">{member.flatDisplay}</Text>
                  <Text className="text-sm text-neutral-400">{maskedPhone}</Text>
                  <View className="mt-1">
                    <View className="bg-neutral-100 rounded-full px-2 py-0.5 self-start">
                      <Text className="text-xs text-neutral-600">Board Member</Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  onPress={() => removeBoardMember(idx)}
                  className="p-2"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${member.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={20} color="#c81e1e" />
                </Pressable>
              </View>
            );
          })}

          {/* Add member form */}
          <View className="mt-2">
            <Text className="text-base font-semibold text-neutral-900 mb-3">
              Add a board member
            </Text>

            {/* Name */}
            <View className="mb-3">
              <Text className="text-sm text-neutral-700 mb-1">Full name</Text>
              <TextInput
                className={[
                  "h-12 rounded-lg bg-neutral-50 border px-3 text-base text-neutral-900",
                  fieldErrors.name ? "border-danger-500" : "border-neutral-200",
                ].join(" ")}
                value={memberName}
                onChangeText={setMemberName}
                placeholder="Member's name"
                placeholderTextColor="#6e6e6e"
                maxLength={60}
                autoCapitalize="words"
              />
              {fieldErrors.name && (
                <Text className="text-sm text-danger-500 mt-1">{fieldErrors.name}</Text>
              )}
            </View>

            {/* Wing picker */}
            <View className="mb-3">
              <Text className="text-sm text-neutral-700 mb-1">Wing</Text>
              <View className="flex-row flex-wrap gap-2">
                {wings.map((w) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => {
                      setMemberWing(w);
                      setMemberFlatId("");
                      setMemberFlatDisplay("");
                      setFieldErrors((e) => ({ ...e, flat: undefined }));
                    }}
                    className={[
                      "px-4 py-2 rounded-full border",
                      memberWing === w
                        ? "bg-brand-500 border-brand-500"
                        : "bg-neutral-100 border-neutral-200",
                    ].join(" ")}
                  >
                    <Text
                      className={
                        memberWing === w ? "text-white text-sm" : "text-neutral-700 text-sm"
                      }
                    >
                      {w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Flat picker (chained on wing) */}
            {memberWing ? (
              <View className="mb-3">
                <Text className="text-sm text-neutral-700 mb-1">Flat</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(flatsByWing[memberWing] ?? []).map((flat) => {
                    const display = `${memberWing}-${flat.number}`;
                    return (
                      <TouchableOpacity
                        key={flat.id}
                        onPress={() => {
                          setMemberFlatId(flat.id);
                          setMemberFlatDisplay(display);
                          setFieldErrors((e) => ({ ...e, flat: undefined }));
                        }}
                        className={[
                          "px-4 py-2 rounded-full border",
                          memberFlatId === flat.id
                            ? "bg-brand-500 border-brand-500"
                            : "bg-neutral-100 border-neutral-200",
                        ].join(" ")}
                      >
                        <Text
                          className={
                            memberFlatId === flat.id
                              ? "text-white text-sm"
                              : "text-neutral-700 text-sm"
                          }
                        >
                          {display}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {fieldErrors.flat && (
                  <Text className="text-sm text-danger-500 mt-1">{fieldErrors.flat}</Text>
                )}
              </View>
            ) : (
              <Text className="text-sm text-neutral-400 mb-3">Select a wing first.</Text>
            )}

            {/* Mobile */}
            <View className="mb-3">
              <Text className="text-sm text-neutral-700 mb-1">Mobile number</Text>
              <TextInput
                className={[
                  "h-12 rounded-lg bg-neutral-50 border px-3 text-base text-neutral-900",
                  fieldErrors.phone || isCoSecPhone ? "border-danger-500" : "border-neutral-200",
                ].join(" ")}
                value={memberPhone}
                onChangeText={setMemberPhone}
                placeholder="98765 43210"
                placeholderTextColor="#6e6e6e"
                keyboardType="phone-pad"
                maxLength={10}
              />
              {isCoSecPhone && (
                <Text className="text-sm text-warning-500 mt-1">
                  This number is your Co-Secretary — they will be auto-elevated on join.
                </Text>
              )}
              {!isCoSecPhone && fieldErrors.phone && (
                <Text className="text-sm text-danger-500 mt-1">{fieldErrors.phone}</Text>
              )}
            </View>

            {/* Add Member button */}
            <TouchableOpacity
              onPress={handleAddMember}
              disabled={isCoSecPhone}
              className={[
                "h-12 rounded-xl border items-center justify-center",
                isCoSecPhone ? "border-neutral-200 bg-neutral-100" : "border-brand-500",
              ].join(" ")}
              accessibilityRole="button"
            >
              <Text
                className={
                  isCoSecPhone
                    ? "text-base text-neutral-400"
                    : "text-base text-brand-500 font-medium"
                }
              >
                Add Member
              </Text>
            </TouchableOpacity>
          </View>

          {/* Submit error */}
          {submitError && <FormError message={submitError} />}

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

          {/* Skip link */}
          <TouchableOpacity
            onPress={onSkip}
            className="items-center mt-4"
            accessibilityRole="button"
          >
            <Text className="text-sm text-brand-500">{t("setup.step4.skip")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
