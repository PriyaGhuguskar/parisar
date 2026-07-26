// FineDetailBlock — the fine sub-block on the flat-action detail screen.
//
// Visual contract per 06-UI-SPEC.md Screen 2b §Section 2 (FineDetailBlock).
//
// IMPORTANT (D-04): overdue is a DERIVED display state (fine-overdue.js) — no stored
// 'overdue' status, no push, no escalation. The amount is a RECORDED figure, NEVER a
// payment field (PROJECT.md NO PAYMENTS).
//
// FLAT-05 LOCKED-VERBATIM: the no-payment footer renders via t("fine.noPaymentFooter").
// The JSON value is unchanged (Plan 07-01 locked-verbatim snapshot tests guard byte exactness).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { format } from "date-fns";
import { FileText, Info } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { isOverdue, overdueDays } from "../../lib/fine-overdue";
import { FineStatusBadge } from "./FineStatusBadge";

const BRAND_500 = "#12715A";
const NEUTRAL_600 = "#525252";
const DANGER_500 = "#c81e1e";

function safeDate(value) {
  if (!value) return "—";
  try {
    return format(new Date(value), "dd MMM yyyy");
  } catch {
    return String(value);
  }
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  try {
    return n.toLocaleString("en-IN");
  } catch {
    return String(n);
  }
}

/**
 * @param {{
 *   amount: number|string|null,
 *   dueDate: string|number|Date|null,
 *   status: 'outstanding'|'acknowledged'|'waived',
 *   pdf?: { name?: string|null, onOpen?: () => void }|null,
 *   isMemberResident?: boolean,
 *   isAdmin?: boolean,
 *   onAcknowledge?: () => void,
 *   onWaive?: () => void,
 *   acknowledging?: boolean,
 *   waiving?: boolean,
 *   actionError?: string|null,
 *   nowMs?: number,
 * }} props
 */
export function FineDetailBlock({
  amount,
  dueDate,
  status,
  pdf = null,
  isMemberResident = false,
  isAdmin = false,
  onAcknowledge,
  onWaive,
  acknowledging = false,
  waiving = false,
  actionError = null,
  nowMs = Date.now(),
}) {
  const { t } = useTranslation("flat-actions");
  // Phase 7 IN-02 — both helpers now share the 3-arg (fineStatus, dueDate, nowMs)
  // signature from @parisar/api-client. The old 2-arg mobile-only overdueDays
  // dropped the status gate; the unified signature makes the gate explicit so
  // an acknowledged / waived fine can never be displayed as overdue.
  const overdue = isOverdue(status, dueDate, nowMs);
  const days = overdue ? overdueDays(status, dueDate, nowMs) : 0;

  // Action eligibility — gated by role + status.
  const canAcknowledge = isMemberResident && status === "outstanding";
  // Waive is ADMIN-ONLY (D-04). A regular board_member must NOT see it.
  const canWaive = isAdmin && (status === "outstanding" || status === "acknowledged");

  // LOCKED-VERBATIM (FLAT-05): the no-payment footer is rendered via t().
  // The byte-exact value lives in flat-actions.json (Plan 07-01 snapshot suite).
  const noPaymentFooter = t("fine.noPaymentFooter", {
    defaultValue: t("flatAction.noPaymentFooter"),
  });

  return (
    <View className="bg-white rounded-xl p-6 gap-4">
      {/* Amount — a recorded figure, NOT a payment field */}
      <View className="gap-1">
        <Text className="text-sm text-neutral-600">{t("flatAction.amountHeading")}</Text>
        <Text className="text-xl font-semibold text-neutral-900">
          {t("flatAction.amountValue", { amount: formatAmount(amount) })}
        </Text>
      </View>

      {/* Due date / overdue line */}
      <View className="flex-row items-center gap-2 flex-wrap">
        {overdue ? (
          <Text className="text-sm" style={{ color: DANGER_500 }} numberOfLines={2}>
            {t("flatAction.overdueBy", { days: String(days) })}
          </Text>
        ) : (
          <Text className="text-sm text-neutral-600" numberOfLines={2}>
            {t("flatAction.dueOn", { date: safeDate(dueDate) })}
          </Text>
        )}
        <FineStatusBadge status={status} dueDate={dueDate} nowMs={nowMs} />
      </View>

      {/* PDF pill (if a bylaw/AGM resolution is attached) */}
      {pdf ? (
        <Pressable
          onPress={() => pdf.onOpen?.()}
          className="flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3"
          accessibilityRole="button"
          accessibilityLabel={`${pdf.name ?? "PDF"}. ${t("flatAction.openPdf")}`}
        >
          <FileText size={24} color={BRAND_500} />
          <View className="flex-1">
            <Text className="text-base text-neutral-900" numberOfLines={1}>
              {pdf.name ?? "Attachment.pdf"}
            </Text>
            <Text className="text-sm text-neutral-600">{t("flatAction.openPdf")}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* LOCKED no-payment footer (FLAT-05) — verbatim via t("fine.noPaymentFooter"). */}
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

      {/* Action row */}
      {canAcknowledge ? (
        <View className="gap-2">
          <Pressable
            onPress={() => onAcknowledge?.()}
            disabled={acknowledging}
            accessibilityRole="button"
            accessibilityLabel={t("flatAction.acknowledgeCta")}
            accessibilityState={{ disabled: acknowledging, busy: acknowledging }}
            className={[
              "h-10 px-4 rounded-lg items-center justify-center",
              acknowledging ? "bg-neutral-200" : "bg-brand-500 active:bg-brand-600",
            ].join(" ")}
          >
            {acknowledging ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">
                {t("flatAction.acknowledgeCta")}
              </Text>
            )}
          </Pressable>
          {/* Reinforce D-04 / no-payment: acknowledging is NOT a payment. */}
          <Text className="text-sm text-neutral-600">{t("flatAction.acknowledgeHint")}</Text>
        </View>
      ) : null}

      {canWaive ? <WaiveConfirm t={t} onWaive={onWaive} waiving={waiving} /> : null}

      {actionError ? (
        <Text className="text-sm" style={{ color: DANGER_500 }} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}
    </View>
  );
}

// Waive uses an inline one-line confirm.
function WaiveConfirm({ t, onWaive, waiving }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Pressable
        onPress={() => setConfirming(true)}
        disabled={waiving}
        accessibilityRole="button"
        accessibilityLabel={t("flatAction.waiveCta")}
        className="h-10 px-4 rounded-lg items-center justify-center bg-white"
        style={{ borderWidth: 1.5, borderColor: NEUTRAL_600 }}
      >
        <Text className="text-base font-semibold" style={{ color: NEUTRAL_600 }}>
          {t("flatAction.waiveCta")}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-sm text-neutral-600">{t("flatAction.waiveConfirm")}</Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => onWaive?.()}
          disabled={waiving}
          accessibilityRole="button"
          accessibilityLabel={t("flatAction.waiveCta")}
          accessibilityState={{ disabled: waiving, busy: waiving }}
          className={[
            "flex-1 h-10 px-4 rounded-lg items-center justify-center",
            waiving ? "bg-neutral-200" : "bg-white",
          ].join(" ")}
          style={waiving ? undefined : { borderWidth: 1.5, borderColor: NEUTRAL_600 }}
        >
          {waiving ? (
            <ActivityIndicator color={NEUTRAL_600} />
          ) : (
            <Text className="text-base font-semibold" style={{ color: NEUTRAL_600 }}>
              {t("flatAction.waiveCta")}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => setConfirming(false)}
          disabled={waiving}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="flex-1 h-10 px-4 rounded-lg items-center justify-center border border-neutral-200"
        >
          <Text className="text-base text-neutral-600">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
