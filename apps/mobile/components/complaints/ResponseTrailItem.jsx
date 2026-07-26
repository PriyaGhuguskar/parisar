// ResponseTrailItem — single attributed entry in the complaint response trail.
//
// Visual contract per 04-UI-SPEC.md Screen 3 Section 4:
//   - Left: 12px colored circle keyed to response_kind (brand / warning / success)
//   - Connecting vertical line between items (1px neutral.200) — hidden on isLast
//   - Right line 1: status label (14px semibold neutral.900)
//   - Right line 2: "By {{name}} ({{flat}}) at {{time}}" (14px neutral.600)
//   - Optional line 3: free_text body (16px neutral.900)
//   - Time format: "HH:mm, dd MMM" with active date-fns locale

import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const DOT_COLOR = {
  checking: "#12715A",
  will_resolve: "#12715A",
  need_info: "#f59e0b",
  resolved: "#047857",
  open: "#6e6e6e",
};

function resolveStatusLabel(t, kind) {
  if (kind === "checking") return t("response.checking");
  if (kind === "will_resolve") return t("response.willResolve");
  if (kind === "need_info") return t("response.needInfo");
  if (kind === "resolved") return t("response.resolved");
  return kind;
}

function formatFlat(responderFlat) {
  if (!responderFlat) return "—";
  const wing = responderFlat?.wing?.name ?? "";
  const num = responderFlat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeTime(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   response: {
 *     response_kind: string,
 *     free_text?: string|null,
 *     created_at: string,
 *     responder?: { full_name?: string },
 *     responder_flat?: { number?: string, wing?: { name?: string } },
 *   },
 *   isLast?: boolean,
 * }} props
 */
export function ResponseTrailItem({ response, isLast = false }) {
  const { t } = useTranslation("complaints");
  const kind = response?.response_kind ?? "open";
  const dotColor = DOT_COLOR[kind] ?? DOT_COLOR.open;
  const statusLabel = resolveStatusLabel(t, kind);
  const name = response?.responder?.full_name ?? "—";
  const flat = formatFlat(response?.responder_flat);
  const time = safeTime(response?.created_at);
  const byLine = t("complaint.trailBy", { name, flat, time });

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
          <View
            style={{
              flex: 1,
              width: 1,
              backgroundColor: "#e5e5e5",
              marginTop: 4,
            }}
          />
        ) : null}
      </View>

      {/* Right column: text */}
      <View className="flex-1 pb-4 gap-1">
        <Text className="text-sm font-semibold text-neutral-900" numberOfLines={2}>
          {statusLabel}
        </Text>
        <Text className="text-sm text-neutral-600" numberOfLines={2}>
          {byLine}
        </Text>
        {response?.free_text ? (
          <Text className="text-base text-neutral-900 mt-1">{response.free_text}</Text>
        ) : null}
      </View>
    </View>
  );
}
