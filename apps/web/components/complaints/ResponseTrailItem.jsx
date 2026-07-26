// ResponseTrailItem — single attributed entry in the complaint response trail (web).
//
// Visual contract per 04-UI-SPEC.md Screen 3 Section 4:
//   - Left: 12px colored circle keyed to response_kind (brand / warning / success)
//   - Connecting vertical line between items (1px neutral.200) — hidden on isLast
//   - Right line 1: status label (14px semibold neutral.900)
//   - Right line 2: "By {{name}} ({{flat}}) at {{time}}" (14px neutral.600)
//   - Optional line 3: free_text body (16px neutral.900)
//   - Time format: "HH:mm, dd MMM" (date-fns)
//   - aria-label on time element uses the full date format ("26 May 2026 at 14:32")

"use client";

import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const DOT_COLOR = {
  checking: "#12715A",
  will_resolve: "#12715A",
  need_info: "#f59e0b",
  resolved: "#047857",
  open: "#6e6e6e",
};

function resolveStatusLabel(kind, t) {
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

function safeShortTime(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

function safeFullTime(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd MMMM yyyy 'at' HH:mm");
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
  const statusLabel = resolveStatusLabel(kind, t);
  const name = response?.responder?.full_name ?? "—";
  const flat = formatFlat(response?.responder_flat);
  const shortTime = safeShortTime(response?.created_at);
  const fullTime = safeFullTime(response?.created_at);
  const byLine = t("complaint.trailBy", { name, flat, time: shortTime });

  return (
    <div className="flex gap-3">
      {/* Left rail: dot + connecting line */}
      <div className="flex flex-col items-center" style={{ width: 16, flexShrink: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: dotColor,
            marginTop: 4,
          }}
        />
        {!isLast ? (
          <div
            aria-hidden="true"
            style={{
              flex: 1,
              width: 2,
              backgroundColor: "#e5e5e5",
              marginTop: 4,
              marginLeft: 0,
            }}
          />
        ) : null}
      </div>

      {/* Right column: text */}
      <div className="flex-1 pb-4 flex flex-col gap-1 min-w-0">
        <p className="text-sm font-semibold text-[#171717]">{statusLabel}</p>
        <p className="text-sm text-[#525252]" title={`By ${name} (${flat}) at ${fullTime}`}>
          {byLine}
        </p>
        {response?.free_text ? (
          <p className="text-base text-[#171717] mt-1 break-words">{response.free_text}</p>
        ) : null}
      </div>
    </div>
  );
}
