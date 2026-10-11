// IssueActionForm — the admin-only Issue Flat Action form (Warning / Fine / Notify).
//
// Visual contract per 06-UI-SPEC.md Screen 1.
//
// FLAT-05: the LOCKED no-payment footer is rendered via t("flatAction.noPaymentFooter")
// (Plan 07-01 locked-verbatim snapshot suite guards byte-exact preservation).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { issueFlatAction, uploadFinePdf } from "@parisar/api-client";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { CalendarDays, FileText, Info, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useDateLocale } from "../hooks/use-date-locale";
import { cryptoRandomUUID } from "../shared/uuid";
import { Text } from "../ui/Text";
import { FlatPicker } from "./FlatPicker";

const BRAND_500 = "#12715A";
const NEUTRAL_600 = "#475569";
const DANGER_500 = "#c81e1e";

const REASON_MAX = 1000;
const MESSAGE_MAX = 2000;
const AMOUNT_MAX = 1000000; // ₹10,00,000 defensive cap (FLAT-01)

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @param {{
 *   supabase: object,
 *   societyId: string,
 *   flats: Array,
 *   onSuccess?: () => void,
 * }} props
 */
export function IssueActionForm({ supabase, societyId, flats = [], onSuccess }) {
  const { t } = useTranslation("flat-actions");
  const dateLocale = useDateLocale();
  const actionId = useMemo(() => cryptoRandomUUID(), []);
  // Synchronous double-tap guard (state updates land a render later).
  const submitLockRef = useRef(false);

  const [flatId, setFlatId] = useState(null);
  const [kind, setKind] = useState("warning"); // default Warning (least severe)
  const [reason, setReason] = useState(""); // shared by warning + fine
  const [message, setMessage] = useState(""); // notify
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pdf, setPdf] = useState(null); // { storageKey, mimeType, byteSize, name }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const amountNum = Number(amount);
  const amountValid =
    amount !== "" && !Number.isNaN(amountNum) && amountNum > 0 && amountNum <= AMOUNT_MAX;

  // Per-kind validity for Submit gating.
  const valid = useMemo(() => {
    if (!flatId) return false;
    if (kind === "warning") return reason.trim().length >= 10;
    if (kind === "notify") return message.trim().length >= 1;
    if (kind === "fine") return amountValid && reason.trim().length >= 10 && !!dueDate;
    return false;
  }, [flatId, kind, reason, message, amountValid, dueDate]);

  // LOCKED no-payment footer (FLAT-05) — verbatim key, never re-worded here.
  const noPaymentFooter = t("flatAction.noPaymentFooter");

  function selectKind(nextKind) {
    setKind(nextKind);
    // The PDF only belongs to a fine; drop it when switching away so a stale
    // attachment is never submitted (or shown) with a warning/notify.
    if (nextKind !== "fine") {
      setPdf(null);
      setPdfError(null);
    }
  }

  async function handlePickPdf() {
    setPdfError(null);
    try {
      const result = await uploadFinePdf(supabase, { societyId, actionId });
      if (result) {
        setPdf({ ...result, name: t("flatAction.pdfAttachedName") });
      }
    } catch (err) {
      const code = err?.message ?? "";
      if (code.includes("PDF_TOO_LARGE")) {
        setPdfError(t("flatAction.pdfTooLarge"));
      } else {
        setPdfError(t("flatAction.pdfError"));
      }
    }
  }

  async function handleSubmit() {
    if (submitting || showSuccess || !valid || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    let issued = false;
    try {
      const body = kind === "notify" ? message.trim() : reason.trim();
      await issueFlatAction(supabase, {
        flatId,
        kind,
        body,
        // Pass the pre-generated id so the (already-uploaded) fine PDF key matches.
        actionId,
        amount: kind === "fine" ? amountNum : null,
        dueDate: kind === "fine" && dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        storageKey: kind === "fine" ? (pdf?.storageKey ?? null) : null,
        mimeType: kind === "fine" ? (pdf?.mimeType ?? null) : null,
        byteSize: kind === "fine" ? (pdf?.byteSize ?? null) : null,
      });
      // Keep the form locked after success — the 1s toast must not be
      // tappable into a second issue_flat_action call.
      issued = true;
      setShowSuccess(true);
      setTimeout(() => {
        onSuccess?.();
      }, 1000);
    } catch (err) {
      const code = err?.message ?? "";
      if (code.includes("INSUFFICIENT_ROLE")) {
        setSubmitError(t("flatAction.notAuthorized"));
      } else {
        setSubmitError(t("flatAction.issueError"));
      }
    } finally {
      if (!issued) {
        submitLockRef.current = false;
        setSubmitting(false);
      }
    }
  }

  const reasonLen = reason.length;
  const reasonCounterColor =
    reasonLen >= REASON_MAX ? DANGER_500 : reasonLen >= 900 ? "#f59e0b" : "#64748B";
  const messageLen = message.length;
  const messageCounterColor =
    messageLen >= MESSAGE_MAX ? DANGER_500 : messageLen >= 1900 ? "#f59e0b" : "#64748B";

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 96 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-white rounded-2xl p-4 gap-4">
        {/* Flat picker (required) */}
        <FlatPicker flats={flats} selectedId={flatId} onSelect={(f) => setFlatId(f?.id ?? null)} />

        {/* Kind segmented control */}
        <View className="gap-2">
          <Text className="text-sm text-neutral-600">{t("flatAction.kindLabel")}</Text>
          <View className="flex-row bg-neutral-100 rounded-xl p-1">
            <KindSegment
              label={t("flatAction.kindWarning")}
              active={kind === "warning"}
              onPress={() => selectKind("warning")}
            />
            <KindSegment
              label={t("flatAction.kindFine")}
              active={kind === "fine"}
              onPress={() => selectKind("fine")}
            />
            <KindSegment
              label={t("flatAction.kindNotify")}
              active={kind === "notify"}
              onPress={() => selectKind("notify")}
            />
          </View>
        </View>

        {/* Fine: amount */}
        {kind === "fine" ? (
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("flatAction.amountLabel")}</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ""))}
              placeholder={t("flatAction.amountPlaceholder")}
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              accessibilityLabel={t("flatAction.amountLabel")}
            />
          </View>
        ) : null}

        {/* Reason (warning + fine) / Message (notify) */}
        {kind === "notify" ? (
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("flatAction.messageLabel")}</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t("flatAction.messagePlaceholder")}
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={5}
              maxLength={MESSAGE_MAX}
              textAlignVertical="top"
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              style={{ minHeight: 120 }}
            />
            <Text className="text-sm self-end" style={{ color: messageCounterColor }}>
              {`${messageLen}/${MESSAGE_MAX}`}
            </Text>
          </View>
        ) : (
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("flatAction.reasonLabel")}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={t("flatAction.reasonPlaceholder")}
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={5}
              maxLength={REASON_MAX}
              textAlignVertical="top"
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              style={{ minHeight: 120 }}
            />
            <Text className="text-sm self-end" style={{ color: reasonCounterColor }}>
              {`${reasonLen}/${REASON_MAX}`}
            </Text>
          </View>
        )}

        {/* Fine: due date + PDF + LOCKED footer */}
        {kind === "fine" ? (
          <>
            <View className="gap-1">
              <Text className="text-sm text-neutral-600">{t("flatAction.dueDateLabel")}</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="flex-row items-center justify-between min-h-12 py-2 px-3 rounded-xl border border-neutral-200 bg-white"
                accessibilityRole="button"
                accessibilityLabel={t("flatAction.dueDateLabel")}
              >
                <Text
                  className={dueDate ? "text-base text-neutral-900" : "text-base text-neutral-400"}
                >
                  {dueDate
                    ? format(dueDate, "dd MMM yyyy", { locale: dateLocale })
                    : t("flatAction.dueDateLabel")}
                </Text>
                <CalendarDays size={20} color={BRAND_500} />
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={dueDate ?? startOfToday()}
                  mode="date"
                  minimumDate={startOfToday()}
                  onChange={(event, selected) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (event?.type === "dismissed") return;
                    if (selected) setDueDate(selected);
                  }}
                />
              ) : null}
            </View>

            {/* Optional bylaw/AGM PDF */}
            <View className="gap-1">
              <Text className="text-sm text-neutral-600">{t("flatAction.pdfLabel")}</Text>
              {pdf ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                  <FileText size={20} color={BRAND_500} />
                  <Text className="flex-1 text-base text-neutral-900" numberOfLines={1}>
                    {pdf.name}
                  </Text>
                  <Pressable
                    onPress={() => setPdf(null)}
                    accessibilityRole="button"
                    accessibilityLabel={t("flatAction.removePdf")}
                    className="p-1"
                  >
                    <X size={18} color={NEUTRAL_600} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handlePickPdf}
                  className="flex-row items-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-white p-3"
                  accessibilityRole="button"
                  accessibilityLabel={t("flatAction.pdfLabel")}
                >
                  <FileText size={20} color={BRAND_500} />
                  <Text className="text-base text-neutral-600">{t("flatAction.pdfLabel")}</Text>
                </Pressable>
              )}
              {pdfError ? (
                <Text className="text-sm" style={{ color: DANGER_500 }}>
                  {pdfError}
                </Text>
              ) : null}
            </View>

            {/* LOCKED no-payment footer (FLAT-05) — verbatim, always visible. */}
            <View
              className="flex-row items-start gap-2 rounded-xl bg-neutral-100 p-3"
              accessibilityRole="text"
              accessibilityLabel={noPaymentFooter}
            >
              <Info size={16} color={NEUTRAL_600} />
              <Text className="flex-1 text-base text-neutral-600" style={{ lineHeight: 24 }}>
                {noPaymentFooter}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {submitError ? (
        <Text className="text-sm" style={{ color: DANGER_500 }} accessibilityRole="alert">
          {submitError}
        </Text>
      ) : null}

      {/* Submit */}
      <Pressable
        onPress={handleSubmit}
        disabled={submitting || showSuccess || !valid}
        accessibilityRole="button"
        accessibilityLabel={t("flatAction.issueCta")}
        accessibilityState={{ disabled: submitting || showSuccess || !valid, busy: submitting }}
        className={[
          "min-h-14 py-2 w-full rounded-xl items-center justify-center",
          submitting || showSuccess || !valid
            ? "bg-neutral-200"
            : "bg-brand-500 active:bg-brand-600",
        ].join(" ")}
      >
        {submitting ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color="#ffffff" />
            <Text className="text-base font-semibold text-white">{t("flatAction.issuing")}</Text>
          </View>
        ) : (
          <Text className={`text-base font-semibold ${valid ? "text-white" : "text-neutral-400"}`}>
            {t("flatAction.issueCta")}
          </Text>
        )}
      </Pressable>

      {showSuccess ? (
        <View
          className="rounded-xl p-3 flex-row items-center gap-2"
          style={{ backgroundColor: "#ecfdf5" }}
          accessibilityRole="alert"
        >
          <Text className="text-neutral-900 text-base">{t("flatAction.issueSuccess")}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function KindSegment({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-lg items-center justify-center ${active ? "bg-brand-500" : "bg-transparent"}`}
      style={{ minHeight: 44 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        className={`text-sm font-semibold text-center ${active ? "text-white" : "text-neutral-600"}`}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}
