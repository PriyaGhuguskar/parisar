// AuditLogRow — one moderation event in the audit-log trail (ResponseTrailItem token clone).
//
// Visual contract per 06-UI-SPEC.md Screen 8 §AuditLogRow (COMM-07).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const DOT_COLOR = {
  report: "#f59e0b",
  takedown: "#c81e1e",
  restore: "#047857",
};

function eventLabel(t, kind) {
  if (kind === "takedown") return t("moderation.eventTakedown");
  if (kind === "restore") return t("moderation.eventRestore");
  return t("moderation.eventReport");
}

function safeTime(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

/**
 * @param {{
 *   event: {
 *     event_kind: 'report'|'takedown'|'restore',
 *     created_at: string,
 *     reason?: string|null,
 *     target_kind?: string,
 *     actor?: { full_name?: string },
 *     actor_flat?: { number?: string, wing?: { name?: string } },
 *   },
 *   isLast?: boolean,
 * }} props
 */
export function AuditLogRow({ event, isLast = false }) {
  const { t } = useTranslation("moderation");
  const kind = event?.event_kind ?? "report";
  const dotColor = DOT_COLOR[kind] ?? DOT_COLOR.report;
  const label = eventLabel(t, kind);

  const actor = event?.actor?.full_name ?? "—";
  const flat = formatFlat(event?.actor_flat);
  const time = safeTime(event?.created_at);
  const byLine = t("moderation.eventBy", { actor, flat, time });

  // Target + reason line (e.g. "Post · Spam"). Target kind is the moderated content type.
  const targetKindLabel =
    event?.target_kind === "comment" ? t("moderation.kindComment") : t("moderation.kindPost");
  const reason = event?.reason ?? "";
  const targetLine = reason
    ? t("moderation.eventTarget", { target: targetKindLabel, reason })
    : targetKindLabel;

  return (
    <View className="flex-row gap-3">
      {/* Left rail: dot + connecting line */}
      <View className="items-center" style={{ width: 16 }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: dotColor,
            marginTop: 4,
          }}
        />
        {!isLast ? (
          <View style={{ flex: 1, width: 1, backgroundColor: "#e5e5e5", marginTop: 4 }} />
        ) : null}
      </View>

      {/* Right column */}
      <View className="flex-1 pb-4 gap-1">
        <Text className="text-sm font-semibold text-neutral-900">{label}</Text>
        <Text className="text-sm text-neutral-600" numberOfLines={2}>
          {byLine}
        </Text>
        <Text className="text-sm text-neutral-600" numberOfLines={2}>
          {targetLine}
        </Text>
      </View>
    </View>
  );
}
