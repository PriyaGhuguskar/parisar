import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FormError } from "../auth/FormError";
import { Text } from "../ui/Text";
import { WizardProgress } from "./WizardProgress";

// secretary_add_board_member (migration 054) result statuses that mean "this
// member is on the board now" — a retry never calls the RPC for them again.
const DONE_STATUSES = new Set(["added", "promoted", "already_board"]);

const RPC_ERROR_KEYS = [
  ["INVALID_PHONE", "auth.invalidPhone"],
  ["FLAT_NOT_IN_SOCIETY", "setup.step4.errFlat"],
  ["CANNOT_CHANGE_OWN_ROLE", "setup.step4.errSelf"],
  ["ONLY_SECRETARY_CAN_SET_ROLE", "setup.step4.errNotSecretary"],
];

function rpcErrorKey(error) {
  const msg = String(error?.message ?? "");
  const hit = RPC_ERROR_KEYS.find(([code]) => msg.includes(code));
  return hit ? hit[1] : "setup.step4.errGeneric";
}

const STATUS_LABEL_KEYS = {
  added: "setup.step4.statusAdded",
  promoted: "setup.step4.statusAdded",
  already_board: "setup.step4.statusAlreadyBoard",
  not_registered: "setup.step4.statusNotRegistered",
};

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
  // Per-member RPC outcome, keyed by phone: { status } | { errorKey }.
  const [results, setResults] = useState({});
  // Set once the Secretary has been told some numbers aren't registered yet;
  // the next Continue proceeds (they'll join with the Society Code later).
  const [notRegisteredAcknowledged, setNotRegisteredAcknowledged] = useState(false);

  // Check if entered phone matches co-sec phone
  const isCoSecPhone =
    coSecPhone && memberPhone && memberPhone.replace(/\D/g, "") === coSecPhone.replace(/\D/g, "");

  // ---------------------------------------------------------------------------
  // Add a board member to the local list
  // ---------------------------------------------------------------------------
  function handleAddMember() {
    const errs = {};

    if (!memberName.trim() || memberName.trim().length < 2) {
      errs.name = t("setup.step4.nameMin");
    }
    if (!memberWing || !memberFlatId) {
      errs.flat = t("setup.step4.flatRequired");
    }
    if (!/^[6-9]\d{9}$/.test(memberPhone)) {
      errs.phone = t("auth.invalidPhone");
    }
    if (isCoSecPhone) {
      errs.phone = t("setup.step4.coSecAutoElevated");
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
    const removed = boardMembers[index];
    setBoardMembers((prev) => prev.filter((_, i) => i !== index));
    if (removed) {
      setResults((prev) => {
        const { [removed.phone]: _dropped, ...rest } = prev;
        return rest;
      });
    }
  }

  async function addOne(member) {
    try {
      const { data, error } = await supabase.rpc("secretary_add_board_member", {
        p_society_id: societyId,
        p_phone: member.phone,
        p_flat_id: member.flatId,
      });
      if (error) return { errorKey: rpcErrorKey(error) };
      return { status: data?.status ?? "added" };
    } catch {
      return { errorKey: "auth.networkError" };
    }
  }

  // ---------------------------------------------------------------------------
  // Submit — secretary_add_board_member per member (migration 054 revoked the
  // direct society_memberships insert). Members already on the board from a
  // previous attempt are skipped, so a retry is idempotent.
  // ---------------------------------------------------------------------------
  async function handleNext() {
    if (loading) return;
    setSubmitError(null);
    setLoading(true);

    try {
      const next = { ...results };
      for (const member of boardMembers) {
        if (DONE_STATUSES.has(next[member.phone]?.status)) continue;
        next[member.phone] = await addOne(member);
      }
      setResults(next);

      const failed = boardMembers.filter((m) => next[m.phone]?.errorKey);
      if (failed.length > 0) {
        // Stay on this step so the Secretary can fix/retry instead of
        // continuing with a partially-configured board.
        setSubmitError(t("setup.step4.addFailed", { names: failed.map((m) => m.name).join(", ") }));
        return;
      }

      const notRegistered = boardMembers.filter((m) => next[m.phone]?.status === "not_registered");
      if (notRegistered.length > 0 && !notRegisteredAcknowledged) {
        setNotRegisteredAcknowledged(true);
        return;
      }

      onNext(boardMembers);
    } finally {
      setLoading(false);
    }
  }

  const hasNotRegistered = boardMembers.some((m) => results[m.phone]?.status === "not_registered");

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
              <Text className="text-base text-neutral-900 font-medium">
                {t("setup.step4.youSecretary")}
              </Text>
              <View className="mt-1">
                <View className="bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5 self-start">
                  <Text className="text-xs text-brand-500">{t("profile.roleSecretary")}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Added board members */}
          {boardMembers.map((member, idx) => {
            const initials = member.name.slice(0, 2).toUpperCase();
            const maskedPhone = `${member.phone.slice(0, 3)}XXXX${member.phone.slice(-2)}`;
            const result = results[member.phone];
            let resultLabel = null;
            if (result?.errorKey) resultLabel = t(result.errorKey);
            else if (result?.status)
              resultLabel = t(STATUS_LABEL_KEYS[result.status] ?? "setup.step4.statusAdded");
            return (
              <View
                key={member.phone}
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
                      <Text className="text-xs text-neutral-600">{t("profile.roleBoard")}</Text>
                    </View>
                  </View>
                  {resultLabel ? (
                    <Text
                      className={`text-sm mt-1 ${result?.errorKey ? "text-danger-500" : "text-neutral-600"}`}
                    >
                      {resultLabel}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => removeBoardMember(idx)}
                  className="p-2"
                  accessibilityRole="button"
                  accessibilityLabel={t("setup.step4.removeMember", { name: member.name })}
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
              {t("setup.step4.addHeading")}
            </Text>

            {/* Name */}
            <View className="mb-3">
              <Text className="text-sm text-neutral-700 mb-1">{t("profile.fullName")}</Text>
              <TextInput
                className={[
                  "min-h-12 py-2 rounded-lg bg-neutral-50 border px-3 text-base text-neutral-900",
                  fieldErrors.name ? "border-danger-500" : "border-neutral-200",
                ].join(" ")}
                value={memberName}
                onChangeText={setMemberName}
                placeholder={t("setup.step4.namePlaceholder")}
                placeholderTextColor="#64748B"
                maxLength={60}
                autoCapitalize="words"
              />
              {fieldErrors.name && (
                <Text className="text-sm text-danger-500 mt-1">{fieldErrors.name}</Text>
              )}
            </View>

            {/* Wing picker */}
            <View className="mb-3">
              <Text className="text-sm text-neutral-700 mb-1">{t("setup.step4.wingLabel")}</Text>
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
                <Text className="text-sm text-neutral-700 mb-1">{t("profile.flat")}</Text>
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
              <Text className="text-sm text-neutral-400 mb-3">{t("join.wingFirst")}</Text>
            )}

            {/* Mobile */}
            <View className="mb-3">
              <Text className="text-sm text-neutral-700 mb-1">{t("setup.step4.phoneLabel")}</Text>
              <TextInput
                className={[
                  "min-h-12 py-2 rounded-lg bg-neutral-50 border px-3 text-base text-neutral-900",
                  fieldErrors.phone || isCoSecPhone ? "border-danger-500" : "border-neutral-200",
                ].join(" ")}
                value={memberPhone}
                onChangeText={setMemberPhone}
                placeholder="98765 43210"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
                maxLength={10}
              />
              {isCoSecPhone && (
                <Text className="text-sm text-warning-500 mt-1">
                  {t("setup.step4.coSecAutoElevated")}
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
                "min-h-12 py-2 rounded-xl border items-center justify-center",
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
                {t("setup.step4.addCta")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Unregistered numbers are benign — they join with the Society Code later. */}
          {hasNotRegistered && notRegisteredAcknowledged && !submitError ? (
            <View className="bg-brand-50 border border-brand-200 rounded-xl p-3 mt-4">
              <Text className="text-sm text-neutral-700">{t("setup.step4.notRegisteredNote")}</Text>
            </View>
          ) : null}

          {/* Submit error */}
          {submitError && <FormError message={submitError} />}

          {/* Navigation buttons */}
          <View className="flex-row gap-3 mt-6">
            <TouchableOpacity
              onPress={onBack}
              className="flex-1 min-h-14 py-2 rounded-xl border border-neutral-200 items-center justify-center"
              accessibilityRole="button"
            >
              <Text className="text-base font-medium text-neutral-900">{t("auth.obBack")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNext}
              disabled={loading}
              activeOpacity={0.8}
              className={[
                "flex-1 min-h-14 py-2 rounded-xl items-center justify-center",
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
