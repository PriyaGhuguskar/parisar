import { mapSocietyCodeError, onboardResident } from "@parisar/api-client";
import { ChevronDown, Trash2, UserPlus, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getSupabase } from "../../lib/supabase";
import { Text } from "../ui/Text";

const MAX_FAMILY_MEMBERS = 5;

/**
 * Inline dropdown picker (NativeWind + Modal pattern).
 */
function DropdownPicker({ label, value, options, placeholder, disabled, onSelect }) {
  const { t } = useTranslation("auth");
  const [open, setOpen] = useState(false);

  return (
    <View className="gap-1">
      {label ? <Text className="text-sm text-neutral-600">{label}</Text> : null}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        className={[
          "min-h-14 py-2 rounded-lg border px-3 flex-row items-center justify-between",
          disabled ? "bg-neutral-100 border-neutral-200" : "bg-neutral-0 border-neutral-200",
        ].join(" ")}
        accessibilityRole="button"
        accessibilityLabel={label || placeholder}
      >
        <Text
          className={["text-base flex-1", value ? "text-neutral-900" : "text-neutral-400"].join(
            " ",
          )}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <ChevronDown size={20} color="#64748B" />
      </Pressable>

      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setOpen(false)}>
            <View className="bg-neutral-0 rounded-t-2xl max-h-[60%]">
              <View className="px-4 pt-4 pb-2 flex-row items-center justify-between border-b border-neutral-100">
                <Text className="text-base font-semibold text-neutral-900">
                  {label || placeholder}
                </Text>
                <Pressable
                  onPress={() => setOpen(false)}
                  className="p-2"
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                >
                  <X size={20} color="#64748B" />
                </Pressable>
              </View>
              <ScrollView>
                {options.map((opt) => (
                  <Pressable
                    key={opt.id || opt}
                    onPress={() => {
                      onSelect(opt);
                      setOpen(false);
                    }}
                    className="px-4 py-3 border-b border-neutral-100 active:bg-neutral-50"
                  >
                    <Text
                      className={[
                        "text-base",
                        (opt.label || opt) === value
                          ? "text-brand-500 font-semibold"
                          : "text-neutral-900",
                      ].join(" ")}
                    >
                      {opt.label || opt}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

/**
 * Segmented control (2 options).
 */
function SegmentedControl({ options, value, onChange }) {
  return (
    <View className="flex-row min-h-11 rounded-xl overflow-hidden border border-neutral-200">
      {options.map(({ key, label }, idx) => (
        <Pressable
          key={key}
          onPress={() => onChange(key)}
          className={[
            "flex-1 items-center justify-center py-2 px-1",
            idx > 0 ? "border-l border-neutral-200" : "",
            value === key ? "bg-brand-500" : "bg-neutral-100",
          ].join(" ")}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === key }}
        >
          <Text
            className={[
              "text-base font-medium text-center",
              value === key ? "text-neutral-0" : "text-neutral-600",
            ].join(" ")}
            numberOfLines={2}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Section label separator.
 */
function SectionLabel({ text }) {
  return (
    <View className="flex-row items-center gap-2 mt-2">
      <Text className="text-sm text-neutral-400 uppercase tracking-wide">{text}</Text>
      <View className="flex-1 h-px bg-neutral-200" />
    </View>
  );
}

/**
 * Step 2 — Profile Form.
 *
 * Props:
 *   code, preview, structure, userProfile, onJoin
 */
export function ProfileForm({ code, preview, structure, userProfile, onJoin }) {
  const { t } = useTranslation("auth");
  const supabase = getSupabase();

  // About you
  const [fullName, setFullName] = useState(userProfile?.full_name ?? "");
  const [residency, setResidency] = useState("owner"); // 'owner' | 'tenant'
  // Shown for context only — onboard_resident (migration 054) has no household
  // parameter, so this choice is not persisted.
  const [household, setHousehold] = useState("family"); // 'family' | 'bachelor'

  // Your flat
  const [selectedWing, setSelectedWing] = useState(null);
  const [selectedFlat, setSelectedFlat] = useState(null);

  // Emergency contact
  const [emergencyContact, setEmergencyContact] = useState("");

  // Family members
  const [familyExpanded, setFamilyExpanded] = useState(false);
  const [familyMembers, setFamilyMembers] = useState([]);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Derive flat options from selected wing
  const wingOptions = (structure?.wings ?? []).map((w) => ({
    id: w.id,
    label: w.name,
    ...w,
  }));

  const flatOptions = selectedWing
    ? (structure?.flats ?? [])
        .filter((f) => f.wing_id === selectedWing.id)
        .map((f) => ({ id: f.id, label: f.number, ...f }))
    : [];

  const canSubmit =
    fullName.trim().length >= 2 &&
    residency &&
    household &&
    selectedWing &&
    selectedFlat &&
    !loading;

  function addFamilyMember() {
    if (familyMembers.length >= MAX_FAMILY_MEMBERS) return;
    setFamilyMembers((prev) => [...prev, { id: Date.now(), name: "", phone: "" }]);
  }

  function updateFamilyMember(id, field, value) {
    setFamilyMembers((prev) => prev.map((fm) => (fm.id === id ? { ...fm, [field]: value } : fm)));
  }

  function removeFamilyMember(id) {
    setFamilyMembers((prev) => prev.filter((fm) => fm.id !== id));
  }

  function resolveErrorMessage(key) {
    const resolved = t(key);
    if (resolved && resolved !== key) return resolved;
    return t("auth.networkError");
  }

  // One onboard_resident call (migration 054) does join + name + family
  // atomically, so a retry after a failure can't leave a half-written profile —
  // the direct family_members / profiles writes are revoked.
  async function handleSubmit() {
    if (loading) return;
    if (!canSubmit) {
      if (fullName.trim().length < 2) {
        setError(t("join.nameMin"));
        return;
      }
      if (!selectedFlat) {
        setError(t("auth.obNeedFlat"));
        return;
      }
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const family = familyMembers
        .filter((fm) => fm.name.trim().length >= 2)
        .map((fm) => ({ name: fm.name.trim(), phone: fm.phone.trim() || null }));

      const result = await onboardResident(supabase, {
        code,
        flatId: selectedFlat.id,
        fullName: fullName.trim(),
        residency,
        // The emergency contact is the committee-only backup number.
        altPhone: emergencyContact.trim() || null,
        family,
      });

      if (result.error) {
        if (result.error === "MEMBERSHIP_REMOVED") {
          setError(t("join.membershipRemoved"));
          return;
        }
        setError(resolveErrorMessage(mapSocietyCodeError(result)));
        return;
      }

      onJoin({
        status: result.status,
        societyName: preview?.name ?? "",
        flatNumber: selectedFlat.number || selectedFlat.label,
        autoElevatedToCoSecretary: false,
      });
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("TOO_MANY_CODE_ATTEMPTS")) setError(t("join.rateLimited"));
      else if (msg.includes("INVALID_NAME")) setError(t("join.nameMin"));
      else setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-4 pt-4">
        {/* Header */}
        <View className="gap-1">
          <Text className="text-xl font-semibold text-neutral-900">{t("join.profileHeading")}</Text>
          <Text className="text-base text-neutral-600">{t("join.profileSubheading")}</Text>
        </View>

        {/* Section: About you */}
        <SectionLabel text={t("join.sectionAboutYou")} />

        {/* Name */}
        <View className="gap-1">
          <Text className="text-sm text-neutral-600">{t("join.nameLabel")}</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder={t("auth.namePlaceholder")}
            placeholderTextColor="#64748B"
            maxLength={60}
            autoCapitalize="words"
            className="min-h-14 py-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-base text-neutral-900"
            accessibilityLabel={t("join.nameLabel")}
          />
        </View>

        {/* Mobile — locked */}
        <View className="gap-1">
          <Text className="text-sm text-neutral-600">{t("profile.phone")}</Text>
          <View className="min-h-14 py-2 rounded-lg border border-neutral-200 bg-neutral-100 px-3 flex-row items-center">
            <Text className="text-base text-neutral-600 flex-1">{userProfile?.phone ?? ""}</Text>
          </View>
          <Text className="text-xs text-neutral-400">{t("setup.step1.secretaryPhoneHelper")}</Text>
        </View>

        {/* Resident type */}
        <View className="gap-1">
          <Text className="text-sm text-neutral-600">{t("auth.obResidency")}</Text>
          <SegmentedControl
            options={[
              { key: "owner", label: t("join.owner") },
              { key: "tenant", label: t("join.tenant") },
            ]}
            value={residency}
            onChange={setResidency}
          />
        </View>

        {/* Household type */}
        <View className="gap-1">
          <Text className="text-sm text-neutral-600">{t("join.householdType")}</Text>
          <SegmentedControl
            options={[
              { key: "family", label: t("join.family") },
              { key: "bachelor", label: t("join.bachelor") },
            ]}
            value={household}
            onChange={setHousehold}
          />
        </View>

        {/* Section: Your flat */}
        <SectionLabel text={t("join.sectionYourFlat")} />

        {/* Wing picker */}
        <DropdownPicker
          label={t("setup.step4.wingLabel")}
          placeholder={t("join.wingPlaceholder")}
          value={selectedWing?.name ?? null}
          options={wingOptions}
          disabled={wingOptions.length === 0}
          onSelect={(opt) => {
            setSelectedWing(opt);
            setSelectedFlat(null);
          }}
        />

        {/* Flat picker */}
        <DropdownPicker
          label={t("profile.flat")}
          placeholder={selectedWing ? t("join.flatPlaceholder") : t("join.wingFirst")}
          value={selectedFlat?.number ?? null}
          options={flatOptions}
          disabled={!selectedWing || flatOptions.length === 0}
          onSelect={(opt) => setSelectedFlat(opt)}
        />

        {/* Emergency contact */}
        <View className="gap-1">
          <Text className="text-sm text-neutral-600">{t("join.emergencyContact")}</Text>
          <TextInput
            value={emergencyContact}
            onChangeText={setEmergencyContact}
            placeholder="98765 43210"
            placeholderTextColor="#64748B"
            keyboardType="phone-pad"
            maxLength={10}
            className="min-h-14 py-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-base text-neutral-900"
            accessibilityLabel={t("join.emergencyContact")}
          />
          <Text className="text-xs text-neutral-400">{t("join.emergencyHelper")}</Text>
        </View>

        {/* Section: Family members */}
        <SectionLabel text={t("join.sectionFamilyMembers")} />

        {/* Expand toggle */}
        <TouchableOpacity
          onPress={() => setFamilyExpanded(!familyExpanded)}
          activeOpacity={0.7}
          className="flex-row items-center gap-2"
          accessibilityRole="button"
        >
          <ChevronDown
            size={20}
            color="#12715A"
            style={{
              transform: [{ rotate: familyExpanded ? "180deg" : "0deg" }],
            }}
          />
          <Text className="text-sm text-brand-500">{t("join.addFamilyMember")}</Text>
        </TouchableOpacity>

        {familyExpanded && (
          <View className="gap-3">
            {familyMembers.map((fm) => (
              <View key={fm.id} className="flex-row gap-2 items-center">
                <View className="flex-1 gap-1">
                  <TextInput
                    value={fm.name}
                    onChangeText={(v) => updateFamilyMember(fm.id, "name", v)}
                    placeholder={t("join.familyNamePlaceholder")}
                    placeholderTextColor="#64748B"
                    maxLength={60}
                    autoCapitalize="words"
                    className="min-h-12 py-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-base text-neutral-900"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <TextInput
                    value={fm.phone}
                    onChangeText={(v) => updateFamilyMember(fm.id, "phone", v)}
                    placeholder={t("join.familyPhonePlaceholder")}
                    placeholderTextColor="#64748B"
                    keyboardType="phone-pad"
                    maxLength={10}
                    className="min-h-12 py-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-base text-neutral-900"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => removeFamilyMember(fm.id)}
                  className="p-2"
                  accessibilityRole="button"
                  accessibilityLabel={t("join.removeFamilyMember")}
                >
                  <Trash2 size={20} color="#c81e1e" />
                </TouchableOpacity>
              </View>
            ))}

            {familyMembers.length < MAX_FAMILY_MEMBERS && (
              <TouchableOpacity
                onPress={addFamilyMember}
                activeOpacity={0.7}
                className="min-h-12 py-2 rounded-xl border border-neutral-200 flex-row items-center justify-center gap-2"
                accessibilityRole="button"
              >
                <UserPlus size={16} color="#12715A" />
                <Text className="text-sm text-brand-500">{t("join.addFamilyMember")}</Text>
              </TouchableOpacity>
            )}

            {familyMembers.length >= MAX_FAMILY_MEMBERS && (
              <Text className="text-xs text-neutral-400 text-center">{t("join.familyMax")}</Text>
            )}
          </View>
        )}

        {/* Error */}
        {error ? <Text className="text-sm text-red-500">{error}</Text> : null}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.8}
          className={[
            "min-h-14 py-2 w-full rounded-xl items-center justify-center mt-2",
            canSubmit ? "bg-brand-500 active:bg-brand-600" : "bg-neutral-200",
          ].join(" ")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text
              className={[
                "text-base font-semibold",
                canSubmit ? "text-neutral-0" : "text-neutral-400",
              ].join(" ")}
            >
              {loading ? t("join.joining") : t("join.submit")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
