// /(protected)/(tabs)/bookings/new — amenity booking request form (members + board).
//
// Per 05-UI-SPEC.md Screen 5 (DD-5):
//   - AmenityPicker (open/close hours hint) + TimeSlotPicker (date + paired start/end
//     time — NOT a month grid) + purpose multiline (optional, max 300).
//   - Client validation lives in TimeSlotPicker (end>start, <=4h, within hours, >=1h
//     lead, <=30d horizon); the screen mirrors the same server checks by mapping any
//     request_booking RPC error message (TIME_ORDER / LEAD_TIME / TOO_FAR / DURATION /
//     OUTSIDE_HOURS) to the matching inline error.
//   - Sticky brand.500 h-14 "Submit Request", disabled until amenity + a VALID range.
//   - NO optimistic UI: await requestBooking; on success → back to /bookings + toast.
//   - Slot conflict is impossible at request time (only APPROVED bookings are
//     exclusive — DD-13), so the form never shows slot_taken.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { listAmenities, requestBooking } from "@parisar/api-client";
import { useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { AmenityPicker } from "../../../../components/bookings/AmenityPicker";
import { TimeSlotPicker } from "../../../../components/bookings/TimeSlotPicker";
import { getSupabase } from "../../../../lib/supabase";

const PURPOSE_MAX = 300;

// Map a request_booking RPC error message → the matching localized inline error.
function mapRpcError(t, message, amenity) {
  const code = String(message ?? "");
  const openLabel = amenity?.open_time ? String(amenity.open_time).slice(0, 5) : "—";
  const closeLabel = amenity?.close_time ? String(amenity.close_time).slice(0, 5) : "—";
  if (code.includes("TIME_ORDER")) return t("booking.timeOrderError");
  if (code.includes("DURATION")) return t("booking.durationError");
  if (code.includes("OUTSIDE_HOURS")) {
    return t("booking.hoursError", { open: openLabel, close: closeLabel });
  }
  if (code.includes("LEAD_TIME") || code.includes("TOO_FAR")) return t("booking.leadTimeError");
  return t("booking.submitError");
}

export default function NewBookingScreen() {
  const router = useRouter();
  const { t } = useTranslation("bookings");

  const [amenities, setAmenities] = useState([]);
  const [amenity, setAmenity] = useState(null);
  const [range, setRange] = useState({ valid: false, error: null, startsAt: null, endsAt: null });
  const [purpose, setPurpose] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listAmenities(getSupabase());
        if (!cancelled) setAmenities(rows ?? []);
      } catch (err) {
        // PAR-110: a failed load used to only console.warn, leaving `amenities`
        // empty — indistinguishable from "this society has no amenities", with
        // Submit disabled forever and no way to tell it was broken. Surface it.
        console.warn("[bookings/new] listAmenities failed:", err?.message ?? err);
        if (!cancelled) setSubmitError(t("booking.loadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = !!amenity && range.valid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const supabase = getSupabase();
      // NO optimistic UI — await the RPC; the new pending row arrives on the list.
      await requestBooking(supabase, {
        amenityId: amenity.id,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        purpose: purpose.trim() || null,
      });
      setShowSuccess(true);
      setTimeout(() => router.back(), 1200);
    } catch (err) {
      console.warn("[bookings/new] requestBooking failed:", err?.message ?? err);
      setSubmitError(mapRpcError(t, err?.message, amenity));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-neutral-50"
    >
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("booking.requestTitle")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View className="bg-white rounded-2xl p-4 gap-4 border border-neutral-200">
          <AmenityPicker
            amenities={amenities}
            selectedId={amenity?.id ?? null}
            onSelect={(a) => {
              setAmenity(a);
              // Re-validate the existing range against the new amenity's hours.
              setRange((prev) => ({ ...prev }));
            }}
          />

          <TimeSlotPicker amenity={amenity} onChange={setRange} />

          {/* Purpose (optional) */}
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("booking.purposeLabel")}</Text>
            <TextInput
              value={purpose}
              onChangeText={(v) => setPurpose(v.slice(0, PURPOSE_MAX))}
              placeholder={t("booking.purposePlaceholder")}
              placeholderTextColor="#6e6e6e"
              multiline
              numberOfLines={3}
              maxLength={PURPOSE_MAX}
              textAlignVertical="top"
              className="min-h-[80px] px-3 py-2 rounded-xl border border-neutral-200 bg-white text-base text-neutral-900"
              accessibilityLabel={t("booking.purposeLabel")}
            />
            <Text className="text-sm text-neutral-400 self-end">
              {purpose.length}/{PURPOSE_MAX}
            </Text>
          </View>

          {submitError ? (
            <Text className="text-sm text-danger-500" accessibilityRole="alert">
              {submitError}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky Submit */}
      <View className="absolute left-0 right-0 bottom-0 px-4 pb-8 pt-2 bg-neutral-50 border-t border-neutral-100">
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t("booking.submitCta")}
          accessibilityState={{ disabled: !canSubmit }}
          className={[
            "h-14 rounded-xl items-center justify-center flex-row gap-2",
            canSubmit ? "bg-brand-500 active:bg-brand-600" : "bg-neutral-200",
          ].join(" ")}
        >
          {submitting ? <ActivityIndicator color="#ffffff" /> : null}
          <Text
            className="text-base font-semibold"
            style={{ color: canSubmit ? "#ffffff" : "#6e6e6e" }}
          >
            {submitting ? t("booking.submitting") : t("booking.submitCta")}
          </Text>
        </Pressable>
      </View>

      {/* Success toast */}
      {showSuccess ? (
        <View
          className="absolute left-4 right-4 flex-row items-center gap-2 border border-success-500 rounded-xl p-3"
          style={{ top: 56, backgroundColor: "#ecfdf5" }}
          accessibilityRole="alert"
        >
          <CheckCircle2 size={16} color="#047857" />
          <Text className="text-neutral-900 text-base">{t("booking.submitSuccess")}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
