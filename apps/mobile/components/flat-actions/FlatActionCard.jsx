// FlatActionCard — list row showing a single flat action (Warning / Fine / Notify).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { OwnerChip } from "../complaints/OwnerChip";
import { FineStatusBadge } from "./FineStatusBadge";
import { FlatActionKindBadge, KIND_ACCENT } from "./FlatActionKindBadge";
import { formatFlatLabel } from "./FlatPicker";

function safeAge(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return "";
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
 *   action: object,
 *   onPress?: (action: object) => void,
 *   showFlatPill?: boolean,
 *   nowMs?: number,
 * }} props
 */
export function FlatActionCard({ action, onPress, showFlatPill = false, nowMs = Date.now() }) {
  const { t } = useTranslation("flat-actions");
  const kind = action?.kind ?? "notify";
  const accent = KIND_ACCENT[kind] ?? KIND_ACCENT.notify;

  const issuerName = action?.issuer?.full_name ?? "—";
  const issuerFlat = formatFlatLabel(action?.issuer_flat);
  const issuedByLabel = t("flatAction.issuedBy", { name: issuerName, flat: issuerFlat });

  const targetFlat = formatFlatLabel(action?.flat);
  const age = safeAge(action?.created_at);

  const isFine = kind === "fine";
  const fineStatus = action?.fine_status ?? "outstanding";
  const amountText = formatAmount(action?.amount);

  const a11yLabel = `${kind} action: ${action?.body ?? ""}`;

  return (
    <Pressable
      onPress={() => onPress?.(action)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className="flex-row bg-white rounded-xl border border-neutral-200 overflow-hidden"
    >
      {/* Left accent stripe (by kind) */}
      <View style={{ width: 4, backgroundColor: accent }} />

      {/* Content */}
      <View className="flex-1 p-4 gap-2">
        <View className="flex-row items-center gap-2">
          <FlatActionKindBadge kind={kind} />
          {age ? (
            <Text className="text-sm text-neutral-400 ml-auto" numberOfLines={1}>
              {age}
            </Text>
          ) : null}
        </View>

        <Text className="text-base text-neutral-900" numberOfLines={2}>
          {action?.body ?? ""}
        </Text>

        {/* Fine sub-line (fine only) — status badge (overdue-aware) + ₹amount */}
        {isFine ? (
          <View className="flex-row items-center gap-2 flex-wrap">
            <FineStatusBadge status={fineStatus} dueDate={action?.due_date} nowMs={nowMs} />
            {amountText ? (
              <Text className="text-sm text-neutral-900">
                {t("flatAction.amountValue", { amount: amountText })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Attribution — "Issued by Amit (A-102)" (FLAT-02) */}
        <OwnerChip label={issuedByLabel} />

        {/* Target-flat pill — board view only (member always sees their own flat) */}
        {showFlatPill ? (
          <View
            className="rounded-full px-2 py-0.5 bg-neutral-100"
            style={{ alignSelf: "flex-start" }}
          >
            <Text className="text-sm text-neutral-600" numberOfLines={1}>
              {targetFlat}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
